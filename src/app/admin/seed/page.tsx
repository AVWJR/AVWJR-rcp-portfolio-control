import type { Metadata } from "next";
import { SeedDemoForm } from "@/components/seed-demo-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Load demo data",
  robots: { index: false, follow: false },
};

export default function AdminSeedPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Roche Capital Partners</p>
      <h1 className="font-display text-4xl text-navy-900">Load demo data</h1>
      <p className="mt-3 text-sm text-ink-700">
        Use this once after the first Vercel + Neon deploy, when the database is empty. Paste the{" "}
        <code className="text-xs">SEED_SECRET</code> from the Vercel project environment. This writes
        sample books, rent rolls, and tax-bridge <strong>demo</strong> rows only — it does not file
        taxes and does not replace a CPA.
      </p>
      <div className="mt-6">
        <SeedDemoForm />
      </div>
    </main>
  );
}
