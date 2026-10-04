import { DecisionButtons, IncomeIdeaForm, WeeklyUpdateForm } from "@/components/asset-mgmt/plan-forms";
import { PeriodBanner } from "@/components/period-banner";
import { Shell } from "@/components/shell";
import { PLAN_NOT_OWNED, PLAN_SETUP, parsePlanPeriod } from "@/lib/asset-mgmt/policy";
import { isMissingPlanTable, loadStoredPlan, readPlanBooks } from "@/lib/asset-mgmt/load";
import { buildPageModel } from "@/lib/asset-mgmt/view";
import { currentAccessRole } from "@/lib/access-server";
import { listPeriodLabels } from "@/lib/deals/periods";
import { isOwnedSpe } from "@/lib/owned-spe";
import { prisma } from "@/lib/prisma";
import { listEntities } from "@/lib/queries";
import { resolveReportingPeriod } from "@/lib/period-default";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["plan", "Overview"],
  ["pricing", "Pricing and market"],
  ["vacancy", "Vacancy and leases"],
  ["income", "Income ideas"],
  ["benchmarks", "Benchmarks"],
  ["log", "Tracking log"],
] as const;

type Section = (typeof SECTIONS)[number][0];

function isSection(value: string | undefined): value is Section {
  return SECTIONS.some((row) => row[0] === value);
}

export default async function AssetPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ period?: string; section?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const entity = await prisma.entity.findUnique({ where: { code: code.toUpperCase() } });
  if (!entity || entity.type !== "SPE") notFound();
  const section: Section = isSection(query.section) ? query.section : "plan";
  const requestedLabel = query.period?.trim() ? query.period.trim() : await resolveReportingPeriod(entity.code);
  const requested = parsePlanPeriod(requestedLabel);
  const [entities, periodLabels, role] = await Promise.all([
    listEntities({ includeArchived: true }),
    listPeriodLabels(),
    currentAccessRole(),
  ]);
  const owned = isOwnedSpe(entity);
  const year = requested?.year ?? 2026;
  const month = requested?.month ?? 8;
  const books = owned && requested
    ? await readPlanBooks({
        entityId: entity.id,
        entityCode: entity.code,
        year,
        month,
        dealUnitCount: entity.unitCountOverride ?? entity.unitCount,
        businessPlanNote: entity.businessPlan,
        includePeers: true,
      })
    : null;
  let stored = await emptyStored();
  let setupPending = false;
  if (owned) {
    try {
      stored = await loadStoredPlan(entity.id);
    } catch (error) {
      if (!isMissingPlanTable(error)) throw error;
      setupPending = true;
    }
  }
  if (books) {
    books.facts.observations = stored.observations;
    books.facts.opportunities = stored.opportunities;
  }
  const shownYear = books?.year ?? year;
  const shownMonth = books?.month ?? month;
  const period = `${shownYear}-${String(shownMonth).padStart(2, "0")}`;
  const dealUnits = entity.unitCountOverride ?? entity.unitCount;
  const model = books
    ? buildPageModel({
        name: entity.name,
        code: entity.code,
        owned,
        canEdit: role === "principal" && !setupPending,
        facts: books.facts,
        stored,
        dealUnitCountLabel: dealUnits == null ? "Not on the deal record" : String(dealUnits),
        budgetRows: books.budgetRows,
      })
    : null;
  const href = (next: Section) => `/deals/${entity.code}/plan?entity=${entity.code}&period=${period}&section=${next}`;

  return (
    <Shell
      entities={entities.map((row) => ({ code: row.code, name: row.name, type: row.type, unitCount: row.unitCount, strategy: row.strategy }))}
      activeEntity={entity.code}
      year={shownYear}
      month={shownMonth}
      consolidated={false}
      pathname={`/deals/${entity.code}/plan`}
      periodLabels={periodLabels}
    >
      {books?.periodStatus ? <PeriodBanner status={books.periodStatus} entityCode={entity.code} period={period} /> : null}
      {books?.fellBack ? (
        <p className="mb-4 border border-cream-300 bg-white px-5 py-4 text-sm text-ink-700">
          {requestedLabel} is not on file. Showing {period}. This page does not open a month.
        </p>
      ) : null}
      {!requested ? (
        <p className="mb-4 border border-cream-300 bg-white px-5 py-4 text-sm text-ink-700">Pick a month from 1990 through 2100, such as 2026-08.</p>
      ) : null}
      {setupPending ? <p className="mb-4 border border-cream-300 bg-white px-5 py-4 text-sm text-ink-700">{PLAN_SETUP}</p> : null}
      {!owned ? (
        <div className="space-y-4">
          <h1 className="font-display text-4xl text-navy-900">Asset plan</h1>
          <p className="border border-cream-300 bg-white px-5 py-4 text-sm text-ink-700">{PLAN_NOT_OWNED} Peer figures and recommendations are not shown for a Pipeline, Test, or Archived deal.</p>
        </div>
      ) : model ? (
        <PlanSections model={model} entityCode={entity.code} period={period} section={section} href={href} />
      ) : null}
    </Shell>
  );
}

async function emptyStored(): Promise<Awaited<ReturnType<typeof loadStoredPlan>>> {
  return { status: null, lastAnalyzedAt: null, blendMethodVersion: null, observations: [], opportunities: [], events: [] };
}

function PlanSections({
  model,
  entityCode,
  period,
  section,
  href,
}: {
  model: ReturnType<typeof buildPageModel>;
  entityCode: string;
  period: string;
  section: Section;
  href: (next: Section) => string;
}) {
  const entity = { code: entityCode };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{entity.code} · {period}</p>
        <h1 className="font-display text-4xl text-navy-900">Asset plan</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-700">{model.summary}</p>
        <p className="mt-2 text-sm text-ink-700">
          Status {model.status}. Last saved score {model.lastAnalyzed}. Blend method {model.blendVersion}. {model.pmsNote}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="text-navy-800 underline" href={`/deals/${entity.code}?period=${period}`}>Deal profile</Link>
          <Link className="text-navy-800 underline" href={`/properties/${entity.code}?entity=${entity.code}&period=${period}`}>Rent roll</Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map(([id, label]) => (
          <Link key={id} href={href(id)} className={`px-3 py-2 text-[12px] uppercase tracking-[0.14em] ${section === id ? "bg-navy-900 text-cream-50" : "border border-cream-300 bg-white text-navy-900"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {section === "plan" ? <Overview model={model} /> : null}
      {section === "pricing" ? <Pricing model={model} code={entity.code} period={period} /> : null}
      {section === "vacancy" ? <Vacancy model={model} /> : null}
      {section === "income" ? <Income model={model} code={entity.code} period={period} /> : null}
      {section === "benchmarks" ? <Benchmarks model={model} /> : null}
      {section === "log" ? <Log model={model} /> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-ink-700">{children}</div>
    </section>
  );
}

function Overview({ model }: { model: ReturnType<typeof buildPageModel> }) {
  return (
    <>
      <Card title="Property">
        <p>{model.name}. Deal unit count {model.unitCount}. Rentable units {model.rentable}. RevPAU {model.revpau}. {model.revpauSource}</p>
        <p>NOI margin {model.noiMargin}. {model.noiMarginSource}</p>
        <p>{model.targetNote}{model.businessPlan ? ` Business plan note on the deal, not a monthly target: ${model.businessPlan}` : ""}</p>
      </Card>
      <Card title="Dollars at stake">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.14em] text-ink-500">
                <th className="py-2 pr-3">Lever</th>
                <th className="py-2 pr-3">Figure</th>
                <th className="py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {model.levers.map((row) => (
                <tr key={row.title} className="border-b border-cream-200">
                  <td className="py-2 pr-3">{row.title}</td>
                  <td className="py-2 pr-3 tabular">{row.dollars}<div className="text-ink-500">{row.detail}</div></td>
                  <td className="py-2">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Ranked recommendations">
        <p>Ordered by operating-margin dollars, then by the RevPAU effect. A missing figure stays blank. It is not treated as zero.</p>
        {model.recommendations.map((row) => (
          <article key={row.title} className="border-t border-cream-200 pt-3">
            <p className="font-medium text-navy-900">{row.title}</p>
            <p>Effect {row.impact}. RevPAU change {row.revpau}. {row.confidence}. {row.status}.</p>
            <p>{row.reason}</p>
            <p className="text-ink-500">{row.source}</p>
          </article>
        ))}
      </Card>
      <Card title="What changed">
        <p>{model.changedNote}</p>
        {model.changed.map((row) => (
          <p key={row.label}><span className="text-navy-900">{row.label}.</span> Before: {row.before}. After: {row.after}. {row.cause}</p>
        ))}
      </Card>
    </>
  );
}

function Pricing({ model, code, period }: { model: ReturnType<typeof buildPageModel>; code: string; period: string }) {
  return (
    <>
      <Card title="Pricing by floor plan">
        <p>{model.blendStatement} Illustrative RevPAU {model.illustrative}. {model.illustrativeNote}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.14em] text-ink-500">
                <th className="py-2 pr-3">Floor plan</th>
                <th className="py-2 pr-3">In-place</th>
                <th className="py-2 pr-3">Rent-roll market</th>
                <th className="py-2 pr-3">Concession</th>
                <th className="py-2">Lease</th>
              </tr>
            </thead>
            <tbody>
              {model.floorplans.map((row) => (
                <tr key={row.floorplan} className="border-b border-cream-200">
                  <td className="py-2 pr-3">{row.floorplan}<div className="text-ink-500">{row.occupied} occupied · {row.vacant} vacant</div></td>
                  <td className="py-2 pr-3 tabular">{row.inPlace}</td>
                  <td className="py-2 pr-3 tabular">{row.market}<div className="text-ink-500">Not overwritten</div></td>
                  <td className="py-2 pr-3 tabular">{row.concession}</td>
                  <td className="py-2">{row.lease}<div>{row.recommendation}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {model.floorplans.length === 0 ? <p>No rent roll on file.</p> : null}
      </Card>
      <Card title="Market observations">
        <p>{model.observationNote}</p>
        {model.observations.map((row) => (
          <article key={row.id} className="border-t border-cream-200 pt-3">
            <p className="text-navy-900">{row.source} · {row.geography} · {row.floorplan}</p>
            <p>Value {row.value}. Range {row.range}. Trend {row.trend}. Specials {row.specials}.</p>
            <p>As of {row.asOf}. {row.vintage}. Retrieved {row.retrieved}. {row.stale ? "Stale." : "Current for this period."}</p>
            <p>{row.terms}</p>
          </article>
        ))}
        {model.canEdit ? (
          <div className="border-t border-cream-200 pt-3">
            <h3 className="font-display text-xl text-navy-900">Add a weekly update</h3>
            <p className="mb-3">Public asking rents and specials only. This does not call a listing site.</p>
            <WeeklyUpdateForm code={code} period={period} />
          </div>
        ) : (
          <p>Partner view is read-only. Unlock to update the asset plan.</p>
        )}
      </Card>
    </>
  );
}

function Vacancy({ model }: { model: ReturnType<typeof buildPageModel> }) {
  return (
    <>
      <Card title="Vacancy">
        <p>{model.exposure}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.14em] text-ink-500">
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Days vacant</th>
                <th className="py-2 pr-3">Lost rent / day</th>
                <th className="py-2">What the file shows</th>
              </tr>
            </thead>
            <tbody>
              {model.vacant.map((row) => (
                <tr key={row.unitCode} className="border-b border-cream-200">
                  <td className="py-2 pr-3">{row.unitCode}<div className="text-ink-500">{row.floorplan}</div></td>
                  <td className="py-2 pr-3">{row.status}</td>
                  <td className="py-2 pr-3">{row.days}</td>
                  <td className="py-2 pr-3 tabular">{row.lostPerDay}</td>
                  <td className="py-2">{row.fix}. {row.evidence} Ready date {row.ready}.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {model.vacant.length === 0 ? <p>No vacant or down units on the rent roll.</p> : null}
      </Card>
      <Card title="Lease ladder">
        <p>{model.ladder.target} {model.ladder.tradeout}</p>
        <p>Renewals in the next 90 days: {model.ladder.upcomingRenewals == null ? "Not available" : model.ladder.upcomingRenewals}. Occupied units with no lease-end date: {model.ladder.missingLeaseEnd == null ? "Not available" : model.ladder.missingLeaseEnd}.</p>
        {model.ladder.months.map((row) => <p key={row.month}>{row.month}: {row.count} occupied {row.count === 1 ? "lease" : "leases"}.</p>)}
        <p>{model.concessionNote}</p>
      </Card>
      <Card title="Turns and collections totals">
        <p>{model.turns}</p>
        <p>Make-ready {model.makeReady}. {model.makeReadySource}</p>
        <p>Bad debt {model.badDebt}.</p>
        <p>Receivables {model.arControl}</p>
        <p>{model.collectionsNote}</p>
      </Card>
    </>
  );
}

function Income({ model, code, period }: { model: ReturnType<typeof buildPageModel>; code: string; period: string }) {
  return (
    <>
      <Card title="Income ideas">
        <p>The app records the decision. It does not add a charge or change a lease.</p>
        {model.opportunities.map((row) => (
          <article key={row.id} className="border-t border-cream-200 pt-3">
            <p className="text-navy-900">{row.category}: {row.title} · {row.status}</p>
            <p>Current {row.current}. Full rollout {row.full}. Setup {row.setup}. Payback {row.payback}.</p>
            <p>Owner {row.owner}. {row.steps}</p>
            <p>{row.legal}</p>
            <p>{row.needs}</p>
            {model.canEdit && row.status === "IDEA" ? <DecisionButtons code={code} period={period} opportunityId={row.id} /> : null}
          </article>
        ))}
        {model.opportunities.length === 0 ? <p>No income idea yet.</p> : null}
        {model.canEdit ? (
          <div className="border-t border-cream-200 pt-3">
            <h3 className="font-display text-xl text-navy-900">Add an idea</h3>
            <IncomeIdeaForm code={code} period={period} />
          </div>
        ) : (
          <p>Partner view is read-only. Unlock to update the asset plan.</p>
        )}
      </Card>
      <Card title="Other income and utility recovery">
        {model.booksNote ? <p>{model.booksNote}</p> : null}
        <p>Utility recovery {model.recovery}. Blank means the denominator is missing, not zero.</p>
        {model.incomeLines.map((row) => <p key={row.code}>{row.code} {row.label}: {row.amount}</p>)}
        {model.utilityLines.map((row) => <p key={row.code}>{row.code} {row.label}: {row.amount}</p>)}
      </Card>
    </>
  );
}

function Benchmarks({ model }: { model: ReturnType<typeof buildPageModel> }) {
  return (
    <>
      <Card title="Payroll and controllable expenses">
        <p>Payroll per unit {model.payrollPerUnit}. Payroll per occupied unit {model.payrollPerOccupied}. Controllable opex per unit {model.opexPerUnit}. Property management fee {model.pmFee} of EGI.</p>
        <p>{model.peerNote} Staffing changes are not sent to a manager.</p>
        {model.peers.map((row) => <p key={row.code}>{row.code}: payroll {row.payroll} per unit, controllable opex {row.opex} per unit, PM fee {row.pmFee}.</p>)}
      </Card>
      <Card title="Budget versus actual">
        {model.budgetRows.length === 0 ? <p>No budget comparison for this period. Either the books have no activity, or no budget lines are stored.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {model.budgetRows.map((row) => (
                <tr key={`${row.code}-${row.label}`} className="border-b border-cream-200">
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 pr-3 tabular">{row.actual}</td>
                  <td className="py-2 pr-3">{row.budget}</td>
                  <td className="py-2 tabular">{row.variance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Loan reserve and covenant">
        {model.loan ? (
          <>
            <p>{model.loan.name}</p>
            <p>Reserve requirement {model.loan.reserveRequirement}. Reserve cash {model.loan.reserveCash}.</p>
            <p>DSCR {model.loan.dscr}. Threshold {model.loan.dscrThreshold}.</p>
            <p>Debt yield {model.loan.debtYield}. Threshold {model.loan.debtYieldThreshold}.</p>
            <p>{model.loan.note}</p>
          </>
        ) : (
          <p>{model.loanMissing}</p>
        )}
      </Card>
      <Card title="Business plan versus actual">
        {model.underwriting ? (
          <>
            <p>Snapshot {model.underwriting.period}, recorded {model.underwriting.recorded}. {model.underwriting.basis}</p>
            <p>Snapshot period NOI {model.underwriting.snapshotNoi}. Annualized {model.underwriting.annualized}. This month {model.underwriting.actual}.</p>
            <p>Variance {model.underwriting.variance}. {model.underwriting.varianceNote}</p>
          </>
        ) : (
          <p>{model.underwritingMissing}</p>
        )}
      </Card>
    </>
  );
}

function Log({ model }: { model: ReturnType<typeof buildPageModel> }) {
  return (
    <Card title="Tracking log">
      <p>Entries are added, not deleted. {model.pmsNote}</p>
      {model.log.length === 0 ? <p>No tracking entries yet. Approve an income idea or save a weekly update to start the log.</p> : null}
      {model.log.map((row) => (
        <article key={row.id} className="border-t border-cream-200 pt-3">
          <p className="text-navy-900">{row.when} · {row.kind} · {row.actor}</p>
          <p>{row.reason}</p>
          {row.owner ? <p>Owner {row.owner}. Status {row.status ?? "not set"}. Expected effect {row.effect}.</p> : null}
          <p className="text-ink-500">{row.note}</p>
        </article>
      ))}
    </Card>
  );
}
