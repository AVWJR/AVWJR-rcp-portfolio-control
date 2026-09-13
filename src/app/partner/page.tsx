"use client";

import { useState } from "react";

export default function PartnerPage() {
  const [share, setShare] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not open partner view.");
        return;
      }
      window.location.href = "/dashboard/SPE-WBG?entity=SPE-WBG&period=2026-08";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open partner view.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Roche Capital Partners</p>
      <h1 className="font-display text-4xl text-navy-900">Partner view</h1>
      <p className="mt-3 text-sm text-ink-700">
        This link is read-only: dashboards, narratives, and packs. Add Deal and demo seed are off.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
        <label className="block text-sm text-ink-700">
          Share token
          <input
            type="password"
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
            value={share}
            onChange={(e) => setShare(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || share.length < 8}
          className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-50"
        >
          Open partner view
        </button>
      </form>
    </main>
  );
}
