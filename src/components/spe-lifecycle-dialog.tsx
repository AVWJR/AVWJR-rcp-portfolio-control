"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

type LifecycleAction = "delete" | "restore";

export function SpeLifecycleDialog({
  action,
  code,
  name,
  impact,
  triggerLabel,
  triggerClassName,
  afterHref,
}: {
  action: LifecycleAction;
  code: string;
  name: string;
  impact: string;
  triggerLabel: string;
  triggerClassName?: string;
  afterHref?: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function close(force = false) {
    if (busy && !force) return;
    setBusy(false);
    setOpen(false);
    setStep(1);
    setConfirmCode("");
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const href =
      action === "delete"
        ? `/api/deals/${encodeURIComponent(code)}/delete`
        : `/api/archive/${encodeURIComponent(code)}/restore`;
    try {
      const res = await fetch(href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmCode }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          json.error ||
            (res.status === 403 ? "Partner view cannot delete or restore deals." : "Request failed."),
        );
        setBusy(false);
        return;
      }
      close(true);
      if (afterHref) {
        router.push(afterHref);
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  const confirmReady = confirmCode.trim().toUpperCase() === code.trim().toUpperCase();
  const confirmVerb = action === "delete" ? "Delete deal" : "Restore deal";

  return (
    <>
      <button
        type="button"
        className={
          triggerClassName ??
          "border border-navy-900 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-navy-900 hover:bg-cream-200"
        }
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 px-4"
          role="presentation"
          onClick={() => close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-lg border border-cream-300 bg-white p-6 shadow-ledger"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">
              {action === "delete" ? "Delete" : "Restore"} · two-step confirm
            </p>
            <h2 id={titleId} className="mt-1 font-display text-2xl text-navy-900">
              {action === "delete" ? `Delete ${code}` : `Restore ${code}`}
            </h2>
            {step === 1 ? (
              <>
                <p className="mt-3 text-sm text-ink-700">{impact}</p>
                <p className="mt-2 text-sm text-ink-600">
                  {name} stays in the books and vault. This is not a hard wipe.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="bg-gold-500 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950"
                    onClick={() => setStep(2)}
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    className="border border-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900"
                    onClick={() => close()}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-ink-700">
                  Type <strong>{code}</strong> to confirm.
                  {action === "delete" ? (
                    <>
                      {" "}
                      After Delete, find it under gold nav <strong>Deal Archive</strong> — not under Deals.
                    </>
                  ) : (
                    <> It returns to the live Deals list and the OpCo roll-up.</>
                  )}
                </p>
                <label className="mt-4 block text-[11px] uppercase tracking-[0.14em] text-gold-700">
                  SPE code
                  <input
                    autoFocus
                    value={confirmCode}
                    onChange={(event) => setConfirmCode(event.target.value)}
                    className="mt-1 block w-full border border-cream-400 bg-cream-50 px-3 py-2 text-sm uppercase tracking-[0.08em] text-navy-900"
                    placeholder={code}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!confirmReady || busy}
                    className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-100 disabled:opacity-40"
                    onClick={() => void submit()}
                  >
                    {busy ? "Working…" : confirmVerb}
                  </button>
                  <button
                    type="button"
                    className="border border-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900"
                    disabled={busy}
                    onClick={() => close()}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
