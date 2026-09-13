import { formatUsd } from "@rcp/ledger";
import { formatRatioBps } from "./variance";

export { formatUsd, formatRatioBps };

export function formatUsdOrDash(cents: bigint | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatUsd(cents);
}

export function formatBpsAsPercent(bps: number | null | undefined): string {
  return formatRatioBps(bps ?? null);
}

export function formatBpsAsMultiple(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "—";
  return `${(bps / 10_000).toFixed(2)}x`;
}

export function formatBpsAsYield(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatMonthsCoverage(hundredths: number | null | undefined): string {
  if (hundredths === null || hundredths === undefined) return "—";
  return `${(hundredths / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} mo`;
}

export function centsToUsdNumber(cents: bigint): number {
  return Number(cents) / 100;
}

export function periodLabel(period: string): string {
  const [year, month] = period.split("-");
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const m = Number(month);
  return `${names[m - 1] ?? month} ${year}`;
}

export function passFail(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "not computed";
  return value ? "pass" : "fail";
}
