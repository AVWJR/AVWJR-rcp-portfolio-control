import { periodStatusLabel } from "@/lib/period-close";
import type { PeriodStatus } from "@prisma/client";
import Link from "next/link";

export function PeriodBanner({
  status,
  entityCode,
  period,
}: {
  status: PeriodStatus;
  entityCode: string;
  period: string;
}) {
  if (status === "OPEN") return null;
  const locked = status === "CLOSED";
  return (
    <div
      className={`mb-6 border px-4 py-3 text-sm ${
        locked ? "border-navy-900 bg-navy-900 text-cream-100" : "border-gold-500 bg-gold-100 text-navy-900"
      }`}
    >
      <p className="font-semibold">
        {entityCode} {period} is {periodStatusLabel(status).toLowerCase()}.
      </p>
      <p className="mt-1 text-xs">
        {locked
          ? "Hard lock: new journals are rejected. Reopen from Period Close with a reason and ticket."
          : "Soft close: operating posts are blocked. Controller adjustments require an explicit override."}{" "}
        <Link className="underline" href={`/close?entity=${entityCode}&period=${period}`}>
          Open close workflow
        </Link>
      </p>
    </div>
  );
}
