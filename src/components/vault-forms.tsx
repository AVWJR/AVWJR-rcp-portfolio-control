"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const VAULT_KINDS = ["lease", "loan", "k1", "draw", "insurance", "other"] as const;
const VAULT_KIND_LABELS: Record<(typeof VAULT_KINDS)[number], string> = {
  lease: "Lease",
  loan: "Loan",
  k1: "K-1 / capital packet",
  draw: "Draw / funding",
  insurance: "Insurance",
  other: "Other",
};

export function VaultUploadForm({
  entity,
  period,
}: {
  entity: string;
  period: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement)?.files?.[0];
    if (!file) {
      setMessage("Choose a file.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const body = new FormData(form);
    body.set("entity", entity);
    const res = await fetch("/api/vault", { method: "POST", body });
    const json = (await res.json()) as { error?: string; title?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Upload failed");
      return;
    }
    setMessage(`Stored ${json.title ?? file.name}`);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">Upload</p>
      <input type="hidden" name="period" value={period} />
      <label className="block text-sm text-ink-700">
        Title
        <input name="title" className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-1.5" />
      </label>
      <label className="block text-sm text-ink-700">
        Kind
        <select name="kind" defaultValue="other" className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-1.5">
          {VAULT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {VAULT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-ink-700">
        Notes
        <input name="notes" className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-1.5" />
      </label>
      <label className="block text-sm text-ink-700">
        File
        <input name="file" type="file" required className="mt-1 block w-full text-sm" />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-100 disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Store in vault"}
      </button>
      {message ? <p className="text-xs text-ink-600">{message}</p> : null}
    </form>
  );
}

export function SchedulerRunButton({
  packId,
  entity,
  period,
}: {
  packId: string;
  entity: string;
  period: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/scheduler/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId, entity, period }),
    });
    const json = (await res.json()) as { error?: string; status?: string; files?: string[] };
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Run failed");
      return;
    }
    setMessage(`${json.status}: ${(json.files ?? []).join(", ")}`);
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="bg-navy-900 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-cream-100 disabled:opacity-50"
      >
        {busy ? "Running…" : "Run now"}
      </button>
      {message ? <p className="mt-1 text-xs text-ink-600">{message}</p> : null}
    </div>
  );
}
