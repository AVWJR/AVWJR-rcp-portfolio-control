"use client";

import { uploadFileToVercelBlob } from "@/lib/deals/blob-client-upload";
import {
  DEAL_FILE_CLASS_LABELS,
  DEAL_FILE_CLASSES,
  DEAL_WIZARD_STEPS,
  INTAKE_MAX_BYTES,
  INTAKE_MAX_BYTES_LABEL,
  type DealFileClass,
  type DealFileSource,
  type DealGoal,
} from "@/lib/deals/types";
import {
  blobTokenRequiredMessage,
  formatUploadFailure,
  initialUploadRows,
  isUntitledDealName,
  parseApiErrorText,
  shouldUseClientBlobUpload,
  suggestIdentityFromFilenames,
  workingTitle,
  type UploadRow,
} from "@/lib/deals/upload-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type IntakeFile = {
  id: string;
  source: string;
  classification: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  vaultDocumentId: string | null;
  status: string;
  lastError: string | null;
};

type Intake = {
  id: string;
  status: string;
  currentStep: number;
  goal: DealGoal | string | null;
  targetPeriod: string | null;
  speName: string | null;
  speCode: string | null;
  unitCount: number | null;
  strategy: string | null;
  parentOpCoCode: string;
  entityId: string | null;
  entityCode: string | null;
  entityName: string | null;
  sources: DealFileSource[];
  loanName: string | null;
  loanLender: string | null;
  loanUpbCents: string | number | null;
  loanRateBps: number | null;
  loanPaymentCents: string | number | null;
  loanOrigination: string | null;
  loanMaturity: string | null;
  dscrThresholdBps: number | null;
  debtYieldThresholdBps: number | null;
  lastError: string | null;
  files: IntakeFile[];
};

type ProviderStatus = { id: DealFileSource; label: string; configured: boolean; message: string };

type Completeness = {
  score: number;
  ready: number;
  applicable: number;
  items: { id: string; label: string; status: string; detail: string; href: string }[];
};

const GOALS: { id: DealGoal; title: string; copy: string }[] = [
  { id: "stabilize", title: "Stabilize", copy: "In-place operations. Hold and harvest cash flow." },
  { id: "value_add", title: "Value-add", copy: "Garden-style or interior upside. CapEx will follow." },
  { id: "light_rehab", title: "Light rehab", copy: "Targeted unit turns without a full recap story." },
];

function centsToUsd(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const n = Number(value) / 100;
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

function fieldClass() {
  return "mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900";
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  return parseApiErrorText(res.status, await res.text(), fallback);
}

export function AddDealWizard({
  initialIntakeId,
  opcos,
  periodLabels,
}: {
  initialIntakeId?: string;
  opcos: { code: string; name: string }[];
  periodLabels: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(3);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [uploadPolicy, setUploadPolicy] = useState({
    blobConfigured: false,
    onVercel: false,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropboxFiles, setDropboxFiles] = useState<{ id: string; name: string }[]>([]);
  const [emailFiles, setEmailFiles] = useState<{ id: string; name: string }[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const intakeRef = useRef<Intake | null>(null);
  const draftLockRef = useRef<Promise<Intake> | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [ingestReport, setIngestReport] = useState<{
    inferred: { speName: string | null; speCode: string | null; address: string | null };
    created: { entityCode: string | null; entityName: string | null };
    results: { kind: string; imported?: number; skipped?: string }[];
    gaps: string[];
  } | null>(null);
  const ingestLockRef = useRef(false);
  const [form, setForm] = useState({
    goal: "value_add" as DealGoal,
    targetPeriod: "2026-08",
    speName: "",
    speCode: "",
    unitCount: "",
    parentOpCoCode: opcos[0]?.code ?? "RCP-OPCO",
    sources: ["upload"] as DealFileSource[],
    loanName: "",
    loanLender: "",
    loanUpbUsd: "",
    loanRatePercent: "",
    loanPaymentUsd: "",
    loanOrigination: "",
    loanMaturity: "",
    dscrThreshold: "1.25",
    debtYieldThresholdPercent: "8",
  });

  const hydrate = useCallback((row: Intake) => {
    intakeRef.current = row;
    setIntake(row);
    setStep(Math.min(8, Math.max(1, row.currentStep || 1)));
    setForm((prev) => ({
      ...prev,
      goal: (row.goal as DealGoal) || prev.goal,
      targetPeriod: row.targetPeriod || prev.targetPeriod,
      speName: isUntitledDealName(row.speName)
        ? isUntitledDealName(prev.speName)
          ? ""
          : prev.speName
        : row.speName || "",
      speCode: row.speCode || "",
      unitCount: row.unitCount != null ? String(row.unitCount) : "",
      parentOpCoCode: row.parentOpCoCode || prev.parentOpCoCode,
      sources: row.sources?.length ? row.sources : prev.sources,
      loanName: row.loanName || "",
      loanLender: row.loanLender || "",
      loanUpbUsd: centsToUsd(row.loanUpbCents),
      loanRatePercent: row.loanRateBps != null ? (row.loanRateBps / 100).toFixed(2) : "",
      loanPaymentUsd: centsToUsd(row.loanPaymentCents),
      loanOrigination: row.loanOrigination ? row.loanOrigination.slice(0, 10) : "",
      loanMaturity: row.loanMaturity ? row.loanMaturity.slice(0, 10) : "",
      dscrThreshold: row.dscrThresholdBps != null ? (row.dscrThresholdBps / 10_000).toFixed(2) : prev.dscrThreshold,
      debtYieldThresholdPercent:
        row.debtYieldThresholdBps != null ? (row.debtYieldThresholdBps / 100).toFixed(2) : prev.debtYieldThresholdPercent,
    }));
  }, []);

  useEffect(() => {
    void fetch("/api/deals/providers")
      .then((r) => r.json())
      .then((json: { providers?: ProviderStatus[]; blobConfigured?: boolean; onVercel?: boolean }) => {
        setProviders(json.providers ?? []);
        setUploadPolicy({
          blobConfigured: Boolean(json.blobConfigured),
          onVercel: Boolean(json.onVercel),
        });
      });
  }, []);

  useEffect(() => {
    if (!initialIntakeId) return;
    void fetch(`/api/deals/intake?id=${initialIntakeId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.id) hydrate(json as Intake);
      });
  }, [hydrate, initialIntakeId]);

  useEffect(() => {
    intakeRef.current = intake;
  }, [intake]);

  useEffect(() => {
    if (step !== 3) return;
    if (intakeRef.current?.id || initialIntakeId) return;
    void ensureDraft(3).catch(() => undefined);
    // ensureDraft is recreated each render; run only when the Sources step is first opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, initialIntakeId]);

  const payload = useMemo(
    () => ({
      goal: form.goal,
      targetPeriod: form.targetPeriod,
      speName: workingTitle(form.speName),
      speCode: form.speCode.trim() || null,
      unitCount: form.unitCount ? Number(form.unitCount) : null,
      parentOpCoCode: form.parentOpCoCode,
      sources: form.sources,
      loanName: form.loanName || null,
      loanLender: form.loanLender || null,
      loanUpbUsd: form.loanUpbUsd || null,
      loanRatePercent: form.loanRatePercent || null,
      loanPaymentUsd: form.loanPaymentUsd || null,
      loanOrigination: form.loanOrigination || null,
      loanMaturity: form.loanMaturity || null,
      dscrThreshold: form.dscrThreshold || null,
      debtYieldThresholdPercent: form.debtYieldThresholdPercent || null,
      currentStep: step,
    }),
    [form, step],
  );

  async function saveDraft(nextStep = step) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deals/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: intakeRef.current?.id, ...payload, currentStep: nextStep }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not save the draft."));
      const json = (await res.json()) as Intake;
      const firstSave = !intakeRef.current?.id;
      hydrate(json);
      if (firstSave) {
        router.replace(`/deals/new?intake=${json.id}`);
      }
      setMessage("Draft saved. You can refresh — this deal intake will still be here.");
      return json;
    } catch (err) {
      const text = err instanceof Error ? err.message : "Save failed";
      setError(text);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function ensureDraft(nextStep = step): Promise<Intake> {
    if (intakeRef.current?.id && draftLockRef.current) {
      await draftLockRef.current.catch(() => undefined);
    }
    if (intakeRef.current?.id) {
      if (intakeRef.current.currentStep === nextStep) return intakeRef.current;
      return saveDraft(nextStep);
    }
    if (draftLockRef.current) return draftLockRef.current;
    const pending = saveDraft(nextStep).finally(() => {
      if (draftLockRef.current === pending) draftLockRef.current = null;
    });
    draftLockRef.current = pending;
    return pending;
  }

  async function go(next: number) {
    setStep(next);
    try {
      await ensureDraft(next);
    } catch {
      // ensureDraft / saveDraft already surfaces the error; the step stays reachable
    }
  }

  async function suggestCode() {
    if (!form.speName.trim()) return;
    const res = await fetch(`/api/deals?suggest=${encodeURIComponent(form.speName)}`);
    const json = (await res.json()) as { code?: string };
    if (json.code) setForm((f) => ({ ...f, speCode: json.code! }));
  }

  async function uploadFiles(fileList: FileList | File[], source: DealFileSource = "upload") {
    const files = Array.from(fileList);
    if (!files.length) {
      setError("Choose at least one file (CSV, XLSX, or PDF).");
      return;
    }
    const rows = initialUploadRows(files);
    setUploads(rows);
    const blocked = rows.filter((row) => row.progress === "error");
    if (blocked.length) {
      setError(blocked.map((row) => `${row.name}: ${row.error}`).join(" "));
    } else {
      setError(null);
    }

    let current: Intake;
    try {
      current = await ensureDraft(3);
    } catch (err) {
      const text = formatUploadFailure({ networkMessage: err instanceof Error ? err.message : "Failed to fetch" });
      setUploads(rows.map((row) => (row.progress === "queued" ? { ...row, progress: "error", error: text } : row)));
      setError(text);
      return;
    }

    if (isUntitledDealName(form.speName)) {
      const suggested = suggestIdentityFromFilenames(files.map((file) => file.name));
      if (suggested) setForm((prev) => ({ ...prev, speName: isUntitledDealName(prev.speName) ? suggested : prev.speName }));
    }

    let stored = 0;
    let latest = current;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]!;
      const key = `${i}:${file.name}`;
      if (file.size <= 0 || file.size > INTAKE_MAX_BYTES) continue;
      setUploads((prev) => prev.map((row) => (row.key === key ? { ...row, progress: "uploading" } : row)));
      const viaBlob = shouldUseClientBlobUpload(file.size, uploadPolicy);
      try {
        let res: Response;
        if (viaBlob) {
          if (!uploadPolicy.blobConfigured) {
            const message = blobTokenRequiredMessage({ filename: file.name, byteSize: file.size });
            setUploads((prev) => prev.map((row) => (row.key === key ? { ...row, progress: "error", error: message } : row)));
            setError(message);
            continue;
          }
          const blob = await uploadFileToVercelBlob(file, { intakeId: latest.id, source });
          res = await fetch("/api/deals/intake/files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intakeId: latest.id,
              source,
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              byteSize: file.size,
              blobUrl: blob.url,
            }),
          });
        } else {
          const body = new FormData();
          body.set("intakeId", latest.id);
          body.set("source", source);
          body.append("file", file);
          res = await fetch("/api/deals/intake/files", { method: "POST", body });
        }
        if (!res.ok) {
          const message = parseApiErrorText(res.status, await res.text(), "Upload failed", {
            filename: file.name,
            byteSize: file.size,
            blobConfigured: uploadPolicy.blobConfigured,
          });
          setUploads((prev) => prev.map((row) => (row.key === key ? { ...row, progress: "error", error: message } : row)));
          setError(message);
          continue;
        }
        const json = (await res.json()) as { intake?: Intake };
        if (json.intake) {
          hydrate(json.intake);
          latest = json.intake;
        }
        stored += 1;
        setUploads((prev) => prev.map((row) => (row.key === key ? { ...row, progress: "done", error: undefined } : row)));
      } catch (err) {
        const message = formatUploadFailure({
          networkMessage: err instanceof Error ? err.message : "Failed to fetch",
          filename: file.name,
          byteSize: file.size,
          blobConfigured: uploadPolicy.blobConfigured,
        });
        setUploads((prev) => prev.map((row) => (row.key === key ? { ...row, progress: "error", error: message } : row)));
        setError(message);
      }
    }
    if (stored) {
      setMessage(`${stored} file(s) stored one at a time. Inferring the deal name and ingesting…`);
      await autoIngest(latest.id);
    }
  }

  async function autoIngest(intakeId: string) {
    if (ingestLockRef.current) return;
    ingestLockRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/deals/intake/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId, action: "auto_ingest" }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Could not auto-ingest the deal."));
        return;
      }
      const json = (await res.json()) as {
        inferred: { speName: string | null; speCode: string | null; address: string | null };
        created: { entityCode: string | null; entityName: string | null };
        results: { kind: string; imported?: number; skipped?: string }[];
        gaps: string[];
        intake?: Intake;
      };
      setIngestReport({
        inferred: json.inferred,
        created: json.created,
        results: json.results,
        gaps: json.gaps,
      });
      if (json.intake) hydrate(json.intake);
      const imported = json.results.filter((row) => row.imported != null).map((row) => `${row.kind}: ${row.imported}`);
      setMessage(
        `Created ${json.created.entityName ?? "the SPE"} (${json.created.entityCode ?? "code pending"}). ${
          imported.length ? `Imported ${imported.join(", ")}.` : "Structured import skipped where columns did not match."
        }`,
      );
      setStep(8);
      await loadCompleteness(json.created.entityCode, form.targetPeriod);
    } catch (err) {
      setError(formatUploadFailure({ networkMessage: err instanceof Error ? err.message : "Failed to fetch" }));
    } finally {
      ingestLockRef.current = false;
      setBusy(false);
    }
  }

  async function removeFile(id: string) {
    setError(null);
    const res = await fetch(`/api/deals/intake/files?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readApiError(res, "Could not remove the file."));
      return;
    }
    if (!intake) return;
    const refresh = await fetch(`/api/deals/intake?id=${intake.id}`);
    const json = await refresh.json();
    if (json.id) hydrate(json as Intake);
  }

  async function classify(fileId: string, classification: DealFileClass) {
    setError(null);
    const res = await fetch("/api/deals/intake/files", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, classification }),
    });
    if (!res.ok) {
      setError(await readApiError(res, "Could not classify the file."));
      return;
    }
    if (!intake) return;
    setIntake({
      ...intake,
      files: intake.files.map((f) => (f.id === fileId ? { ...f, classification } : f)),
    });
  }

  async function loadDropbox() {
    const res = await fetch("/api/deals/intake/from-dropbox");
    const json = await res.json();
    setDropboxFiles(json.files ?? []);
    if (!json.configured) setMessage(json.message);
  }

  async function loadEmail() {
    const res = await fetch("/api/deals/intake/from-email");
    const json = await res.json();
    setEmailFiles(json.files ?? []);
    if (!json.configured) setMessage(json.message);
  }

  async function importRemote(kind: "dropbox" | "email") {
    const draft = await ensureDraft(3).catch(() => null);
    const id = draft?.id ?? intakeRef.current?.id;
    if (!id) return;
    const url = kind === "dropbox" ? "/api/deals/intake/from-dropbox" : "/api/deals/intake/from-email";
    const body = kind === "dropbox" ? { intakeId: id, paths: selectedRemote } : { intakeId: id, messageIds: selectedRemote };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not import remote files.");
      return;
    }
    if (json.intake) hydrate(json.intake as Intake);
    setSelectedRemote([]);
    setMessage("Remote files attached. Classify them next.");
  }

  async function scanMailbox() {
    const res = await fetch("/api/deals/intake/scan-mailbox", { method: "POST" });
    const json = await res.json();
    setMessage(json.message);
  }

  async function createEntity() {
    const saved = await saveDraft(5);
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deals/intake/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId: saved.id, action: "create_entity" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the SPE.");
      if (json.intake) hydrate(json.intake as Intake);
      setMessage(`Created ${json.intake?.speCode}. The chart of accounts was cloned from the master template.`);
      setStep(6);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyData() {
    const saved = await saveDraft(6);
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deals/intake/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeId: saved.id,
          action: "apply",
          confirmReplace,
          importRentRoll: true,
          importBudget: true,
          saveLoan: true,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setNeedsConfirm(true);
        setError(json.error);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Apply failed");
      if (json.intake) hydrate(json.intake as Intake);
      setNeedsConfirm(false);
      setMessage("Structured data applied. Review completeness next.");
      setStep(7);
      await loadCompleteness(json.intake?.entityCode, json.intake?.targetPeriod);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadCompleteness(code?: string | null, period?: string | null) {
    const entity = code || intake?.entityCode;
    const label = period || form.targetPeriod;
    if (!entity) return;
    const res = await fetch(`/api/expert/context?entity=${entity}&period=${label}&pathname=/deals/new`);
    const json = await res.json();
    if (json.completeness && !json.completeness.ok) return;
    if (json.completeness) setCompleteness(json.completeness as Completeness);
  }

  useEffect(() => {
    if (step === 7 && intake?.entityCode) void loadCompleteness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, intake?.entityCode]);

  const provider = (id: DealFileSource) => providers.find((p) => p.id === id);
  const qs = intake?.entityCode
    ? `entity=${intake.entityCode}&period=${form.targetPeriod}`
    : `entity=${form.parentOpCoCode}&period=${form.targetPeriod}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Add Deal · new property SPE</p>
        <h1 className="font-display text-4xl text-navy-900">Onboard a deal under OpCo</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700">
          New deals are <strong>SPE</strong> entities under {form.parentOpCoCode}. <strong>Drop files
          only</strong> — we infer the name and SPE code, classify, create the SPE when we can, and vault the
          rest. Dropbox, email, and the RCP mailbox stay visible even when they are not connected.
        </p>
      </div>

      <ol className="grid gap-2 md:grid-cols-8">
        {DEAL_WIZARD_STEPS.map((row) => {
          const active = step === row.id;
          const done = step > row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => void go(row.id)}
                className={`w-full border px-2 py-2 text-left ${
                  active
                    ? "border-gold-500 bg-navy-900 text-cream-50"
                    : done
                      ? "border-gold-400 bg-cream-50 text-navy-900"
                      : "border-cream-300 bg-white text-ink-600"
                }`}
              >
                <span className="block text-[10px] uppercase tracking-[0.14em]">{row.id}</span>
                <span className="block text-xs font-medium">{row.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {error ? (
        <p role="alert" className="border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      {message ? <p className="border border-gold-300 bg-cream-50 px-4 py-3 text-sm text-ink-700">{message}</p> : null}

      <div className="border border-cream-300 bg-white px-6 py-6 shadow-ledger">
        {step === 1 ? (
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-navy-900">What are you onboarding?</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {GOALS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, goal: goal.id }))}
                  className={`border px-4 py-4 text-left ${
                    form.goal === goal.id ? "border-gold-500 bg-cream-50" : "border-cream-300"
                  }`}
                >
                  <p className="font-display text-xl text-navy-900">{goal.title}</p>
                  <p className="mt-1 text-sm text-ink-600">{goal.copy}</p>
                </button>
              ))}
            </div>
            <label className="block text-sm text-ink-700">
              Target period
              <select
                className={fieldClass()}
                value={form.targetPeriod}
                onChange={(e) => setForm((f) => ({ ...f, targetPeriod: e.target.value }))}
              >
                {[...new Set([...periodLabels, form.targetPeriod, "2026-07", "2026-08"])].map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-navy-900">SPE identity</h2>
            <p className="text-sm text-ink-600">
              This becomes a legal entity under OpCo. The code should look like <code>SPE-XXX</code>. You can
              upload source files first and fill this in later — Create SPE still requires a real name and
              code.
            </p>
            <label className="block text-sm text-ink-700">
              SPE legal name
              <input
                className={fieldClass()}
                value={form.speName}
                onChange={(e) => setForm((f) => ({ ...f, speName: e.target.value }))}
                onBlur={() => void suggestCode()}
                placeholder="Riverside Terrace LLC"
              />
            </label>
            <label className="block text-sm text-ink-700">
              SPE code
              <div className="mt-1 flex gap-2">
                <input
                  className={`${fieldClass()} mt-0`}
                  value={form.speCode}
                  onChange={(e) => setForm((f) => ({ ...f, speCode: e.target.value.toUpperCase() }))}
                  placeholder="SPE-RT"
                />
                <button type="button" className="border border-navy-900 px-3 text-xs uppercase tracking-[0.12em]" onClick={() => void suggestCode()}>
                  Suggest
                </button>
              </div>
            </label>
            <label className="block text-sm text-ink-700">
              Unit count
              <input
                className={fieldClass()}
                inputMode="numeric"
                value={form.unitCount}
                onChange={(e) => setForm((f) => ({ ...f, unitCount: e.target.value }))}
                placeholder="216"
              />
            </label>
            <label className="block text-sm text-ink-700">
              Parent OpCo
              <select
                className={fieldClass()}
                value={form.parentOpCoCode}
                onChange={(e) => setForm((f) => ({ ...f, parentOpCoCode: e.target.value }))}
              >
                {opcos.map((opco) => (
                  <option key={opco.code} value={opco.code}>
                    {opco.name} ({opco.code})
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-5">
            <h2 className="font-display text-2xl text-navy-900">Source files</h2>
            <p className="text-sm text-ink-600">
              Upload before naming the deal if you want. A draft titled <strong>Untitled deal</strong> is
              created automatically. Files are sent <strong>one at a time</strong> (CSV, XLSX/XLS, PDF — max{" "}
              {INTAKE_MAX_BYTES_LABEL} <strong>each</strong>, never summed). A 5.5 MB OM is a valid product file.
              Files over ~3.5 MB upload through <strong>Vercel Blob</strong> so they never hit the ~4.5 MB
              serverless body limit (HTTP 413). If Blob is not connected you will see: “OM is 5.5 MB — add{" "}
              <code>BLOB_READ_WRITE_TOKEN</code> in Vercel (Storage → Blob) or upload Excel first and add OM
              after Blob is connected.”
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["upload", "Upload files", "Primary path. Works without any partner login."],
                  ["dropbox", "Import from Dropbox", provider("dropbox")?.message ?? "Connect Dropbox when a token is present."],
                  ["email_attachment", "Email attachment", provider("email_attachment")?.message ?? "Upload a .eml or the attachment files."],
                  ["rcp_mailbox", "RCP mailbox", provider("rcp_mailbox")?.message ?? "Mailbox address is not decided yet."],
                ] as const
              ).map(([id, title, copy]) => {
                const on = form.sources.includes(id);
                const configured = provider(id)?.configured ?? id === "upload";
                return (
                  <div
                    key={id}
                    className={`border px-4 py-3 text-left ${on ? "border-gold-500 bg-cream-50" : "border-cream-300"}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          sources: on ? f.sources.filter((s) => s !== id) : [...f.sources, id],
                        }))
                      }
                      className="w-full text-left"
                    >
                      <p className="font-display text-lg text-navy-900">{title}</p>
                      <p className="mt-1 text-xs text-ink-600">{copy}</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-gold-700">
                        {configured ? "Connected" : id === "upload" ? "Ready" : "Not connected"}
                      </p>
                    </button>
                    {id === "rcp_mailbox" ? (
                      <button
                        type="button"
                        onClick={() => void scanMailbox()}
                        className="mt-3 border border-navy-900 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-navy-900"
                      >
                        Scan RCP inbox
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {form.sources.includes("upload") ? (
              <FileDropzone
                onFiles={(files) => void uploadFiles(files, "upload")}
                hint={`Drop rent-roll XLSX/CSV, budget workbook, loan PDFs, OM. Max ${INTAKE_MAX_BYTES_LABEL} per file (not combined). Files over ~3.5 MB use Vercel Blob, not the serverless request body.`}
              />
            ) : null}

            {form.sources.includes("dropbox") ? (
              <div className="border border-cream-300 bg-cream-50 px-4 py-3">
                <p className="text-sm font-medium text-navy-900">Dropbox</p>
                {provider("dropbox")?.configured ? (
                  <>
                    <button type="button" className="mt-2 text-xs uppercase tracking-[0.12em] underline" onClick={() => void loadDropbox()}>
                      List Dropbox files
                    </button>
                    <RemotePicker files={dropboxFiles} selected={selectedRemote} onToggle={setSelectedRemote} />
                    <button type="button" className="mt-2 bg-navy-900 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-cream-50" onClick={() => void importRemote("dropbox")}>
                      Attach selected
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-ink-600">{provider("dropbox")?.message}</p>
                )}
              </div>
            ) : null}

            {form.sources.includes("email_attachment") ? (
              <div className="border border-cream-300 bg-cream-50 px-4 py-3 space-y-3">
                <p className="text-sm font-medium text-navy-900">Email attachment</p>
                <p className="text-sm text-ink-600">
                  Upload the attachment files or a forwarded <code>.eml</code>. If a mailbox connector is
                  configured, you can also pick a message.
                </p>
                <FileDropzone onFiles={(files) => void uploadFiles(files, "email_attachment")} hint="Drop .eml or attachment files." />
                {provider("email_attachment")?.configured ? (
                  <>
                    <button type="button" className="text-xs uppercase tracking-[0.12em] underline" onClick={() => void loadEmail()}>
                      List mailbox messages
                    </button>
                    <RemotePicker files={emailFiles} selected={selectedRemote} onToggle={setSelectedRemote} />
                    <button type="button" className="bg-navy-900 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-cream-50" onClick={() => void importRemote("email")}>
                      Pull selected message
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-ink-600">{provider("email_attachment")?.message}</p>
                )}
              </div>
            ) : null}

            {form.sources.includes("rcp_mailbox") ? (
              <div className="border border-dashed border-gold-400 bg-cream-50 px-4 py-3">
                <p className="text-sm font-medium text-navy-900">Scan RCP inbox</p>
                <p className="mt-1 text-sm text-ink-600">{provider("rcp_mailbox")?.message}</p>
                <button type="button" className="mt-3 border border-navy-900 px-3 py-1.5 text-xs uppercase tracking-[0.12em]" onClick={() => void scanMailbox()}>
                  Scan RCP inbox
                </button>
              </div>
            ) : null}

            {uploads.length ? (
              <ul className="space-y-1 text-sm text-ink-700">
                {uploads.map((row) => (
                  <li key={row.key}>
                    {row.name} — {row.progress}
                    {row.error ? ` (${row.error})` : ""}
                  </li>
                ))}
              </ul>
            ) : null}

            {intake?.files.length ? (
              <p className="text-sm text-ink-600">{intake.files.length} file(s) on this draft.</p>
            ) : null}
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-navy-900">Classify files</h2>
            <p className="text-sm text-ink-600">
              Map each file so it lands in the vault with the right kind. Broker rent-roll XLSX
              (Unit / Market Rent / Lease Rent / Status) is applied to Unit rows — not vault-only.
              If columns cannot be mapped you will see <strong>could not map columns</strong> with the
              detected headers.
            </p>
            {!intake?.files.length ? (
              <p className="text-sm text-ink-600">No files yet. Go back and upload, or continue if you will add files later.</p>
            ) : (
              <ul className="space-y-3">
                {intake.files.map((file) => (
                  <li key={file.id} className="border border-cream-300 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-navy-900">{file.filename}</p>
                        <p className="text-xs text-ink-500">
                          {(file.byteSize / 1024).toFixed(1)} KB · {file.source} · {file.status}
                          {file.lastError ? ` · ${file.lastError}` : ""}
                        </p>
                      </div>
                      <button type="button" className="text-xs uppercase tracking-[0.12em] text-red-800" onClick={() => void removeFile(file.id)}>
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {DEAL_FILE_CLASSES.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => void classify(file.id, kind)}
                          className={`px-2 py-1 text-[11px] uppercase tracking-[0.1em] ${
                            file.classification === kind ? "bg-navy-900 text-cream-50" : "border border-cream-300 text-ink-600"
                          }`}
                        >
                          {DEAL_FILE_CLASS_LABELS[kind]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {step === 5 ? (
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-navy-900">Create the SPE</h2>
            <p className="text-sm text-ink-700">
              This creates <strong>{form.speCode || "SPE-…"}</strong> ({form.speName || "name pending"}) under{" "}
              {form.parentOpCoCode}, clones the master chart of accounts, and opens the target period plus the
              demo months so the header switcher still works.
            </p>
            {intake?.entityCode ? (
              <p className="border border-gold-300 bg-cream-50 px-4 py-3 text-sm">
                Already created: <strong>{intake.entityCode}</strong>. Continue to apply rent-roll / budget / loan.
              </p>
            ) : (
              <button
                type="button"
                disabled={busy || !form.speName || !form.speCode}
                onClick={() => void createEntity()}
                className="bg-navy-900 px-5 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-50"
              >
                Create SPE and clone CoA
              </button>
            )}
          </section>
        ) : null}

        {step === 6 ? (
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-navy-900">Apply structured data</h2>
            <p className="text-sm text-ink-600">
              Optional. Rent-roll XLSX/CSV (broker headers or the RCP template) writes Unit rows used
              by occupancy KPIs. If rows already exist, you must confirm a full replace.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-ink-700">
                Lender
                <input className={fieldClass()} value={form.loanLender} onChange={(e) => setForm((f) => ({ ...f, loanLender: e.target.value }))} />
              </label>
              <label className="block text-sm text-ink-700">
                Loan name
                <input className={fieldClass()} value={form.loanName} onChange={(e) => setForm((f) => ({ ...f, loanName: e.target.value }))} />
              </label>
              <label className="block text-sm text-ink-700">
                Unpaid principal (USD)
                <input className={fieldClass()} value={form.loanUpbUsd} onChange={(e) => setForm((f) => ({ ...f, loanUpbUsd: e.target.value }))} placeholder="18500000.00" />
              </label>
              <label className="block text-sm text-ink-700">
                Annual rate %
                <input className={fieldClass()} value={form.loanRatePercent} onChange={(e) => setForm((f) => ({ ...f, loanRatePercent: e.target.value }))} placeholder="5.68" />
              </label>
              <label className="block text-sm text-ink-700">
                Monthly payment (USD)
                <input className={fieldClass()} value={form.loanPaymentUsd} onChange={(e) => setForm((f) => ({ ...f, loanPaymentUsd: e.target.value }))} />
              </label>
              <label className="block text-sm text-ink-700">
                Maturity
                <input type="date" className={fieldClass()} value={form.loanMaturity} onChange={(e) => setForm((f) => ({ ...f, loanMaturity: e.target.value }))} />
              </label>
              <label className="block text-sm text-ink-700">
                Origination
                <input type="date" className={fieldClass()} value={form.loanOrigination} onChange={(e) => setForm((f) => ({ ...f, loanOrigination: e.target.value }))} />
              </label>
              <label className="block text-sm text-ink-700">
                DSCR threshold (e.g. 1.25)
                <input className={fieldClass()} value={form.dscrThreshold} onChange={(e) => setForm((f) => ({ ...f, dscrThreshold: e.target.value }))} />
              </label>
              <label className="block text-sm text-ink-700">
                Debt-yield threshold %
                <input className={fieldClass()} value={form.debtYieldThresholdPercent} onChange={(e) => setForm((f) => ({ ...f, debtYieldThresholdPercent: e.target.value }))} />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
              I understand rent-roll / budget import <strong>replaces</strong> existing rows for this SPE.
            </label>
            {needsConfirm ? (
              <p className="text-sm text-red-800">Check the box above, then apply again. This is a destructive replace.</p>
            ) : null}
            <button
              type="button"
              disabled={busy || !intake?.entityId}
              onClick={() => void applyData()}
              className="bg-navy-900 px-5 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-50"
            >
              Apply rent roll, budget, and loan
            </button>
            <p className="text-xs text-ink-500">
              Samples: <code>data/samples/rent-roll.csv</code>, <code>data/samples/rent-roll.xlsx</code>,{" "}
              <code>data/samples/budget.csv</code>. Max {INTAKE_MAX_BYTES_LABEL} per file. LTV is not
              invented from book cost.
            </p>
          </section>
        ) : null}

        {step === 7 ? (
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-navy-900">Completeness</h2>
            {completeness ? (
              <>
                <p className="font-display text-3xl text-navy-900">
                  {completeness.score}/100{" "}
                  <span className="text-base text-ink-500">
                    ({completeness.ready}/{completeness.applicable} ready)
                  </span>
                </p>
                <ul className="space-y-2 text-sm">
                  {completeness.items
                    .filter((item) => item.status !== "na")
                    .map((item) => (
                      <li key={item.id} className="border border-cream-300 px-3 py-2">
                        <span className="uppercase tracking-[0.12em] text-[11px] text-gold-700">{item.status}</span>{" "}
                        <strong>{item.label}</strong> — {item.detail}
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-ink-600">Create the SPE first, then Expert can score what is still missing.</p>
            )}
          </section>
        ) : null}

        {step === 8 ? (
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-navy-900">
              {ingestReport?.created.entityCode ? "Here’s what we created" : "Deal is on the books"}
            </h2>
            <p className="text-sm text-ink-700">
              {intake?.entityCode ? (
                <>
                  <strong>{intake.entityName ?? intake.speName}</strong> ({intake.entityCode}) is in the entity
                  switcher. Open the screens below, or ask Expert to walk you through month-end.
                </>
              ) : (
                "Create the SPE on step 5 to unlock deep links, or drop files on Source files for upload-only ingest."
              )}
            </p>
            {ingestReport ? (
              <div className="space-y-3 border border-gold-300 bg-cream-50 px-4 py-3 text-sm text-ink-700">
                <p>
                  Inferred <strong>{ingestReport.inferred.speName ?? "name pending"}</strong>
                  {ingestReport.inferred.speCode ? ` · ${ingestReport.inferred.speCode}` : ""}.
                  {ingestReport.inferred.address
                    ? ` Address: ${ingestReport.inferred.address}.`
                    : " No street address in the filenames — left blank."}
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {ingestReport.results.map((row) => (
                    <li key={row.kind}>
                      {row.kind}
                      {row.imported != null ? ` — imported ${row.imported}` : ""}
                      {row.skipped ? ` — ${row.skipped}` : ""}
                    </li>
                  ))}
                </ul>
                {ingestReport.gaps.length ? (
                  <div>
                    <p className="font-medium text-navy-900">Still needs a human / Expert</p>
                    <ul className="mt-1 list-disc pl-5">
                      {ingestReport.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {intake?.entityCode ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  [`/dashboard/${intake.entityCode}`, "Dashboard"],
                  [`/properties/${intake.entityCode}`, "Properties / rent roll"],
                  ["/debt", "Debt"],
                  ["/vault", "Vault"],
                  ["/narratives", "Narratives"],
                  ["/close", "Period close"],
                ].map(([href, label]) => (
                  <Link key={href} href={`${href}?${qs}`} className="border border-cream-300 px-4 py-3 hover:border-gold-500">
                    {label}
                  </Link>
                ))}
              </div>
            ) : null}
            <Link href={`/?${qs}&expert=1`} className="inline-block bg-gold-500 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950">
              Ask Expert to walk me through month-end
            </Link>
          </section>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={step === 1 || busy}
          onClick={() => void go(step - 1)}
          className="border border-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
        >
          Back
        </button>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void saveDraft(step)} className="border border-gold-500 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900">
            Save draft
          </button>
          {step < 8 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void go(step + 1)}
              className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50"
            >
              Continue
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-500">
        File cap {INTAKE_MAX_BYTES / (1024 * 1024)} MB · OM over ~3.5 MB needs BLOB_READ_WRITE_TOKEN · tokens stay on the server
      </p>
    </div>
  );
}

function FileDropzone({ onFiles, hint }: { onFiles: (files: File[]) => void; hint: string }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`block cursor-pointer border-2 border-dashed px-4 py-8 text-center ${
        over ? "border-gold-500 bg-cream-50" : "border-cream-400 bg-white"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.doc,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <p className="font-display text-xl text-navy-900">Drop files here or click to choose</p>
      <p className="mt-1 text-sm text-ink-600">{hint}</p>
    </label>
  );
}

function RemotePicker({
  files,
  selected,
  onToggle,
}: {
  files: { id: string; name: string }[];
  selected: string[];
  onToggle: (next: string[]) => void;
}) {
  if (!files.length) return null;
  return (
    <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
      {files.map((file) => {
        const on = selected.includes(file.id);
        return (
          <li key={file.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(on ? selected.filter((id) => id !== file.id) : [...selected, file.id])}
              />
              {file.name}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
