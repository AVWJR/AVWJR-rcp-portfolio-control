"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReapplyRentRollButton({ entityCode }: { entityCode: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/deals/intake/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reapply", entityCode, confirmReplace: true }),
      });
      const json = (await res.json()) as { error?: string; imported?: number; source?: string };
      if (!res.ok) {
        setMessage(json.error ?? "Re-apply failed.");
        return;
      }
      setMessage(`Re-applied ${json.imported ?? 0} units from ${json.source ?? "the vaulted rent roll"}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Re-apply failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-gold-300 bg-cream-50 px-4 py-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onClick()}
        className="bg-navy-900 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-50"
      >
        {busy ? "Re-applying…" : "Re-apply rent roll"}
      </button>
      <p className="mt-2 text-xs text-ink-600">
        Reads the vaulted rent-roll workbook for this SPE, detects the dialect, and writes Unit rows
        from the canonical model (full replace). Original bytes stay in Vault.
      </p>
      {message ? <p className="mt-2 text-xs text-navy-800">{message}</p> : null}
    </div>
  );
}
