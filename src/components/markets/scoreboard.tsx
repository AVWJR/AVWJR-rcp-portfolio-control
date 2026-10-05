"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScoreboardRow } from "@/lib/markets/read";

type SortKey = "rank" | "name" | "viability" | "band" | "confidence" | "momentum" | "flags";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "rank", label: "Rank", align: "right" },
  { key: "name", label: "Metro", align: "left" },
  { key: "viability", label: "Viability Score", align: "right" },
  { key: "band", label: "Band", align: "left" },
  { key: "confidence", label: "Confidence", align: "right" },
  { key: "momentum", label: "Momentum", align: "left" },
  { key: "flags", label: "Flags", align: "left" },
];

function compare(a: ScoreboardRow, b: ScoreboardRow, key: SortKey): number {
  if (key === "rank") return a.rank - b.rank;
  if (key === "viability" || key === "confidence") return Number(a[key]) - Number(b[key]);
  return a[key].localeCompare(b[key]);
}

export function Scoreboard({ rows, query }: { rows: ScoreboardRow[]; query: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const result = compare(a, b, sortKey);
      return direction === "asc" ? result : -result;
    });
    return copy;
  }, [rows, sortKey, direction]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection(key === "name" || key === "flags" || key === "momentum" || key === "band" ? "asc" : "asc");
  }

  return (
    <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
            {COLUMNS.map((column) => (
              <th key={column.key} className={column.align === "right" ? "px-3 py-2 text-right" : "px-3 py-2 text-left"}>
                <button type="button" className="uppercase tracking-[0.12em]" onClick={() => onSort(column.key)}>
                  {column.label}
                  {sortKey === column.key ? (direction === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.cbsa} className="border-b border-cream-200">
              <td className="tabular px-3 py-2 text-right">{row.rank}</td>
              <td className="px-3 py-2">
                <Link className="font-semibold text-navy-900 underline" href={`/markets/${row.cbsa}${query}`}>
                  {row.name}
                </Link>
                <span className="ml-2 text-xs text-ink-500">{row.cbsa}</span>
              </td>
              <td className="tabular px-3 py-2 text-right">{row.viability}</td>
              <td className="px-3 py-2">{row.band}</td>
              <td className="tabular px-3 py-2 text-right">{row.confidence}</td>
              <td className="px-3 py-2">{row.momentum}</td>
              <td className="px-3 py-2 text-ink-700">{row.flags || "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
