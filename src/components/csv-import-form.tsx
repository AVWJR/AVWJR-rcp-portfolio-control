"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CsvImportForm({
  action,
  entity,
  period,
  label,
  acceptHint,
}: {
  action: string;
  entity: string;
  period?: string;
  label: string;
  acceptHint: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement)?.files?.[0];
    if (!file) {
      setMessage("Choose a CSV file.");
      return;
    }
    if (!confirmReplace) {
      setMessage("Check the box to confirm this replaces the entire current file.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.set("file", file);
    body.set("entity", entity);
    body.set("confirmReplace", "true");
    if (period) body.set("period", period);
    const res = await fetch(action, { method: "POST", body });
    const json = (await res.json()) as { error?: string; imported?: number; dialectLabel?: string; coach?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Import failed");
      return;
    }
    const dialect = json.dialectLabel ? ` · ${json.dialectLabel}` : "";
    setMessage(`Imported ${json.imported ?? 0} rows (full replace)${dialect}`);
    form.reset();
    setConfirmReplace(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 border border-cream-300 bg-white px-4 py-3">
      <div>
        <label className="block text-[11px] uppercase tracking-[0.14em] text-ink-500">{label}</label>
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="mt-1 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={confirmReplace}
          onChange={(event) => setConfirmReplace(event.target.checked)}
        />
        Replace existing rows (cannot undo)
      </label>
      <button
        type="submit"
        disabled={busy}
        className="bg-navy-900 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-cream-100 disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import"}
      </button>
      <p className="text-xs text-ink-500">{acceptHint}</p>
      {message ? <p className="w-full text-xs text-navy-800">{message}</p> : null}
    </form>
  );
}
