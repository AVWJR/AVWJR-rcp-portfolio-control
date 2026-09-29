"use client";

import { useState } from "react";

export function CloseDropzone({ code, year, month }: { code: string; year: number; month: number }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setNote(null);
    const body = new FormData();
    body.set("action", "upload");
    body.set("year", String(year));
    body.set("month", String(month));
    for (const file of files) body.append("files", file);
    const response = await fetch(`/api/deals/${code}/close`, { method: "POST", body });
    const json = (await response.json()) as { ok?: boolean; error?: string; files?: { classification: string; filename?: string; unmapped: string[] }[] };
    setBusy(false);
    if (!response.ok || !json.ok) {
      setNote(json.error ?? "Upload failed.");
      return;
    }
    const summary = (json.files ?? [])
      .map((file) => `${file.classification}${file.unmapped.length ? ` (${file.unmapped.length} unmapped)` : ""}`)
      .join(", ");
    setNote(summary ? `Saved: ${summary}. Original files stay in the vault.` : "Saved.");
    window.location.reload();
  }

  return (
    <div className="space-y-2">
      <label
        className="block cursor-pointer rounded-md border border-dashed border-gold-700 bg-white px-4 py-8 text-center text-sm text-ink-700"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void upload([...event.dataTransfer.files]);
        }}
      >
        <span className="font-display text-xl text-navy-900">Drop the manager’s package</span>
        <p className="mt-2">P&L, balance sheet, T12, GL detail, or rent roll. Excel, CSV, or PDF.</p>
        <input
          className="mt-4 block w-full text-sm"
          type="file"
          multiple
          disabled={busy}
          onChange={(event) => {
            void upload([...(event.target.files ?? [])]);
          }}
        />
      </label>
      {note ? <p className="text-sm text-ink-700">{note}</p> : null}
    </div>
  );
}
