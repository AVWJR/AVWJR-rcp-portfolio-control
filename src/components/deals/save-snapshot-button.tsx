"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SaveSnapshotButton({ code, period }: { code: string; period: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/deals/${code}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the snapshot.");
      setMessage(`Saved ${json.periodLabel} (${json.basisLabel}). The previous snapshot is still on file.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the snapshot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={busy} onClick={() => void save()} className="text-left text-sm text-navy-800 underline disabled:opacity-40">
        Save analysis snapshot
      </button>
      {message ? <span className="text-xs text-ink-600">{message}</span> : null}
    </span>
  );
}
