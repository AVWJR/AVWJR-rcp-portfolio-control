"use client";

import { DollarField } from "@/components/deals/dollar-field";
import { formatUsd, type DistributionSource } from "@rcp/ledger";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PreviewLine = { tierKind: string; tierLabel: string; lpCents: string; rcpCents: string; coGpCents: string };
type PreviewState = {
  unreturnedCapitalCents: string;
  prefAccruedCents: string;
  prefPaidCents: string;
  prefUnpaidCents: string;
  catchUpPaidCents: string;
  catchUpTargetCents: string;
  promoteEarnedCents: string;
  cumulativeLpCents: string;
  cumulativeRcpCents: string;
  cumulativeCoGpCents: string;
  capitalReturnedCents: string;
};

export function DistributionForm({
  entityCode,
  period,
  canPost,
  lockedCopy,
}: {
  entityCode: string;
  period: string;
  canPost: boolean;
  lockedCopy?: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState<bigint | null>(null);
  const [source, setSource] = useState<DistributionSource>("OPERATING_CASH");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(`${period}-28`.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "post" | null>(null);
  const [preview, setPreview] = useState<{ lines: PreviewLine[]; state: PreviewState; position: string } | null>(null);
  const [previewedCents, setPreviewedCents] = useState<string | null>(null);

  function clearPreview() {
    setPreview(null);
    setPreviewedCents(null);
  }

  async function submit(confirm: boolean) {
    setError(null);
    if (amount == null) {
      setError("Enter an amount. Leave it blank only if you are not ready to record.");
      return;
    }
    if (amount <= 0n) {
      setError("A distribution has to be more than zero. A typed 0 stays 0 and is not posted.");
      return;
    }
    setBusy(confirm ? "post" : "preview");
    const res = await fetch(`/api/deals/${entityCode}/distributions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirm,
        grossCents: amount.toString(),
        source,
        memo,
        period,
        eventDate: date,
        previewGrossCents: confirm ? previewedCents : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      preview?: { lines: PreviewLine[]; state: PreviewState; position: string };
    };
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "Could not record the distribution.");
      return;
    }
    if (!confirm && json.preview) {
      setPreview(json.preview);
      setPreviewedCents(amount.toString());
      return;
    }
    clearPreview();
    setAmount(null);
    setMemo("");
    router.refresh();
  }

  if (!canPost) {
    return (
      <p className="border border-cream-300 bg-white px-5 py-4 text-sm text-ink-700 shadow-ledger">
        {lockedCopy ?? "Partner view is read-only. Recording a distribution is a Principal action."}
      </p>
    );
  }

  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">Record a distribution</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        Starts at $0 distributed. This check runs through the saved waterfall. Posted rows stay on the ledger. A
        correction is a reversal, not an edit.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-ink-700">
          Amount ($)
          <DollarField
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 tabular"
            nullable
            placeholder="blank = not entered"
            value={amount}
            onValue={(next) => {
              setAmount(next);
              clearPreview();
            }}
          />
          <span className="mt-1 block text-xs text-ink-500">Blank means nothing entered. A typed 0 stays 0.</span>
        </label>
        <label className="text-sm text-ink-700">
          Source
          <select
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
            value={source}
            onChange={(event) => {
              setSource(event.target.value as DistributionSource);
              clearPreview();
            }}
          >
            <option value="OPERATING_CASH">Operating cash</option>
            <option value="CAPITAL_EVENT">Capital event</option>
          </select>
        </label>
        <label className="text-sm text-ink-700">
          Date
          <input
            type="date"
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              clearPreview();
            }}
          />
        </label>
        <label className="text-sm text-ink-700">
          Period
          <input className="mt-1 w-full border border-cream-300 bg-cream-100 px-3 py-2" value={period} readOnly />
        </label>
      </div>
      <label className="mt-4 block text-sm text-ink-700">
        Memo
        <input
          className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
          value={memo}
          onChange={(event) => {
            setMemo(event.target.value);
            clearPreview();
          }}
          placeholder="Optional — quarterly operating distribution, refinance, sale"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void submit(false)}
          className="border border-navy-800 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900 disabled:opacity-60"
        >
          {busy === "preview" ? "Previewing…" : "Preview allocation"}
        </button>
        <button
          type="button"
          disabled={busy !== null || !preview}
          onClick={() => void submit(true)}
          className="bg-gold-500 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950 disabled:opacity-60"
        >
          {busy === "post" ? "Posting…" : "Confirm and post"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}
      {preview ? (
        <div className="mt-4 border border-gold-400 bg-gold-50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">
            Preview · where this leaves the waterfall: {preview.position.replaceAll("_", " ")}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-800">
            {preview.lines.map((line) => (
              <li key={line.tierKind + line.tierLabel}>
                <span className="uppercase tracking-[0.08em] text-gold-700">{line.tierKind}</span> {line.tierLabel}: LP{" "}
                {formatUsd(BigInt(line.lpCents))} · RCP {formatUsd(BigInt(line.rcpCents))} · Co-GP{" "}
                {formatUsd(BigInt(line.coGpCents))}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-700">
            After this check: capital returned {formatUsd(BigInt(preview.state.capitalReturnedCents))} · still out{" "}
            {formatUsd(BigInt(preview.state.unreturnedCapitalCents))} · pref accrued{" "}
            {formatUsd(BigInt(preview.state.prefAccruedCents))} · paid {formatUsd(BigInt(preview.state.prefPaidCents))} ·
            unpaid {formatUsd(BigInt(preview.state.prefUnpaidCents))}. Catch-up paid{" "}
            {formatUsd(BigInt(preview.state.catchUpPaidCents))} of target{" "}
            {formatUsd(BigInt(preview.state.catchUpTargetCents))}. Promote earned{" "}
            {formatUsd(BigInt(preview.state.promoteEarnedCents))}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
