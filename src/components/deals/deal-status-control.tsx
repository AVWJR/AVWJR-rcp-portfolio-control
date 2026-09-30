"use client";

import { ownedEntryCopy, ownedExitCopy, permanentDemoStatusMessage } from "@/lib/deal-status";
import type { DealProfile } from "@/lib/library/facts";
import { useState } from "react";
import { useRouter } from "next/navigation";

const CHOICES = [
  { id: "PIPELINE", label: "Pipeline" },
  { id: "SCREENED", label: "Screened" },
  { id: "OWNED", label: "Owned" },
  { id: "TEST", label: "Test" },
] as const;

export function DealStatusControl({ profile }: { profile: DealProfile }) {
  const router = useRouter();
  const [toStatus, setToStatus] = useState(profile.dealStatus === "ARCHIVED" ? "OWNED" : profile.dealStatus);
  const [reason, setReason] = useState("");
  const [dialog, setDialog] = useState<null | "exit" | "enter" | "locked">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile.lifecycleStatus === "ARCHIVED") {
    return (
      <p className="border border-cream-300 bg-cream-100 px-4 py-3 text-sm text-navy-900">
        This deal is Archived. Restore it from Deal Archive. That does not delete books or files.
      </p>
    );
  }

  async function submit(flags: { confirmRollup?: boolean; confirmOwned?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${profile.code}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, reason, ...flags }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not change status.");
      const posted = Number(json.deal?.postedT12Lines ?? 0);
      setNotice(posted > 0 ? `Posted ${posted} broker T12 lines into the books.` : null);
      setDialog(null);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change status.");
      setDialog(null);
    } finally {
      setBusy(false);
    }
  }

  function ask() {
    setError(null);
    if (toStatus === profile.dealStatus) {
      setError("That is already the status.");
      return;
    }
    if (!reason.trim()) {
      setError("Say why you are changing the status.");
      return;
    }
    if (profile.dealStatus === "OWNED" && profile.permanentDemo) {
      setDialog("locked");
      return;
    }
    if (profile.dealStatus === "OWNED" && toStatus !== "OWNED") {
      setDialog("exit");
      return;
    }
    if (toStatus === "OWNED") {
      setDialog("enter");
      return;
    }
    void submit({});
  }

  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">Deal status</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-700">
        Only Owned deals feed the OpCo roll-up, month-end close, and the distribution ledger. Pipeline, Screened, and Test keep their analysis off the books. Marking one Owned posts its saved broker T12 into the books. Archive a deal that is not Owned with Delete on this page.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-ink-700">
          Status
          <select
            className="mt-1 block border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-900"
            value={toStatus}
            onChange={(event) => setToStatus(event.target.value as typeof toStatus)}
          >
            {CHOICES.map((choice) => (
              <option key={choice.id} value={choice.id}>{choice.label}</option>
            ))}
          </select>
        </label>
        <label className="min-w-64 flex-1 text-sm text-ink-700">
          Why
          <input className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="button" onClick={ask} className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50">
          Update status
        </button>
      </div>
      {notice ? <p className="mt-2 text-sm text-navy-900">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 px-4" role="dialog" aria-modal="true">
          <div className="max-w-lg border border-gold-500 bg-cream-50 px-6 py-5 shadow-ledger">
            <h3 className="font-display text-2xl text-navy-900">
              {dialog === "locked" ? "Stays Owned" : dialog === "exit" ? "Leave the OpCo books?" : "Put this deal in the books?"}
            </h3>
            <p className="mt-2 text-sm text-ink-800">
              {dialog === "locked"
                ? permanentDemoStatusMessage(profile.code)
                : dialog === "exit"
                  ? ownedExitCopy(profile.code, profile.name)
                  : ownedEntryCopy(profile.code, profile.name)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {dialog === "exit" ? (
                <button type="button" disabled={busy} onClick={() => void submit({ confirmRollup: true })} className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50">
                  Move out of Owned
                </button>
              ) : null}
              {dialog === "enter" ? (
                <button type="button" disabled={busy} onClick={() => void submit({ confirmOwned: true })} className="bg-gold-500 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950">
                  Mark Owned
                </button>
              ) : null}
              <button type="button" onClick={() => setDialog(null)} className="border border-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900">
                {dialog === "locked" ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
