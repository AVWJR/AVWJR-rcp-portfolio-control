"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Roche Capital Partners</p>
      <h1 className="mt-2 font-display text-4xl text-navy-900">This screen could not load</h1>
      <p className="mt-3 text-sm text-ink-700">
        Switch the navy header to <strong>2026-08</strong> and retry. A rent-roll as-of year is not the OpCo close
        month.
      </p>
      {error.digest ? <p className="mt-2 text-xs text-ink-500">Digest {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="border border-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em]"
        >
          Retry
        </button>
        <Link href="/?period=2026-08" className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50">
          Overview · 2026-08
        </Link>
      </div>
    </div>
  );
}
