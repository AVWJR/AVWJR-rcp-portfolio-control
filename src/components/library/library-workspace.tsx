"use client";

import { ArchiveDealButton } from "@/components/deals/archive-deal-button";
import { CriteriaBuilder } from "@/components/library/criteria-builder";
import { columnMeta, defaultColumnLayout, moveColumn, normalizeColumnLayout, type ColumnLayoutItem, type LibraryColumnId } from "@/lib/library/columns";
import { evaluateDeal, passCount, type Criterion, type CriterionField } from "@/lib/library/criteria";
import { libraryCsv } from "@/lib/library/csv";
import { FEE_NEEDED } from "@/lib/library/fees";
import type { LibraryRow } from "@/lib/library/facts";
import { staleFlagLabel } from "@/lib/library/staleness";
import { visibleLibraryRows } from "@/lib/library/view";
import { formatUsd } from "@rcp/ledger";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const LAYOUT_KEY = "rcp.library.columns";

type PickItem = { id: string; kind: string; label: string };
type Preset = { id: string; name: string };

function money(cents: number | null): string {
  if (cents == null) return "—";
  return formatUsd(BigInt(cents));
}

function multiple(bps: number | null): string {
  if (bps == null) return "—";
  return `${(bps / 10_000).toFixed(2)}x`;
}

function percent(bps: number | null): string {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

function displayCell(row: LibraryRow, id: LibraryColumnId): string {
  if (id === "dscr") return multiple(row.dscrBps);
  if (id === "debtYield" || id === "capRate" || id === "ltv" || id === "cashOnCash" || id === "occupancy") {
    const value = id === "debtYield" ? row.debtYieldBps : id === "capRate" ? row.capRateBps : id === "ltv" ? row.ltvBps : id === "cashOnCash" ? row.cashOnCashBps : row.occupancyBps;
    return percent(value);
  }
  if (id === "lpNetIrr" || id === "lpCashYield") return row.feeNeeded ? `Phase 2 · ${FEE_NEEDED}` : "Phase 2";
  if (id === "rcpIrr") return "Phase 2";
  if (id === "pricePerUnit") return money(row.pricePerUnitCents);
  if (id === "metro") return row.metro ?? "—";
  if (id === "units") return row.unitCount == null ? "—" : String(row.unitCount);
  if (id === "equityRequired") return money(row.equityRequiredCents);
  return "—";
}

function readLayout(): ColumnLayoutItem[] {
  if (typeof window === "undefined") return defaultColumnLayout();
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    return normalizeColumnLayout(raw ? (JSON.parse(raw) as { id: string; visible?: boolean }[]) : null);
  } catch {
    return defaultColumnLayout();
  }
}

export function LibraryWorkspace({
  rows,
  presets,
  picks,
  gaBudgetCents,
  period,
}: {
  rows: LibraryRow[];
  presets: Preset[];
  picks: PickItem[];
  gaBudgetCents: number | null;
  period: string;
}) {
  const router = useRouter();
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [layout, setLayout] = useState<ColumnLayoutItem[]>(readLayout);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sort, setSort] = useState<{ id: "name" | LibraryColumnId; dir: "asc" | "desc" }>({ id: "name", dir: "asc" });
  const [message, setMessage] = useState<string | null>(null);
  const [ga, setGa] = useState(gaBudgetCents == null ? "" : (gaBudgetCents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [showTest, setShowTest] = useState(false);

  function persist(next: ColumnLayoutItem[]) {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
  }

  const listed = useMemo(() => visibleLibraryRows(rows, showTest), [rows, showTest]);
  const hiddenTest = rows.filter((row) => row.dealStatus === "TEST").length;

  const choices = useMemo(() => {
    const fromDeals = (field: CriterionField, read: (row: LibraryRow) => string | null) =>
      Array.from(new Set(listed.map(read).filter((value): value is string => Boolean(value))));
    const labels = (kind: string) => picks.filter((item) => item.kind === kind).map((item) => item.label);
    return {
      state: labels("state"),
      metro: Array.from(new Set([...labels("metro"), ...fromDeals("metro", (row) => row.metro)])),
      msa: fromDeals("msa", (row) => row.msa),
      submarket: fromDeals("submarket", (row) => row.submarket),
      city: fromDeals("city", (row) => row.city),
      propertyType: labels("property_type"),
      assetClass: Array.from(new Set(["A", "B", "C", ...fromDeals("assetClass", (row) => row.assetClass)])),
      businessPlan: Array.from(new Set(["Value-add", "Stabilized", "Light rehab", ...fromDeals("businessPlan", (row) => row.businessPlan)])),
      dealStatus: ["Pipeline", "Screened", "Owned", "Archived", "Test"],
    } satisfies Partial<Record<CriterionField, string[]>>;
  }, [picks, listed]);

  const evaluated = useMemo(
    () =>
      listed.map((row) => ({
        row,
        excluded: evaluateDeal(row, criteria),
      })),
    [listed, criteria],
  );
  const counts = passCount(listed, criteria);
  const visible = layout.filter((column) => column.visible);

  const sorted = [...evaluated].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const av = sortValue(a.row, sort.id);
    const bv = sortValue(b.row, sort.id);
    if (av == null && bv == null) return a.row.code.localeCompare(b.row.code);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  async function backfill() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/library/snapshots/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save snapshots.");
      setMessage(`Saved an analysis snapshot for ${json.count} deals. Older snapshots were kept.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save snapshots.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const passing = sorted.filter((item) => item.excluded.length === 0).map((item) => item.row);
    const csv = libraryCsv(passing, layout);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rcp-deal-library-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function savePreset(name: string) {
    const res = await fetch("/api/library/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, criteria }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "Could not save the preset.");
      return;
    }
    setMessage(`Saved preset “${json.name}”.`);
    router.refresh();
  }

  async function deletePreset(id: string) {
    const res = await fetch("/api/library/presets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "Could not delete the preset.");
      return;
    }
    setMessage(`Deleted preset “${json.name}”. Deals were not touched.`);
    router.refresh();
  }

  async function loadPreset(id: string) {
    const res = await fetch("/api/library/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "Could not load the preset.");
      return;
    }
    setCriteria(json.criteria ?? []);
  }

  async function saveGa() {
    setBusy(true);
    try {
      const res = await fetch("/api/library/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gaBudgetUsd: ga }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save G&A.");
      setMessage(ga.trim() ? "OpCo G&A budget saved." : "OpCo G&A budget cleared. It shows fee needed until you type one.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save G&A.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <CriteriaBuilder
        criteria={criteria}
        onChange={setCriteria}
        passCount={counts.pass}
        totalCount={counts.total}
        choices={choices}
        presets={presets}
        onSavePreset={(name) => void savePreset(name)}
        onLoadPreset={(id) => void loadPreset(id)}
        onDeletePreset={(id) => void deletePreset(id)}
      />

      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Fees</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-700">
          AM fee and other LP fees are set on each deal. OpCo G&amp;A is set here. Blank stays blank. The Library says{" "}
          <strong>{FEE_NEEDED}</strong> and does not assume a percent.
        </p>
        <label className="mt-3 block max-w-xs text-sm text-ink-700">
          OpCo G&amp;A budget (USD)
          <input
            value={ga}
            onChange={(event) => setGa(event.target.value)}
            placeholder={FEE_NEEDED}
            className="mt-1 w-full border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-900"
          />
        </label>
        {gaBudgetCents == null ? <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gold-700">{FEE_NEEDED}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveGa()}
          className="mt-3 bg-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-40"
        >
          Save G&amp;A
        </button>
      </section>

      <PickLists picks={picks} onChanged={() => router.refresh()} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void backfill()} disabled={busy} className="bg-gold-500 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950 disabled:opacity-40">
          Backfill analysis snapshots
        </button>
        <button type="button" onClick={exportCsv} className="border border-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900">
          Export CSV
        </button>
        <button type="button" onClick={() => setColumnsOpen((value) => !value)} className="border border-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900" aria-expanded={columnsOpen}>
          Columns
        </button>
        <button type="button" onClick={() => persist(defaultColumnLayout())} className="text-[12px] uppercase tracking-[0.14em] text-navy-800 underline">
          Reset columns
        </button>
        <label className="ml-1 flex items-center gap-2 text-sm text-navy-900">
          <input type="checkbox" checked={showTest} onChange={(event) => setShowTest(event.target.checked)} />
          Show Test deals
        </label>
      </div>
      {!showTest && hiddenTest > 0 ? (
        <p className="text-sm text-ink-700">
          {hiddenTest} Test {hiddenTest === 1 ? "deal is" : "deals are"} hidden. Turn on Show Test deals to include {hiddenTest === 1 ? "it" : "them"} in the table, the pass count, and the CSV.
        </p>
      ) : null}
      {columnsOpen ? (
        <ul className="max-w-md border border-cream-300 bg-white">
          {layout.map((column) => (
            <li key={column.id} className="flex items-center gap-2 border-b border-cream-200 px-3 py-2 text-sm">
              <label className="flex flex-1 items-center gap-2 text-navy-900">
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={() => persist(layout.map((row) => (row.id === column.id ? { ...row, visible: !row.visible } : row)))}
                />
                {columnMeta(column.id).label}
              </label>
              <button type="button" className="px-2 text-navy-800" aria-label={`Move ${columnMeta(column.id).label} up`} onClick={() => persist(moveColumn(layout, column.id, -1))}>
                Up
              </button>
              <button type="button" className="px-2 text-navy-800" aria-label={`Move ${columnMeta(column.id).label} down`} onClick={() => persist(moveColumn(layout, column.id, 1))}>
                Down
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="text-sm text-navy-900">{message}</p> : null}
      <p className="text-xs text-ink-600">
        A snapshot turns amber at 90 days and red at 180. That is a reminder only. Age never deletes a deal, a file, or a snapshot.
      </p>

      <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
              <SortHeader label="Deal" active={sort.id === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Analysis</th>
              {visible.map((column) => (
                <SortHeader
                  key={column.id}
                  label={columnMeta(column.id).label}
                  active={sort.id === column.id}
                  dir={sort.dir}
                  onClick={() => toggleSort(column.id)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ row, excluded }) => (
              <tr key={row.code} className="border-b border-cream-200 align-top">
                <td className="px-3 py-2">
                  <Link className="font-semibold text-navy-900 underline" href={`/deals/${row.code}?period=${period}`}>
                    {row.name}
                  </Link>
                  <p className="text-xs text-ink-500">{row.code}</p>
                  {row.dealStatus !== "OWNED" && row.dealStatus !== "ARCHIVED" ? (
                    <div className="mt-2">
                      <ArchiveDealButton code={row.code} name={row.name} afterHref="/library" />
                    </div>
                  ) : null}
                  {excluded.length ? (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {excluded.map((item) => (
                        <span key={item.field} className="bg-gold-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-navy-900">
                          {item.reason}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={row.dealStatus} label={row.statusLabel} />
                </td>
                <td className="px-3 py-2">
                  <StaleChip level={row.stale} />
                  {row.basisLabel ? <p className="mt-1 text-[10px] text-ink-500">{row.basisLabel}</p> : null}
                </td>
                {visible.map((column) => (
                  <td key={column.id} className="tabular px-3 py-2 text-right text-navy-900">
                    {displayCell(row, column.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  function toggleSort(id: "name" | LibraryColumnId) {
    setSort((current) => (current.id === id ? { id, dir: current.dir === "asc" ? "desc" : "asc" } : { id, dir: "desc" }));
  }
}

function sortValue(row: LibraryRow, id: "name" | LibraryColumnId): string | number | null {
  if (id === "name") return row.name;
  if (id === "dscr") return row.dscrBps;
  if (id === "debtYield") return row.debtYieldBps;
  if (id === "capRate") return row.capRateBps;
  if (id === "ltv") return row.ltvBps;
  if (id === "cashOnCash") return row.cashOnCashBps;
  if (id === "occupancy") return row.occupancyBps;
  if (id === "pricePerUnit") return row.pricePerUnitCents;
  if (id === "metro") return row.metro;
  if (id === "units") return row.unitCount;
  if (id === "equityRequired") return row.equityRequiredCents;
  return null;
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th className="px-3 py-2 text-left" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="uppercase tracking-[0.12em] text-ink-500" onClick={onClick}>
        {label}
        {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function StatusChip({ status, label }: { status: string; label: string }) {
  const tone =
    status === "OWNED"
      ? "bg-navy-900 text-cream-50"
      : status === "PIPELINE"
        ? "bg-gold-500 text-navy-950"
        : status === "SCREENED"
          ? "border border-navy-900 text-navy-900"
          : status === "TEST"
            ? "border border-dashed border-navy-700 text-navy-800"
            : "bg-cream-300 text-ink-700";
  return <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${tone}`}>{label}</span>;
}

function StaleChip({ level }: { level: LibraryRow["stale"] }) {
  const label = staleFlagLabel(level);
  if (!label) return <span className="text-xs text-ink-500">Current</span>;
  const tone = level === "amber" ? "border border-gold-500 bg-gold-100 text-navy-900" : "border border-red-300 bg-red-50 text-red-800";
  return <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${tone}`}>{label}</span>;
}

function PickLists({ picks, onChanged }: { picks: PickItem[]; onChanged: () => void }) {
  const [kind, setKind] = useState("state");
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState<PickItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    const res = await fetch("/api/library/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, label }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not add that.");
      return;
    }
    setLabel("");
    onChanged();
  }

  async function remove() {
    if (!pending) return;
    setError(null);
    const res = await fetch("/api/library/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pending.id, confirmLabel: confirm }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not remove that.");
      return;
    }
    setPending(null);
    setConfirm("");
    onChanged();
  }

  const groups = [
    { kind: "state", title: "States" },
    { kind: "metro", title: "Metros" },
    { kind: "property_type", title: "Property types" },
  ];

  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">Lists</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-700">
        States start as GA, FL, NC, SC, TN, TX, and AL. Property types start as Garden, Mid-rise, and Build-to-rent/Townhome.
        Metros are added when you save one on a deal. Removing a label does not delete a deal or a document, and nothing is removed because of age.
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.kind}>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">{group.title}</p>
            <ul className="mt-2 space-y-1">
              {picks.filter((item) => item.kind === group.kind).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm text-navy-900">
                  <span>{item.label}</span>
                  <button type="button" className="text-[11px] uppercase tracking-[0.1em] text-navy-800 underline" onClick={() => { setPending(item); setConfirm(""); }}>
                    Remove
                  </button>
                </li>
              ))}
              {group.kind === "metro" && picks.every((item) => item.kind !== "metro") ? (
                <li className="text-sm text-ink-600">None yet. They show up as deals are saved.</li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm text-ink-700">
          List
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 block border border-cream-300 bg-cream-50 px-3 py-2 text-sm">
            <option value="state">State</option>
            <option value="metro">Metro</option>
            <option value="property_type">Property type</option>
          </select>
        </label>
        <label className="text-sm text-ink-700">
          Add
          <input value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1 block border border-cream-300 bg-cream-50 px-3 py-2 text-sm" />
        </label>
        <button type="button" onClick={() => void add()} className="bg-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50">
          Add to list
        </button>
      </div>
      {pending ? (
        <div className="mt-3 border border-gold-500 bg-gold-100 px-3 py-3 text-sm text-navy-900">
          <p>
            Type <strong>{pending.label}</strong> to remove it from the list. Deals that already use it keep the value.
          </p>
          <input value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-2 border border-cream-300 bg-white px-3 py-2 text-sm" aria-label="Confirm list label" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void remove()} className="bg-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50">
              Remove this label
            </button>
            <button type="button" onClick={() => setPending(null)} className="border border-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
    </section>
  );
}
