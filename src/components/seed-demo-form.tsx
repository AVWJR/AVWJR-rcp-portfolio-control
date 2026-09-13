"use client";

import { useState, type FormEvent } from "react";

type SeedResponse = {
  ok?: boolean;
  seeded?: boolean;
  reason?: string;
  message?: string;
  error?: string;
  disclaimer?: string;
};

export function SeedDemoForm() {
  const [secret, setSecret] = useState("");
  const [force, setForce] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SeedResponse | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/seed", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-seed-secret": secret,
        },
        body: JSON.stringify({ force }),
      });
      const data = (await response.json().catch(() => ({}))) as SeedResponse;
      if (!response.ok) {
        setResult({ ok: false, error: data.error ?? `Request failed (${response.status})` });
        return;
      }
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Network error — try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 border border-cream-300 bg-white px-5 py-5 shadow-ledger">
      <label className="block text-[11px] uppercase tracking-[0.12em] text-ink-500">
        SEED_SECRET
        <input
          type="password"
          name="secret"
          autoComplete="off"
          required
          minLength={16}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          className="mt-1 block w-full border border-cream-400 px-2 py-1.5 text-sm text-ink-900"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={force}
          onChange={(event) => setForce(event.target.checked)}
          className="mt-1"
        />
        <span>Wipe existing rows and reseed (only if you intend to replace the demo database).</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="bg-navy-900 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-cream-100 disabled:opacity-50"
      >
        {pending ? "Seeding…" : "Load demo data"}
      </button>
      {result ? (
        <p className={`text-sm ${result.ok === false ? "text-red-800" : "text-ink-700"}`} role="status">
          {result.error ?? result.message ?? (result.seeded ? "Demo data loaded." : "No changes.")}
          {result.disclaimer ? ` ${result.disclaimer}` : null}
        </p>
      ) : null}
    </form>
  );
}
