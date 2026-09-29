"use client";

import {
  applyWaterfallTemplate,
  catchUpRowLabel,
  formatUsd,
  residualPromoteSplit,
  resolveUnpaidPrefCents,
  resolveUnreturnedCapitalCents,
  WATERFALL_TEMPLATE_IDS,
  WATERFALL_TEMPLATE_META,
  runWaterfall,
  type WaterfallCompounding,
  type WaterfallConfig,
  type WaterfallTemplateId,
  type WaterfallTier,
} from "@rcp/ledger";
import { centsToDollarsInput, dollarsInputToOptionalCents } from "@/lib/waterfall-inputs";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type FormState = WaterfallConfig & {
  lpContributedCents: bigint;
  unreturnedCapitalCents: bigint | null;
  unpaidPrefCents: bigint | null;
  prefPaidToDateCents: bigint;
};

function lockCatchUpTier(state: FormState): FormState {
  const residual = residualPromoteSplit(state.tiers);
  if (!residual || !state.tiers.some((tier) => tier.kind === "CATCH_UP")) return state;
  let changed = false;
  const tiers = state.tiers.map((tier) => {
    if (tier.kind !== "CATCH_UP") return tier;
    const label = catchUpRowLabel(state.catchUpBps, residual.lpSplitBps, residual.gpSplitBps);
    if (tier.lpSplitBps === residual.lpSplitBps && tier.gpSplitBps === residual.gpSplitBps && tier.label === label) {
      return tier;
    }
    changed = true;
    return { ...tier, lpSplitBps: residual.lpSplitBps, gpSplitBps: residual.gpSplitBps, label };
  });
  return changed ? { ...state, tiers } : state;
}

export function WaterfallForm({
  entityCode,
  entityName,
  period,
  initial,
  distributableCents,
  cashCents,
  europeanPromoteOpen,
}: {
  entityCode: string;
  entityName: string;
  period: string;
  initial: FormState;
  distributableCents: string;
  cashCents: string;
  europeanPromoteOpen: boolean;
}) {
  const router = useRouter();
  const [form, setFormState] = useState<FormState>(() => lockCatchUpTier(initial));

  function setForm(updater: FormState | ((prev: FormState) => FormState)) {
    setFormState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return lockCatchUpTier(next);
    });
  }
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const cfads = BigInt(distributableCents);
  const cash = BigInt(cashCents);

  const preview = useMemo(
    () =>
      runWaterfall({
        config: form,
        distributableCents: cfads,
        lpContributedCents: form.lpContributedCents,
        unreturnedCapitalCents: resolveUnreturnedCapitalCents(form.unreturnedCapitalCents, form.lpContributedCents),
        unpaidPrefCents: resolveUnpaidPrefCents(form.unpaidPrefCents),
        prefPaidToDateCents: form.prefPaidToDateCents,
        periodMonths: 1,
        europeanPromoteOpen,
      }),
    [form, cfads, europeanPromoteOpen],
  );

  const cashPreview = useMemo(
    () =>
      runWaterfall({
        config: form,
        distributableCents: cash,
        lpContributedCents: form.lpContributedCents,
        unreturnedCapitalCents: resolveUnreturnedCapitalCents(form.unreturnedCapitalCents, form.lpContributedCents),
        unpaidPrefCents: resolveUnpaidPrefCents(form.unpaidPrefCents),
        prefPaidToDateCents: form.prefPaidToDateCents,
        periodMonths: 1,
        europeanPromoteOpen,
      }),
    [form, cash, europeanPromoteOpen],
  );

  function applyTemplate(id: WaterfallTemplateId) {
    const next = applyWaterfallTemplate(id);
    setForm((prev) => ({
      ...next,
      lpContributedCents: prev.lpContributedCents,
      unreturnedCapitalCents: prev.unreturnedCapitalCents,
      unpaidPrefCents: prev.unpaidPrefCents,
      prefPaidToDateCents: prev.prefPaidToDateCents,
      coGpName: prev.coGpName,
      coGpOfPromoteBps: prev.coGpOfPromoteBps,
      coGpCoInvestShareBps: prev.coGpCoInvestShareBps,
    }));
    setStatus("idle");
  }

  function patchTier(index: number, patch: Partial<WaterfallTier>) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    }));
  }

  async function onSave() {
    setStatus("saving");
    setError(null);
    const res = await fetch(`/api/deals/${entityCode}/waterfall`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: form.templateId,
        prefRateBps: form.prefRateBps,
        compounding: form.compounding,
        catchUpEnabled: form.catchUpEnabled,
        catchUpBps: form.catchUpBps,
        gpCoInvestBps: form.gpCoInvestBps,
        coGpName: form.coGpName,
        coGpOfPromoteBps: form.coGpOfPromoteBps,
        coGpCoInvestShareBps: form.coGpCoInvestShareBps,
        promoteBase: form.promoteBase,
        lookbackClawback: form.lookbackClawback,
        notes: form.notes,
        tiers: form.tiers,
        lpContributedCents: form.lpContributedCents.toString(),
        unreturnedCapitalCents: form.unreturnedCapitalCents == null ? null : form.unreturnedCapitalCents.toString(),
        unpaidPrefCents: form.unpaidPrefCents == null ? null : form.unpaidPrefCents.toString(),
        prefPaidToDateCents: form.prefPaidToDateCents.toString(),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setStatus("error");
      setError(json.error ?? "Could not save waterfall.");
      return;
    }
    setStatus("saved");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">Templates · click to apply, then edit</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {WATERFALL_TEMPLATE_IDS.map((id) => {
            const meta = WATERFALL_TEMPLATE_META[id];
            const active = form.templateId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => applyTemplate(id)}
                className={`border px-4 py-3 text-left shadow-ledger ${
                  active ? "border-gold-500 bg-gold-50" : "border-cream-300 bg-white hover:border-gold-400"
                }`}
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">{id.replaceAll("_", " ")}</p>
                <p className="mt-1 font-display text-lg text-navy-900">{meta.label}</p>
                <p className="mt-1 text-sm text-ink-700">{meta.short}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Deal preferences</h2>
        <p className="mt-1 text-sm text-ink-600">
          {entityName} ({entityCode}) · {period}. Capital fields are user-entered — the engine does not invent
          contributions from AR or the GL.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-ink-700">
            Pref rate (%)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={(form.prefRateBps / 100).toString()}
              onChange={(e) => setForm((p) => ({ ...p, prefRateBps: Math.round(Number(e.target.value) * 100) || 0 }))}
            />
          </label>
          <label className="text-sm text-ink-700">
            Compounding
            <select
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
              value={form.compounding}
              onChange={(e) => setForm((p) => ({ ...p, compounding: e.target.value as WaterfallCompounding }))}
            >
              <option value="NONE">None (simple monthly)</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
          <label className="text-sm text-ink-700">
            Catch-up %
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              type="number"
              min="0"
              max="100"
              disabled={!form.catchUpEnabled}
              value={(form.catchUpBps / 100).toString()}
              onChange={(e) => setForm((p) => ({ ...p, catchUpBps: Math.round(Number(e.target.value) * 100) || 0 }))}
            />
          </label>
          <label className="flex items-end gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.catchUpEnabled}
              onChange={(e) => setForm((p) => ({ ...p, catchUpEnabled: e.target.checked }))}
            />
            Catch-up on
          </label>
          <label className="text-sm text-ink-700">
            GP co-invest (%)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={(form.gpCoInvestBps / 100).toString()}
              onChange={(e) => setForm((p) => ({ ...p, gpCoInvestBps: Math.round(Number(e.target.value) * 100) || 0 }))}
            />
          </label>
          <label className="text-sm text-ink-700">
            Promote base
            <select
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
              value={form.promoteBase}
              onChange={(e) =>
                setForm((p) => ({ ...p, promoteBase: e.target.value as WaterfallConfig["promoteBase"] }))
              }
            >
              <option value="DISTRIBUTABLE_CASH">Distributable cash (CFADS)</option>
              <option value="EQUITY_PROCEEDS">Equity proceeds</option>
            </select>
          </label>
          <label className="flex items-end gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.lookbackClawback}
              onChange={(e) => setForm((p) => ({ ...p, lookbackClawback: e.target.checked }))}
            />
            Lookback / clawback (flag only)
          </label>
          <label className="text-sm text-ink-700">
            LP contributed capital ($)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              inputMode="decimal"
              value={centsToDollarsInput(form.lpContributedCents)}
              onChange={(e) =>
                setForm((p) => ({ ...p, lpContributedCents: dollarsInputToOptionalCents(e.target.value) ?? 0n }))
              }
            />
          </label>
          <label className="text-sm text-ink-700">
            Unreturned capital ($)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              inputMode="decimal"
              placeholder="blank = use contributed"
              value={centsToDollarsInput(form.unreturnedCapitalCents)}
              onChange={(e) => setForm((p) => ({ ...p, unreturnedCapitalCents: dollarsInputToOptionalCents(e.target.value) }))}
            />
            <span className="mt-1 block text-xs text-ink-500">Leave blank to use LP contributed. A typed 0 stays 0.</span>
          </label>
          <label className="text-sm text-ink-700">
            LP pref unpaid ($)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              inputMode="decimal"
              placeholder="blank = none carried in"
              value={centsToDollarsInput(form.unpaidPrefCents)}
              onChange={(e) => setForm((p) => ({ ...p, unpaidPrefCents: dollarsInputToOptionalCents(e.target.value) }))}
            />
            <span className="mt-1 block text-xs text-ink-500">Leave blank for none carried in. A typed 0 stays 0.</span>
          </label>
        </div>
        <label className="mt-4 block text-sm text-ink-700">
          Notes
          <textarea
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </label>
      </section>

      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Co-GP (optional, deal/SPE)</h2>
        <p className="mt-1 text-sm text-ink-600">
          Parties at this SPE: <strong>Deal LPs</strong>, <strong>RCP (GP or Co-GP)</strong>, and an optional
          third-party <strong>Co-GP investor</strong>. Leave name blank and both shares at 0% to keep the prior
          two-party LP vs single GP/RCP model. Co-GP dollars stay at the deal — OpCo cash/CFADS use RCP only.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm text-ink-700">
            Co-GP name
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
              value={form.coGpName}
              placeholder="Third-party Co-GP (optional)"
              onChange={(e) => setForm((p) => ({ ...p, coGpName: e.target.value }))}
            />
          </label>
          <label className="text-sm text-ink-700">
            Co-GP % of the GP’s promote, catch-up, and residual
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={(form.coGpOfPromoteBps / 100).toString()}
              onChange={(e) =>
                setForm((p) => ({ ...p, coGpOfPromoteBps: Math.round(Number(e.target.value) * 100) || 0 }))
              }
            />
          </label>
          <label className="text-sm text-ink-700">
            Co-GP % of GP co-invest (ROC / pref)
            <input
              className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={(form.coGpCoInvestShareBps / 100).toString()}
              onChange={(e) =>
                setForm((p) => ({ ...p, coGpCoInvestShareBps: Math.round(Number(e.target.value) * 100) || 0 }))
              }
            />
          </label>
        </div>
      </section>

      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Tiers</h2>
        <p className="mt-1 text-sm text-ink-600">
          ROC, pref, and residual splits are LP / GP in percent (the GP side is then split RCP vs Co-GP above). The
          catch-up row is not that kind of split: its GP target follows the residual row, and the Catch-up % above is
          the share of each catch-up dollar paid to the GP. A typed 0 stays 0 — it does not jump back to 80/20.
          Multi-hurdle bands use dollar-pref proxies of IRR — not XIRR.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                <th className="py-2 text-left">Kind</th>
                <th className="py-2 text-left">Label</th>
                <th className="py-2 text-right">Hurdle %</th>
                <th className="py-2 text-right">LP %</th>
                <th className="py-2 text-right">GP %</th>
              </tr>
            </thead>
            <tbody>
              {form.tiers.map((tier, index) => {
                const catchUp = tier.kind === "CATCH_UP";
                return (
                <tr key={tier.id} className="border-b border-cream-200">
                  <td className="py-2 text-ink-600">{tier.kind}</td>
                  <td className="py-2">
                    {catchUp ? (
                      <p className="px-2 py-1 text-ink-800">{tier.label}</p>
                    ) : (
                      <input
                        className="w-full border border-cream-300 bg-cream-50 px-2 py-1"
                        value={tier.label}
                        onChange={(e) => patchTier(index, { label: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      className="w-24 border border-cream-300 bg-cream-50 px-2 py-1 text-right tabular"
                      type="number"
                      step="0.01"
                      value={tier.hurdleIrrBps == null ? "" : (tier.hurdleIrrBps / 100).toString()}
                      onChange={(e) =>
                        patchTier(index, {
                          hurdleIrrBps: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  </td>
                  {catchUp ? (
                    <td className="py-2 text-right text-ink-800" colSpan={2}>
                      <p className="tabular">
                        GP target share{" "}
                        {tier.lpSplitBps + tier.gpSplitBps > 0
                          ? `${((tier.gpSplitBps * 100) / (tier.lpSplitBps + tier.gpSplitBps)).toString()}%`
                          : "0%"}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.08em] text-ink-500">
                        Follows the residual row · not a split of this row
                      </p>
                    </td>
                  ) : (
                    <>
                      <td className="py-2 text-right">
                        <input
                          className="w-20 border border-cream-300 bg-cream-50 px-2 py-1 text-right tabular"
                          type="number"
                          aria-label="LP percent"
                          value={(tier.lpSplitBps / 100).toString()}
                          onChange={(e) => patchTier(index, { lpSplitBps: Math.round(Number(e.target.value) * 100) || 0 })}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <input
                          className="w-20 border border-cream-300 bg-cream-50 px-2 py-1 text-right tabular"
                          type="number"
                          aria-label="GP percent"
                          value={(tier.gpSplitBps / 100).toString()}
                          onChange={(e) => patchTier(index, { gpSplitBps: Math.round(Number(e.target.value) * 100) || 0 })}
                        />
                      </td>
                    </>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-gold-400 bg-gold-50 px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Applies to OpCo rollup</h2>
        <p className="mt-1 text-sm text-ink-700">
          Illustrative split of <strong>this period’s CFADS</strong> (distributable cash the app already defines — not
          invented AR). <strong>RCP</strong> is what live OpCo cash / CFADS tiles use after you save. Deal LPs stay at
          the SPE. Co-GP (if any) stays at the deal.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">CFADS (gross)</p>
            <p className="font-display text-3xl tabular text-navy-900">{formatUsd(cfads)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">Deal LP share</p>
            <p className="font-display text-3xl tabular text-navy-900">{formatUsd(preview.lpCents)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">RCP after waterfall</p>
            <p className="font-display text-3xl tabular text-navy-900">{formatUsd(preview.rcpCents)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">
              Co-GP{form.coGpName.trim() ? ` · ${form.coGpName.trim()}` : ""}
            </p>
            <p className="font-display text-3xl tabular text-navy-900">{formatUsd(preview.coGpCents)}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-700">
          LP pref unpaid after this run: <strong>{formatUsd(preview.unpaidPrefAfterCents)}</strong>
          {preview.europeanPromoteBlocked ? " · European promote blocked this run." : ""}
          {preview.lookThrough ? " · 100% look-through (current default)." : ""}
          {preview.coGpCents === 0n ? " · No Co-GP (two-party LP / GP)." : ""}
        </p>
        <p className="mt-1 text-sm text-ink-600">
          If SPE cash were distributed today — operating cash available, excludes reserves, escrow and tenant
          deposits: Deal LP {formatUsd(cashPreview.lpCents)} · RCP {formatUsd(cashPreview.rcpCents)} · Co-GP{" "}
          {formatUsd(cashPreview.coGpCents)} of {formatUsd(cash)}.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-ink-700">
          {preview.steps.map((step) => (
            <li key={step.tierId + step.label}>
              <span className="uppercase tracking-[0.08em] text-gold-700">{step.kind}</span> {step.label}: LP{" "}
              {formatUsd(step.lpCents)} · GP {formatUsd(step.gpCents)}
              {step.coGpCents > 0n ? ` (RCP ${formatUsd(step.rcpCents)} · Co-GP ${formatUsd(step.coGpCents)})` : ""}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={status === "saving"}
          className="bg-gold-500 px-5 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save waterfall"}
        </button>
        {status === "saved" ? <p className="text-sm text-navy-800">Saved. OpCo rollup will use RCP share (Co-GP stays at the deal).</p> : null}
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
      </div>
    </div>
  );
}
