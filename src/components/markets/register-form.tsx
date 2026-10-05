"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGISTERED_ONLY } from "@/lib/markets/types";

const inputClass = "mt-1 w-full border border-cream-300 bg-white px-3 py-2 text-sm text-ink-900";

export function RegisterPaidSourceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/markets/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          publisher: formData.get("publisher"),
          url: formData.get("url"),
          termsUrl: formData.get("termsUrl"),
          costNotes: formData.get("costNotes"),
          licenseStatus: formData.get("licenseStatus"),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(json.error ?? "Could not register the source.");
      setMessage(json.message ?? REGISTERED_ONLY);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register the source.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={onSubmit} className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">Add / register paid source</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-700">
        Principal only. This saves a license-required, inactive row. It does not fetch data, store a key, or change any score.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm text-ink-700">
          Name
          <input name="name" required className={inputClass} placeholder="Vendor series name" />
        </label>
        <label className="text-sm text-ink-700">
          Publisher
          <input name="publisher" required className={inputClass} />
        </label>
        <label className="text-sm text-ink-700">
          URL
          <input name="url" className={inputClass} placeholder="https://" />
        </label>
        <label className="text-sm text-ink-700">
          Terms URL
          <input name="termsUrl" className={inputClass} placeholder="https://" />
        </label>
        <label className="text-sm text-ink-700 md:col-span-2">
          Cost notes
          <input name="costNotes" className={inputClass} placeholder="What the license would cover. No key." />
        </label>
        <label className="text-sm text-ink-700">
          License status
          <select name="licenseStatus" className={inputClass} defaultValue="inactive">
            <option value="inactive">License required — inactive</option>
            <option value="pending_license">License required — pending license</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 border border-navy-900 bg-navy-900 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Register paid source"}
      </button>
      {message ? <p className="mt-3 text-sm text-navy-900">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-gold-700">{error}</p> : null}
    </form>
  );
}
