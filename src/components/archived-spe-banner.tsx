import Link from "next/link";

export function ArchivedSpeBanner({
  code,
  period,
}: {
  code: string;
  period: string;
}) {
  return (
    <div className="border border-gold-500 bg-gold-50 px-5 py-3 text-sm text-navy-900">
      <p className="font-semibold">{code} is in Deal Archive</p>
      <p className="mt-1 text-ink-700">
        It is off the live Deals list and out of the OpCo combined roll-up. Books and vault stay for
        study. Restore only from gold nav <strong>Deal Archive</strong> — not under Deals.
      </p>
      <Link className="mt-2 inline-block text-navy-800 underline" href={`/archive?entity=RCP-OPCO&period=${period}`}>
        Open Deal Archive
      </Link>
    </div>
  );
}
