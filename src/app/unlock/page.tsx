"use client";

import { useState } from "react";

export default function UnlockPage() {
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ unlock: password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Unlock failed.");
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Roche Capital Partners</p>
      <h1 className="font-display text-4xl text-navy-900">Principal unlock</h1>
      <p className="mt-3 text-sm text-ink-700">
        Partner links are read-only. Enter the <code>PRINCIPAL_PASSWORD</code> to use Add Deal, seed, and
        other writes. Do not send this password to LPs.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
        <label className="block text-sm text-ink-700">
          Principal password
          <input
            type="password"
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || password.length < 8}
          className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-50"
        >
          Unlock writes
        </button>
      </form>
    </main>
  );
}
