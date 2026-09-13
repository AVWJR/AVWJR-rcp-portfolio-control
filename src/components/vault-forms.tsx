"use client";

import { uploadFileToVercelBlob } from "@/lib/deals/blob-client-upload";
import { INTAKE_MAX_BYTES } from "@/lib/deals/types";
import {
  blobTokenRequiredMessage,
  fileTooLargeMessage,
  formatUploadFailure,
  parseApiErrorText,
  shouldUseClientBlobUpload,
} from "@/lib/deals/upload-client";
import { guessVaultKind, VAULT_KIND_LABELS, VAULT_KINDS, type VaultKind } from "@rcp/documents/vault";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function VaultUploadForm({
  entity,
  period,
  blobConfigured = false,
  onVercel = false,
}: {
  entity: string;
  period: string;
  blobConfigured?: boolean;
  onVercel?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<VaultKind>("other");

  function fail(text: string) {
    setError(text);
    setMessage(null);
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setKind(guessVaultKind(file.name, kind));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement)?.files?.[0];
    if (!file) {
      fail("Choose a file.");
      return;
    }
    if (file.size <= 0) {
      fail("File is empty.");
      return;
    }
    if (file.size > INTAKE_MAX_BYTES) {
      fail(fileTooLargeMessage());
      return;
    }

    const uploadPolicy = { blobConfigured, onVercel };
    const viaBlob = shouldUseClientBlobUpload(file.size, uploadPolicy);
    const resolvedKind = guessVaultKind(file.name, kind);
    const title = String((form.elements.namedItem("title") as HTMLInputElement)?.value ?? "").trim();
    const notes = String((form.elements.namedItem("notes") as HTMLInputElement)?.value ?? "");

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (viaBlob && !blobConfigured) {
        fail(blobTokenRequiredMessage({ filename: file.name, byteSize: file.size }));
        return;
      }

      let res: Response;
      if (viaBlob) {
        const blob = await uploadFileToVercelBlob(file, {
          entityCode: entity,
          kind: resolvedKind,
          title,
          notes,
        });
        res = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity,
            kind: resolvedKind,
            title: title || file.name,
            notes,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            byteSize: file.size,
            blobUrl: blob.url,
          }),
        });
      } else {
        const body = new FormData(form);
        body.set("entity", entity);
        body.set("kind", resolvedKind);
        res = await fetch("/api/vault", { method: "POST", body });
      }

      const text = await res.text();
      if (!res.ok) {
        fail(
          parseApiErrorText(res.status, text, "Upload failed", {
            filename: file.name,
            byteSize: file.size,
            blobConfigured,
          }),
        );
        return;
      }
      let json: { title?: string; filename?: string; kind?: string } = {};
      try {
        json = JSON.parse(text) as { title?: string; filename?: string; kind?: string };
      } catch {
        json = {};
      }
      const label = json.title ?? file.name;
      const kindLabel = json.kind && json.kind in VAULT_KIND_LABELS ? VAULT_KIND_LABELS[json.kind as VaultKind] : "";
      setMessage(`Stored ${label}${kindLabel ? ` (${kindLabel})` : ""}`);
      form.reset();
      setKind("other");
      router.refresh();
    } catch (err) {
      fail(
        formatUploadFailure({
          networkMessage: err instanceof Error ? err.message : "Failed to fetch",
          filename: file.name,
          byteSize: file.size,
          blobConfigured,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">Upload</p>
      <p className="text-xs text-ink-600">
        Files over ~3.5 MB use Vercel Blob (same path as Add Deal) so they do not hit the function body limit.
        OM / offering-memo filenames store as OM / CIM.
      </p>
      <input type="hidden" name="period" value={period} />
      <label className="block text-sm text-ink-700">
        Title
        <input name="title" className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-1.5" />
      </label>
      <label className="block text-sm text-ink-700">
        Kind
        <select
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as VaultKind)}
          className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-1.5"
        >
          {VAULT_KINDS.map((row) => (
            <option key={row} value={row}>
              {VAULT_KIND_LABELS[row]}
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
        <input name="file" type="file" required className="mt-1 block w-full text-sm" onChange={onFileChange} />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-100 disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Store in vault"}
      </button>
      {error ? <p className="text-xs text-red-800">{error}</p> : null}
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
    try {
      const res = await fetch("/api/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, entity, period }),
      });
      const json = (await res.json()) as { error?: string; status?: string; files?: string[] };
      if (!res.ok) {
        setMessage(json.error ?? "Run failed");
        return;
      }
      setMessage(`${json.status}: ${(json.files ?? []).join(", ")}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Run failed");
    } finally {
      setBusy(false);
    }
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
