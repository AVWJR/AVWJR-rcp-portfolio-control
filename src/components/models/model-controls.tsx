"use client";

import { CriteriaBuilder } from "@/components/library/criteria-builder";
import type { Criterion, CriterionField } from "@/lib/library/criteria";
import { FEE_NEEDED, GA_BUDGET_NEEDED } from "@/lib/library/fees";
import { RETURNS_BASIS } from "@/lib/returns/project-deal";
import { MAX_COMPARE } from "@/lib/models/membership";
import type { ModelView } from "@/lib/models/view";
import { staleFlagLabel, type StaleLevel } from "@/lib/library/staleness";
import { FEE_ACCRUED_UNPAID_NOTE, formatUsd } from "@rcp/ledger";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function money(cents: number | null): string {
  if (cents == null) return "—";
  return formatUsd(BigInt(Math.round(cents)));
}

function percent(bps: number | null): string {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

function multiple(bps: number | null): string {
  if (bps == null) return "—";
  return `${(bps / 10_000).toFixed(2)}x`;
}

function show(bps: number | null, gap: string | null, format: (value: number | null) => string): string {
  if (gap) return gap;
  return format(bps);
}

function showIrr(bps: number | null, gap: string | null, note: string | null, format: (value: number | null) => string = percent): string {
  if (gap) return gap;
  if (bps != null && note) return `${format(bps)} · ${note}`;
  if (bps == null && note) return note;
  return format(bps);
}

function irrRange(min: number | null, max: number | null, gaps: string[], noEquity: string[]): string {
  const parts: string[] = [];
  if (min != null && max != null) parts.push(`${percent(min)} – ${percent(max)}`);
  if (gaps.length) parts.push(`exit value needed: ${gaps.join(", ")}`);
  if (noEquity.length) parts.push(`no LP equity: ${noEquity.join(", ")}`);
  return parts.length ? parts.join(" · ") : "—";
}

function cashNote(note: string, accruedCents: number | null): string {
  if (note === FEE_ACCRUED_UNPAID_NOTE && accruedCents != null && accruedCents > 0) return `${note} · ${money(accruedCents)}`;
  return note;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not save the Model.");
  return json;
}

export function ModelList({
  models,
  periodQuery,
}: {
  models: { id: string; name: string; kind: string; deals: number }[];
  periodQuery: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("LIVE");
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((row) => row !== id);
      if (current.length >= MAX_COMPARE) return current;
      return [...current, id];
    });
  }

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      await send("/api/models", "POST", { name, kind });
      setName("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the Model.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(id: string) {
    setBusy(true);
    try {
      await send(`/api/models/${id}/copy`, "POST");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not copy the Model.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await send(`/api/models/${id}`, "DELETE");
      setPicked((current) => current.filter((row) => row !== id));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the Model.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="border border-cream-300 bg-cream-50 p-4">
        <h2 className="font-display text-2xl text-navy-900">New Model</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-700">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block border border-cream-300 bg-white px-3 py-2 text-sm text-navy-900" />
          </label>
          <label className="text-sm text-ink-700">
            Kind
            <select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 block border border-cream-300 bg-white px-3 py-2 text-sm text-navy-900">
              <option value="LIVE">Live</option>
              <option value="TEST">Test</option>
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void create()} className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-40">
            Create Model
          </button>
        </div>
        {message ? <p className="mt-2 text-sm text-navy-900">{message}</p> : null}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={picked.length ? `/models/compare?ids=${picked.join(",")}&${periodQuery}` : `/models/compare?${periodQuery}`}
          className="bg-gold-500 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950"
        >
          Compare {picked.length} of {MAX_COMPARE}
        </Link>
        <Link href={`/models/fees?${periodQuery}`} className="text-sm text-navy-800 underline">
          Fees settings
        </Link>
      </div>
      <ul className="divide-y divide-cream-300 border border-cream-300 bg-white">
        {models.length === 0 ? <li className="p-4 text-sm text-ink-700">No Models yet.</li> : null}
        {models.map((model) => (
          <li key={model.id} className="flex flex-wrap items-center gap-3 p-4">
            <input type="checkbox" checked={picked.includes(model.id)} onChange={() => toggle(model.id)} aria-label={`Compare ${model.name}`} />
            <div className="min-w-0 flex-1">
              <Link href={`/models/${model.id}?${periodQuery}`} className="font-display text-xl text-navy-900 underline">
                {model.name}
              </Link>
              <p className="text-xs uppercase tracking-[0.14em] text-ink-600">
                {model.kind === "TEST" ? "Test Model" : "Model"} · {model.deals} {model.deals === 1 ? "deal" : "deals"} · Projection, not books.
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => void copy(model.id)} className="border border-navy-900 px-3 py-1 text-[12px] uppercase tracking-[0.14em] text-navy-900">
              Copy
            </button>
            <button type="button" disabled={busy} onClick={() => void remove(model.id)} className="border border-navy-900 px-3 py-1 text-[12px] uppercase tracking-[0.14em] text-navy-900">
              Delete Model
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ModelDetail({
  view,
  choices,
  deals,
  periodQuery,
}: {
  view: ModelView;
  choices: Partial<Record<CriterionField, string[]>>;
  deals: { code: string; name: string; status: string }[];
  periodQuery: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState(deals[0]?.code ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passing = view.deals.filter((deal) => !deal.excluded).length;

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      await send(`/api/models/${view.id}/deals`, "POST", { code });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the deal.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(dealCode: string) {
    setBusy(true);
    setMessage(null);
    try {
      await send(`/api/models/${view.id}/deals`, "DELETE", { code: dealCode });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the deal.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCriteria(next: Criterion[]) {
    setMessage(null);
    try {
      await send(`/api/models/${view.id}/criteria`, "PUT", { criteria: next });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the criteria.");
    }
  }

  return (
    <div className="space-y-6">
      <p className="border border-gold-500 bg-gold-100 px-3 py-2 text-sm text-navy-950">{view.label} Returns are {RETURNS_BASIS}.</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-navy-800 underline" href={`/models/${view.id}/assumptions?${periodQuery}`}>Assumptions</Link>
        <Link className="text-navy-800 underline" href={`/models/compare?ids=${view.id}&${periodQuery}`}>Compare</Link>
        <Link className="text-navy-800 underline" href={`/models/fees?${periodQuery}`}>Fees settings</Link>
        <Link className="text-navy-800 underline" href={`/models?${periodQuery}`}>All Models</Link>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="LP net IRR" value={showIrr(view.lpNetIrrBps, view.lpGap, view.lpIrrNote)} />
        <Metric label="LP cash yield Y1" value={show(view.lpYear1YieldBps, view.lpGap, percent)} />
        <Metric label="LP cash yield avg" value={show(view.lpAvgYieldBps, view.lpGap, percent)} />
        <Metric label="LP IRR range" value={irrRange(view.lpIrrMinBps, view.lpIrrMaxBps, view.lpIrrGapDeals, view.noLpEquityDeals)} />
        <Metric label="RCP cash-on-cash Y1" value={show(view.rcpCashOnCashBps, view.rcpGap, percent)} />
        <Metric label="RCP IRR" value={showIrr(view.rcpIrrBps, view.rcpGap, view.rcpIrrNote)} />
        <Metric label="RCP equity multiple" value={showIrr(view.rcpEquityMultipleBps, view.rcpGap, view.rcpMultipleNote, multiple)} />
        <Metric label="Equity required" value={money(view.equityRequiredCents)} />
        <Metric label="Fee income / year" value={view.cashGap ?? money(view.feeIncomeCents)} />
        <Metric label="G&A coverage" value={view.gaGap ?? multiple(view.gaCoverageBps)} />
        {view.feeAccruedUnpaidCents != null && view.feeAccruedUnpaidCents > 0 ? (
          <Metric label="Fee accrued, unpaid" value={money(view.feeAccruedUnpaidCents)} />
        ) : null}
        <Metric label="Portfolio DSCR" value={multiple(view.dscrBps)} />
        <Metric label="Portfolio debt yield" value={percent(view.debtYieldBps)} />
      </section>
      <section>
        <h2 className="font-display text-2xl text-navy-900">Cash by year</h2>
        <div className="mt-2 overflow-x-auto border border-cream-300">
          <table className="min-w-full text-sm">
            <thead className="bg-cream-100 text-left text-[11px] uppercase tracking-[0.12em] text-ink-600">
              <tr>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">RCP cash</th>
                <th className="px-3 py-2">LP cash</th>
                <th className="px-3 py-2">Fee income</th>
              </tr>
            </thead>
            <tbody>
              {view.years.map((row) => (
                <tr key={row.year} className="border-t border-cream-300">
                  <td className="px-3 py-2">Year {row.year}</td>
                  <td className="px-3 py-2">{view.cashGap ?? money(row.rcpCents)}</td>
                  <td className="px-3 py-2">{view.cashGap ?? money(row.lpCents)}</td>
                  <td className="px-3 py-2">{view.cashGap ?? money(row.feeIncomeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl text-navy-900">Deals</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-700">
            Add a deal
            <select value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 block border border-cream-300 bg-white px-3 py-2 text-sm">
              {deals.map((deal) => (
                <option key={deal.code} value={deal.code}>{deal.code} · {deal.name} · {deal.status}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || !code} onClick={() => void add()} className="bg-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-40">
            Add deal
          </button>
        </div>
        <ul className="mt-3 divide-y divide-cream-300 border border-cream-300 bg-white">
          {view.deals.map((deal) => (
            <li key={deal.code} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div>
                <p className="text-navy-900">{deal.name} <span className="text-ink-600">{deal.code}</span></p>
                <p className="text-xs uppercase tracking-[0.12em] text-ink-600">
                  {deal.dealStatus}
                  {deal.flag ? ` · ${deal.flag}` : ""}
                  {deal.optimizerEligible ? " · optimizer eligible" : " · not optimizer eligible"}
                  {staleFlagLabel(deal.stale as StaleLevel) ? ` · ${staleFlagLabel(deal.stale as StaleLevel)}` : ""}
                </p>
                {deal.gap ? <p className="text-sm text-gold-700">{deal.gap}</p> : null}
                {deal.excluded ? <p className="text-sm text-navy-900">{deal.exclusions.join(" · ")}</p> : (
                  <p className="text-sm text-ink-700">
                    LP net IRR {showIrr(deal.lpNetIrrBps, null, deal.lpIrrNote)} · Y1 {percent(deal.lpYear1YieldBps)} · avg {percent(deal.lpAvgYieldBps)}
                  </p>
                )}
                {deal.notes.map((note) => (
                  <p key={note} className="text-sm text-gold-700">{cashNote(note, deal.feeAccruedUnpaidCents)}</p>
                ))}
              </div>
              <button type="button" disabled={busy} onClick={() => void remove(deal.code)} className="border border-navy-900 px-3 py-1 text-[12px] uppercase tracking-[0.14em]">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl text-navy-900">Concentration</h2>
        <ul className="mt-2 divide-y divide-cream-300 border border-cream-300 bg-white text-sm">
          {view.concentration.map((row) => (
            <li key={`${row.dimension}-${row.label}`} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>{row.dimension}: {row.label}</span>
              <span>{money(row.equityCents)} · {(row.shareBps / 100).toFixed(2)}%</span>
            </li>
          ))}
        </ul>
      </section>
      <CriteriaBuilder
        criteria={view.criteria}
        onChange={(next) => void saveCriteria(next)}
        passCount={passing}
        totalCount={view.deals.length}
        choices={choices}
      />
      {view.notes.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
          {view.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
      {message ? <p className="text-sm text-navy-900">{message}</p> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cream-300 bg-cream-50 p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-600">{label}</p>
      <p className="mt-1 text-lg text-navy-900">{value}</p>
    </div>
  );
}

export function AssumptionsForm({ view, periodQuery }: { view: ModelView; periodQuery: string }) {
  const router = useRouter();
  const [holdYears, setHoldYears] = useState(String(view.assumptions.holdYears));
  const [growthPercent, setGrowthPercent] = useState(String(view.assumptions.growthPercent));
  const [exitCapPercent, setExitCapPercent] = useState(view.assumptions.exitCapPercent == null ? "" : String(view.assumptions.exitCapPercent));
  const [opcoPrefPercent, setOpcoPrefPercent] = useState(view.assumptions.opcoPrefPercent == null ? "" : String(view.assumptions.opcoPrefPercent));
  const [opcoPrefCapitalUsd, setOpcoPrefCapitalUsd] = useState(
    view.assumptions.opcoPrefCapitalCents == null ? "" : (view.assumptions.opcoPrefCapitalCents / 100).toFixed(2),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await send(`/api/models/${view.id}/assumptions`, "PUT", {
        holdYears: Number(holdYears),
        growthPercent: Number(growthPercent || 0),
        exitCapPercent: exitCapPercent.trim() === "" ? "" : Number(exitCapPercent),
        opcoPrefPercent: opcoPrefPercent.trim() === "" ? "" : Number(opcoPrefPercent),
        opcoPrefCapitalUsd: opcoPrefCapitalUsd.trim(),
      });
      setMessage("Assumptions saved. Projection, not books.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save assumptions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-xl space-y-3 border border-cream-300 bg-cream-50 p-4">
      <p className="text-sm text-navy-900">{view.label} Blank exit value and blank OpCo pref stay blank.</p>
      <label className="block text-sm">Hold years<input className="mt-1 w-full border border-cream-300 px-3 py-2" value={holdYears} onChange={(event) => setHoldYears(event.target.value)} /></label>
      <label className="block text-sm">CFADS growth (%)<input className="mt-1 w-full border border-cream-300 px-3 py-2" value={growthPercent} onChange={(event) => setGrowthPercent(event.target.value)} /></label>
      <label className="block text-sm">Exit cap rate (%)<input className="mt-1 w-full border border-cream-300 px-3 py-2" placeholder="not set" value={exitCapPercent} onChange={(event) => setExitCapPercent(event.target.value)} /></label>
      <label className="block text-sm">OpCo pref (%)<input className="mt-1 w-full border border-cream-300 px-3 py-2" placeholder="not set" value={opcoPrefPercent} onChange={(event) => setOpcoPrefPercent(event.target.value)} /></label>
      <label className="block text-sm">OpCo pref capital (USD)<input className="mt-1 w-full border border-cream-300 px-3 py-2" placeholder="not set" value={opcoPrefCapitalUsd} onChange={(event) => setOpcoPrefCapitalUsd(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void save()} className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-40">Save assumptions</button>
      <Link className="ml-3 text-sm text-navy-800 underline" href={`/models/${view.id}?${periodQuery}`}>Back to Model</Link>
      {message ? <p className="text-sm text-navy-900">{message}</p> : null}
    </section>
  );
}

export function ModelFeesForm({ gaBudgetCents }: { gaBudgetCents: number | null }) {
  const router = useRouter();
  const [ga, setGa] = useState(gaBudgetCents == null ? "" : (gaBudgetCents / 100).toFixed(2));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await send("/api/models/fees", "POST", { gaBudgetUsd: ga });
      setMessage(ga.trim() ? "G&A budget saved." : GA_BUDGET_NEEDED);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save G&A.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-xl border border-cream-300 bg-cream-50 p-4">
      <p className="text-sm text-ink-700">
        OpCo G&amp;A is one budget for every Model. Deal AM fees and other LP fees are typed on the deal profile. A blank budget stays {GA_BUDGET_NEEDED}. A blank deal fee stays {FEE_NEEDED}. Nothing here is guessed, and nothing is posted to the books.
      </p>
      <label className="mt-3 block text-sm">
        OpCo G&amp;A budget (USD)
        <input className="mt-1 w-full border border-cream-300 px-3 py-2" value={ga} placeholder={GA_BUDGET_NEEDED} onChange={(event) => setGa(event.target.value)} />
      </label>
      {ga.trim() ? null : <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gold-700">{GA_BUDGET_NEEDED}</p>}
      <button type="button" disabled={busy} onClick={() => void save()} className="mt-3 bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-40">
        Save G&amp;A
      </button>
      {message ? <p className="mt-2 text-sm text-navy-900">{message}</p> : null}
    </section>
  );
}

export function ModelCompare({ views }: { views: ModelView[] }) {
  if (!views.length) return <p className="text-sm text-ink-700">Pick up to {MAX_COMPARE} Models on the Models list.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {views.map((view) => (
        <article key={view.id} className="border border-cream-300 bg-cream-50 p-4">
          <h2 className="font-display text-2xl text-navy-900">{view.name}</h2>
          <p className="text-xs uppercase tracking-[0.14em] text-gold-700">{view.label}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt>LP net IRR</dt><dd>{showIrr(view.lpNetIrrBps, view.lpGap, view.lpIrrNote)}</dd></div>
            <div className="flex justify-between gap-3"><dt>LP yield Y1 / avg</dt><dd>{show(view.lpYear1YieldBps, view.lpGap, percent)} / {show(view.lpAvgYieldBps, view.lpGap, percent)}</dd></div>
            <div className="flex justify-between gap-3"><dt>RCP IRR</dt><dd>{showIrr(view.rcpIrrBps, view.rcpGap, view.rcpIrrNote)}</dd></div>
            <div className="flex justify-between gap-3"><dt>RCP multiple</dt><dd>{showIrr(view.rcpEquityMultipleBps, view.rcpGap, view.rcpMultipleNote, multiple)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Basis</dt><dd>{RETURNS_BASIS}</dd></div>
            <div className="flex justify-between gap-3"><dt>G&amp;A coverage</dt><dd>{view.gaGap ?? multiple(view.gaCoverageBps)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Equity required</dt><dd>{money(view.equityRequiredCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Deals</dt><dd>{view.deals.length}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
