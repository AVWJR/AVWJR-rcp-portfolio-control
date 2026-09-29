"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReverseDistributionButton({ entityCode, eventId }: { entityCode: string; eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reverse() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/deals/${entityCode}/distributions/${eventId}/reverse`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not reverse.");
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button type="button" className="text-navy-800 underline" disabled={busy} onClick={() => void reverse()}>
        {busy ? "Reversing…" : "Reverse"}
      </button>
      {error ? <span className="ml-2 text-red-800">{error}</span> : null}
    </span>
  );
}
