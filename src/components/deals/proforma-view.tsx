"use client";

import {
  annualizeMonthlyCfads,
  clampHoldYears,
  formatUsd,
  runDealProforma,
  runOpCoProforma,
  type OpCoPlatformPrefs,
} from "@rcp/ledger";
import type { DealProformaSeed } from "@/lib/proforma-types";
import Link from "next/link";
import { useMemo, useState } from "react";

function centsToDollarsInput(cents: bigint | string | number): string {
  const n = typeof cents === "bigint" ? Number(cents) / 100 : Number(cents) / 100;
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n);
}

function dollarsInputToCents(raw: string): bigint {
  const t = raw.trim().replace(/[$,]/g, "");
  if (!t) return 0n;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 100));
}

function seedToInput(
  seed: DealProformaSeed,
  scenario: { holdYears: number; year1CfadsCents: bigint; cfadsGrowthBps: number; exitEquityProceedsCents: bigint },
) {
  return {
    config: seed.config,
    lpContributedCents: BigInt(seed.lpContributedCents),
    unreturnedCapitalCents: BigInt(seed.unreturnedCapitalCents),
    unpaidPrefCents: BigInt(seed.unpaidPrefCents),
    prefPaidToDateCents: BigInt(seed.prefPaidToDateCents),
    europeanPromoteOpen: seed.europeanPromoteOpen,
    entityCode: seed.entityCode,
    entityName: seed.entityName,
    ...scenario,
  };
}

export function DealProformaView({
  period,
  seed,
}: {
  period: string;
  seed: DealProformaSeed;
}) {
  const periodCfads = BigInt(seed.periodCfadsCents);
  const [holdYears, setHoldYears] = useState(5);
  const [year1, setYear1] = useState(annualizeMonthlyCfads(periodCfads));
  const [growthBps, setGrowthBps] = useState(0);
  const [exitCents, setExitCents] = useState(0n);

  const result = useMemo(
    () =>
      runDealProforma(
        seedToInput(seed, {
          holdYears: clampHoldYears(holdYears),
          year1CfadsCents: year1,
          cfadsGrowthBps: growthBps,
          exitEquityProceedsCents: exitCents,
        }),
      ),
    [seed, holdYears, year1, growthBps, exitCents],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-600">
        <strong>Deal-level proforma</strong> for {seed.entityName} ({seed.entityCode}). Forward-looking scenario — not
        historical books. Uses the currently selected waterfall
        {result.hasCoGp ? ` and Co-GP${result.coGpName ? ` (${result.coGpName})` : ""}` : " (no Co-GP; two-party LP / GP)"}.
        Year 1 CFADS defaults to this period × 12.
      </p>
      <ScenarioKnobs
        periodCfads={periodCfads}
        holdYears={holdYears}
        setHoldYears={setHoldYears}
        year1={year1}
        setYear1={setYear1}
        growthBps={growthBps}
        setGrowthBps={setGrowthBps}
        exitCents={exitCents}
        setExitCents={setExitCents}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PartyTile label="Deal LPs (total)" amount={result.totals.lpCents} />
        <PartyTile label="Deal GPs · RCP" amount={result.totals.rcpCents} />
        <PartyTile label={`Deal GPs · Co-GP${result.coGpName ? ` · ${result.coGpName}` : ""}`} amount={result.totals.coGpCents} />
        <PartyTile label="Pool (ops + exit)" amount={result.totals.poolCents} />
      </div>
      <YearTable
        rows={result.years.map((y) => ({
          label: y.label,
          pool: y.distributableCents,
          lp: y.lpCents,
          rcp: y.rcpCents,
          coGp: y.coGpCents,
        }))}
        showCoGp
      />
      <NotesList notes={result.notes} />
      <p className="text-sm">
        <Link className="text-navy-700 underline" href={`/deals/${seed.entityCode}/waterfall?entity=${seed.entityCode}&period=${period}`}>
          Edit waterfall / Co-GP
        </Link>
        {" · "}
        <Link className="text-navy-700 underline" href={`/opco/proforma?entity=RCP-OPCO&period=${period}&view=combined`}>
          OpCo proforma
        </Link>
      </p>
    </div>
  );
}

export function OpCoProformaView({
  period,
  seeds,
}: {
  period: string;
  seeds: DealProformaSeed[];
}) {
  const [holdYears, setHoldYears] = useState(5);
  const [growthBps, setGrowthBps] = useState(0);
  const [exitCents, setExitCents] = useState(0n);
  const [platPrefBps, setPlatPrefBps] = useState(0);
  const [platCapital, setPlatCapital] = useState(0n);
  const [platGpBps, setPlatGpBps] = useState(2_000);

  const result = useMemo(() => {
    const platform: OpCoPlatformPrefs | undefined =
      platPrefBps > 0 && platCapital > 0n
        ? {
            prefRateBps: platPrefBps,
            lpContributedCents: platCapital,
            lpSplitBps: 10_000 - platGpBps,
            gpSplitBps: platGpBps,
          }
        : undefined;
    return runOpCoProforma({
      deals: seeds.map((seed) =>
        seedToInput(seed, {
          holdYears: clampHoldYears(holdYears),
          year1CfadsCents: annualizeMonthlyCfads(BigInt(seed.periodCfadsCents)),
          cfadsGrowthBps: growthBps,
          exitEquityProceedsCents: exitCents,
        }),
      ),
      platform,
    });
  }, [seeds, holdYears, growthBps, exitCents, platPrefBps, platCapital, platGpBps]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-600">
        <strong>OpCo-level proforma</strong> (RCP platform). Each live SPE’s deal waterfall and Co-GP run first; RCP
        cents aggregate here as OpCo GPs. Deal LPs are shown as OpCo LPs (not upstreamed). Co-GP stays at the deal.
        Shared hold / growth / exit apply to every SPE’s annualized period CFADS. Not a budget.
      </p>
      <ScenarioKnobs
        hideYear1
        holdYears={holdYears}
        setHoldYears={setHoldYears}
        year1={0n}
        setYear1={() => undefined}
        growthBps={growthBps}
        setGrowthBps={setGrowthBps}
        exitCents={exitCents}
        setExitCents={setExitCents}
      />
      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">OpCo-level pref (optional)</h2>
        <p className="mt-1 text-sm text-ink-600">
          Leave capital at $0 to skip. When modeled, RCP cash each year is run through a simple ROC → pref → residual
          at the platform.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm text-ink-700">
            Platform pref (%)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              type="number"
              min="0"
              step="0.01"
              value={(platPrefBps / 100).toString()}
              onChange={(e) => setPlatPrefBps(Math.round(Number(e.target.value) * 100) || 0)}
            />
          </label>
          <label className="text-sm text-ink-700">
            OpCo LP capital ($)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              inputMode="decimal"
              value={centsToDollarsInput(platCapital)}
              onChange={(e) => setPlatCapital(dollarsInputToCents(e.target.value))}
            />
          </label>
          <label className="text-sm text-ink-700">
            Platform GP residual (%)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              type="number"
              min="0"
              max="100"
              value={(platGpBps / 100).toString()}
              onChange={(e) => setPlatGpBps(Math.round(Number(e.target.value) * 100) || 0)}
            />
          </label>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PartyTile label="OpCo LPs (Σ Deal LPs)" amount={result.totals.dealLpCents} />
        <PartyTile label="OpCo GPs (RCP platform)" amount={result.platformModeled ? result.totals.opcoGpCents : result.totals.dealRcpCents} />
        <PartyTile label="Deal Co-GP (not OpCo)" amount={result.totals.dealCoGpCents} />
        {result.platformModeled ? <PartyTile label="OpCo platform LP (after pref)" amount={result.totals.opcoLpCents} /> : null}
      </div>
      <YearTable
        rows={result.years.map((y) => ({
          label: y.label,
          pool: y.poolCents,
          lp: y.dealLpCents,
          rcp: y.dealRcpCents,
          coGp: y.dealCoGpCents,
          extra: result.platformModeled
            ? [
                { label: "OpCo plat. LP", amount: y.opcoLpCents },
                { label: "OpCo plat. GP", amount: y.opcoGpCents },
              ]
            : undefined,
        }))}
        showCoGp
        lpHeader="OpCo LPs (Deal LPs)"
        rcpHeader="OpCo GPs (RCP)"
      />
      {result.deals.length ? (
        <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
          <h2 className="font-display text-2xl text-navy-900">By SPE (deal waterfalls)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                  <th className="py-2 text-left">SPE</th>
                  <th className="py-2 text-left">Template</th>
                  <th className="py-2 text-right">Deal LP</th>
                  <th className="py-2 text-right">RCP</th>
                  <th className="py-2 text-right">Co-GP</th>
                </tr>
              </thead>
              <tbody>
                {result.deals.map((d) => (
                  <tr key={d.entityCode} className="border-b border-cream-200">
                    <td className="py-2">
                      <Link className="text-navy-800 underline" href={`/deals/${d.entityCode}/proforma?entity=${d.entityCode}&period=${period}`}>
                        {d.entityCode}
                      </Link>
                      <span className="ml-2 text-ink-500">{d.entityName}</span>
                    </td>
                    <td className="py-2 text-ink-600">{d.templateId.replaceAll("_", " ")}</td>
                    <td className="py-2 text-right tabular">{formatUsd(d.totals.lpCents)}</td>
                    <td className="py-2 text-right tabular">{formatUsd(d.totals.rcpCents)}</td>
                    <td className="py-2 text-right tabular">{formatUsd(d.totals.coGpCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="text-sm text-ink-600">No live SPEs to aggregate.</p>
      )}
      <NotesList notes={result.notes} />
    </div>
  );
}

function PartyTile({ label, amount }: { label: string; amount: bigint }) {
  return (
    <div className="border border-gold-400 bg-gold-50 px-4 py-3 shadow-ledger">
      <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">{label}</p>
      <p className="font-display text-3xl tabular text-navy-900">{formatUsd(amount)}</p>
    </div>
  );
}

function ScenarioKnobs({
  periodCfads,
  hideYear1,
  holdYears,
  setHoldYears,
  year1,
  setYear1,
  growthBps,
  setGrowthBps,
  exitCents,
  setExitCents,
}: {
  periodCfads?: bigint;
  hideYear1?: boolean;
  holdYears: number;
  setHoldYears: (n: number) => void;
  year1: bigint;
  setYear1: (n: bigint) => void;
  growthBps: number;
  setGrowthBps: (n: number) => void;
  exitCents: bigint;
  setExitCents: (n: bigint) => void;
}) {
  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">Scenario</h2>
      <p className="mt-1 text-sm text-ink-600">
        Hold years run the saved waterfall annually. Growth is simple annual on Year 1 CFADS. Exit proceeds are added
        to the last year — user-entered, not invented.
        {periodCfads != null ? ` This period’s CFADS ${formatUsd(periodCfads)} annualizes to ${formatUsd(annualizeMonthlyCfads(periodCfads))}.` : ""}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-ink-700">
          Hold (years)
          <input
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
            type="number"
            min="1"
            max="15"
            value={holdYears}
            onChange={(e) => setHoldYears(Number(e.target.value) || 1)}
          />
        </label>
        {hideYear1 ? null : (
          <label className="text-sm text-ink-700">
            Year 1 CFADS ($)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              inputMode="decimal"
              value={centsToDollarsInput(year1)}
              onChange={(e) => setYear1(dollarsInputToCents(e.target.value))}
            />
          </label>
        )}
        <label className="text-sm text-ink-700">
          CFADS growth (% / yr)
          <input
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
            type="number"
            min="0"
            step="0.01"
            value={(growthBps / 100).toString()}
            onChange={(e) => setGrowthBps(Math.round(Number(e.target.value) * 100) || 0)}
          />
        </label>
        <label className="text-sm text-ink-700">
          Exit equity proceeds ($)
          <input
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
            inputMode="decimal"
            value={centsToDollarsInput(exitCents)}
            onChange={(e) => setExitCents(dollarsInputToCents(e.target.value))}
          />
        </label>
      </div>
    </section>
  );
}

function YearTable({
  rows,
  showCoGp,
  lpHeader = "Deal LPs",
  rcpHeader = "RCP",
}: {
  rows: { label: string; pool: bigint; lp: bigint; rcp: bigint; coGp: bigint; extra?: { label: string; amount: bigint }[] }[];
  showCoGp?: boolean;
  lpHeader?: string;
  rcpHeader?: string;
}) {
  const extraHeaders = rows[0]?.extra?.map((e) => e.label) ?? [];
  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">Year-by-year</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
              <th className="py-2 text-left">Year</th>
              <th className="py-2 text-right">Pool</th>
              <th className="py-2 text-right">{lpHeader}</th>
              <th className="py-2 text-right">{rcpHeader}</th>
              {showCoGp ? <th className="py-2 text-right">Co-GP</th> : null}
              {extraHeaders.map((h) => (
                <th key={h} className="py-2 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-cream-200">
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-right tabular">{formatUsd(row.pool)}</td>
                <td className="py-2 text-right tabular">{formatUsd(row.lp)}</td>
                <td className="py-2 text-right tabular">{formatUsd(row.rcp)}</td>
                {showCoGp ? <td className="py-2 text-right tabular">{formatUsd(row.coGp)}</td> : null}
                {row.extra?.map((e) => (
                  <td key={e.label} className="py-2 text-right tabular">
                    {formatUsd(e.amount)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotesList({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-1 text-sm text-ink-600">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}
