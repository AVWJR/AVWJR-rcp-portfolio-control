"use client";

import { FEE_NEEDED } from "@/lib/library/fees";
import type { DealProfile } from "@/lib/library/facts";
import { useState } from "react";
import { useRouter } from "next/navigation";

function centsField(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function bpsField(bps: number | null): string {
  if (bps == null) return "";
  return (bps / 100).toFixed(2);
}

export function DealLibraryForm({
  profile,
  states,
  metros,
  propertyTypes,
}: {
  profile: DealProfile;
  states: string[];
  metros: string[];
  propertyTypes: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    streetAddress: profile.streetAddress ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    metro: profile.metro ?? "",
    msa: profile.msa ?? "",
    submarket: profile.submarket ?? "",
    propertyType: profile.propertyType ?? "",
    vintageYear: profile.vintageYear == null ? "" : String(profile.vintageYear),
    assetClass: profile.assetClass ?? "",
    unitCountOverride: profile.unitCountOverride == null ? "" : String(profile.unitCountOverride),
    businessPlan: profile.businessPlan ?? "",
    holdPeriodYears: profile.holdPeriodYears == null ? "" : String(profile.holdPeriodYears),
    purchasePriceUsd: centsField(profile.purchasePriceCents),
    appraisedValueUsd: centsField(profile.appraisedValueCents),
    renovationBudgetUsd: centsField(profile.renovationBudgetCents),
    amFeePercent: bpsField(profile.amFeeBps),
    otherLpFeeUsd: centsField(profile.otherLpFeeCents),
    otherLpFeeNote: profile.otherLpFeeNote ?? "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/deals/${profile.code}/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
      setMessage("Library fields saved. A new metro was added to the list. Nothing was deleted.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-900";

  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">Library fields</h2>
      <p className="mt-1 text-sm text-ink-700">
        Rent roll units on file: {profile.unitCount ?? "—"}. Override only when the OM count should win. Fees stay blank until you type them.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm text-ink-700">Street<input className={field} value={form.streetAddress} onChange={(e) => set("streetAddress", e.target.value)} /></label>
        <label className="text-sm text-ink-700">City<input className={field} value={form.city} onChange={(e) => set("city", e.target.value)} /></label>
        <label className="text-sm text-ink-700">
          State
          <select className={field} value={form.state} onChange={(e) => set("state", e.target.value)}>
            <option value="">—</option>
            {states.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-700">
          Metro
          <input className={field} list="library-metros" value={form.metro} onChange={(e) => set("metro", e.target.value)} />
          <datalist id="library-metros">
            {metros.map((metro) => (
              <option key={metro} value={metro} />
            ))}
          </datalist>
        </label>
        <label className="text-sm text-ink-700">MSA<input className={field} value={form.msa} onChange={(e) => set("msa", e.target.value)} /></label>
        <label className="text-sm text-ink-700">Submarket<input className={field} value={form.submarket} onChange={(e) => set("submarket", e.target.value)} /></label>
        <label className="text-sm text-ink-700">
          Property type
          <select className={field} value={form.propertyType} onChange={(e) => set("propertyType", e.target.value)}>
            <option value="">—</option>
            {propertyTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-700">
          Class
          <select className={field} value={form.assetClass} onChange={(e) => set("assetClass", e.target.value)}>
            <option value="">—</option>
            {["A", "B", "C"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-700">Vintage (year built)<input className={field} value={form.vintageYear} onChange={(e) => set("vintageYear", e.target.value)} /></label>
        <label className="text-sm text-ink-700">Unit count override<input className={field} value={form.unitCountOverride} onChange={(e) => set("unitCountOverride", e.target.value)} /></label>
        <label className="text-sm text-ink-700">
          Business plan
          <select className={field} value={form.businessPlan} onChange={(e) => set("businessPlan", e.target.value)}>
            <option value="">—</option>
            {["Value-add", "Stabilized", "Light rehab"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-700">Hold period (years)<input className={field} value={form.holdPeriodYears} onChange={(e) => set("holdPeriodYears", e.target.value)} /></label>
        <label className="text-sm text-ink-700">Purchase price (USD)<input className={field} value={form.purchasePriceUsd} onChange={(e) => set("purchasePriceUsd", e.target.value)} /></label>
        <label className="text-sm text-ink-700">Appraised value (USD)<input className={field} value={form.appraisedValueUsd} onChange={(e) => set("appraisedValueUsd", e.target.value)} /></label>
        <label className="text-sm text-ink-700">Renovation budget (USD)<input className={field} value={form.renovationBudgetUsd} onChange={(e) => set("renovationBudgetUsd", e.target.value)} /></label>
        <label className="text-sm text-ink-700">
          AM fee (% of the deal)
          <input className={field} value={form.amFeePercent} placeholder={FEE_NEEDED} onChange={(e) => set("amFeePercent", e.target.value)} />
          {form.amFeePercent.trim() ? null : <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-gold-700">{FEE_NEEDED}</span>}
        </label>
        <label className="text-sm text-ink-700">
          Other LP fees (USD)
          <input className={field} value={form.otherLpFeeUsd} placeholder={FEE_NEEDED} onChange={(e) => set("otherLpFeeUsd", e.target.value)} />
          {form.otherLpFeeUsd.trim() ? null : <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-gold-700">{FEE_NEEDED}</span>}
        </label>
        <label className="text-sm text-ink-700 md:col-span-2">What the other LP fee covers<input className={field} value={form.otherLpFeeNote} onChange={(e) => set("otherLpFeeNote", e.target.value)} /></label>
      </div>
      <button type="button" disabled={busy} onClick={() => void save()} className="mt-4 bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-40">
        Save library fields
      </button>
      {message ? <p className="mt-2 text-sm text-navy-900">{message}</p> : null}
    </section>
  );
}
