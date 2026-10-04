"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass = "mt-1 w-full border border-cream-300 bg-white px-3 py-2 text-sm text-ink-900";

async function postPlan(code: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/deals/${code}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not save.");
}

export function WeeklyUpdateForm({ code, period }: { code: string; period: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      await postPlan(code, {
        action: "weekly",
        period,
        sourceName: formData.get("sourceName"),
        sourceType: formData.get("sourceType"),
        geography: formData.get("geography"),
        floorplan: formData.get("floorplan"),
        beds: formData.get("beds"),
        value: formData.get("value"),
        rangeLow: formData.get("rangeLow"),
        rangeHigh: formData.get("rangeHigh"),
        trendNote: formData.get("trendNote"),
        vintageDate: formData.get("vintageDate"),
        asOfDate: formData.get("asOfDate"),
        retrievedAt: formData.get("retrievedAt"),
        termsNote: formData.get("termsNote"),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
      <label className="text-sm text-ink-700">
        Source name
        <input name="sourceName" required className={inputClass} placeholder="PM weekly comp survey" />
      </label>
      <label className="text-sm text-ink-700">
        Source type
        <select name="sourceType" className={inputClass} defaultValue="PM_COMP">
          <option value="PM_COMP">PM comp survey — public asking rents and specials</option>
          <option value="PUBLIC">Other permitted public source</option>
          <option value="ZORI">Zillow ZORI, uploaded by hand</option>
        </select>
      </label>
      <label className="text-sm text-ink-700">
        Geography
        <input name="geography" required className={inputClass} placeholder="ZIP, county, or metro" />
      </label>
      <label className="text-sm text-ink-700">
        Floor plan, if this figure is for one plan
        <input name="floorplan" className={inputClass} />
      </label>
      <label className="text-sm text-ink-700">
        Bedrooms, if applicable
        <input name="beds" className={inputClass} inputMode="numeric" />
      </label>
      <label className="text-sm text-ink-700">
        Value (dollars)
        <input name="value" className={inputClass} inputMode="decimal" placeholder="Leave blank if you only have a trend" />
      </label>
      <label className="text-sm text-ink-700">
        Range low
        <input name="rangeLow" className={inputClass} inputMode="decimal" />
      </label>
      <label className="text-sm text-ink-700">
        Range high
        <input name="rangeHigh" className={inputClass} inputMode="decimal" />
      </label>
      <label className="text-sm text-ink-700 md:col-span-2">
        Trend note
        <input name="trendNote" className={inputClass} />
      </label>
      <label className="text-sm text-ink-700">
        Vintage or release date
        <input name="vintageDate" type="date" className={inputClass} />
      </label>
      <label className="text-sm text-ink-700">
        As-of date
        <input name="asOfDate" type="date" required className={inputClass} />
      </label>
      <label className="text-sm text-ink-700">
        Date retrieved
        <input name="retrievedAt" type="date" required className={inputClass} />
      </label>
      <label className="text-sm text-ink-700 md:col-span-2">
        Terms note
        <input name="termsNote" required className={inputClass} placeholder="Public asking rents only. For ZORI, include Data Provided by Zillow Group." />
      </label>
      {error ? <p className="text-sm text-rose-800 md:col-span-2">{error}</p> : null}
      <div>
        <button type="submit" disabled={busy} className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-60">
          {busy ? "Saving…" : "Save weekly update"}
        </button>
      </div>
    </form>
  );
}

export function IncomeIdeaForm({ code, period }: { code: string; period: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      await postPlan(code, {
        action: "income",
        period,
        category: formData.get("category"),
        title: formData.get("title"),
        currentCapture: formData.get("currentCapture"),
        fullRollout: formData.get("fullRollout"),
        setupCost: formData.get("setupCost"),
        ownerName: formData.get("ownerName"),
        steps: formData.get("steps"),
        legalNote: formData.get("legalNote"),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
      <label className="text-sm text-ink-700">
        Category
        <select name="category" className={inputClass} defaultValue="Pet">
          <option>Pet</option>
          <option>Parking</option>
          <option>Storage</option>
          <option>Trash</option>
          <option>RUBS / utilities</option>
          <option>Other</option>
        </select>
      </label>
      <label className="text-sm text-ink-700">
        Short name
        <input name="title" required className={inputClass} placeholder="Pet rent on new leases" />
      </label>
      <label className="text-sm text-ink-700">
        Current capture (dollars per month)
        <input name="currentCapture" className={inputClass} inputMode="decimal" />
      </label>
      <label className="text-sm text-ink-700">
        Full rollout (dollars per month)
        <input name="fullRollout" className={inputClass} inputMode="decimal" />
      </label>
      <label className="text-sm text-ink-700">
        Setup cost
        <input name="setupCost" className={inputClass} inputMode="decimal" />
      </label>
      <label className="text-sm text-ink-700">
        Owner
        <input name="ownerName" className={inputClass} />
      </label>
      <label className="text-sm text-ink-700 md:col-span-2">
        Steps
        <input name="steps" className={inputClass} />
      </label>
      <label className="text-sm text-ink-700 md:col-span-2">
        Lease or legal review note
        <input name="legalNote" className={inputClass} />
      </label>
      {error ? <p className="text-sm text-rose-800 md:col-span-2">{error}</p> : null}
      <div>
        <button type="submit" disabled={busy} className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-60">
          {busy ? "Saving…" : "Add income idea"}
        </button>
      </div>
    </form>
  );
}

export function DecisionButtons({
  code,
  period,
  opportunityId,
}: {
  code: string;
  period: string;
  opportunityId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState<"APPROVE" | "DECLINE" | null>(null);

  async function decide(decision: "APPROVE" | "DECLINE") {
    setBusy(decision);
    setError(null);
    try {
      await postPlan(code, { action: "decide", period, opportunityId, decision, reason, ownerName, dueDate });
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why you are approving or declining" className={inputClass} />
      <div className="grid gap-2 md:grid-cols-2">
        <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Action owner" className={inputClass} />
        <input value={dueDate} onChange={(event) => setDueDate(event.target.value)} type="date" className={inputClass} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy != null} onClick={() => decide("APPROVE")} className="bg-gold-500 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950 disabled:opacity-60">
          {busy === "APPROVE" ? "Saving…" : "Approve idea"}
        </button>
        <button type="button" disabled={busy != null} onClick={() => decide("DECLINE")} className="border border-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900 disabled:opacity-60">
          {busy === "DECLINE" ? "Saving…" : "Decline idea"}
        </button>
      </div>
      {error ? <p className="text-sm text-rose-800">{error}</p> : null}
    </div>
  );
}
