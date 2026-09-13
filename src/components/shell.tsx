import { RCP_CONFIDENTIAL, RCP_NAME, RCP_PRODUCT, RCP_PRODUCT_LINE } from "@rcp/rcp-brand";
import Link from "next/link";
import type { ReactNode } from "react";
import { EntitySwitcher } from "./entity-switcher";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/ratios", label: "Ratios" },
  { href: "/narratives", label: "Narratives" },
  { href: "/", label: "Overview" },
  { href: "/reports/operating-statement", label: "Operating Statement" },
  { href: "/deals", label: "Deals" },
  { href: "/properties", label: "Properties" },
  { href: "/debt", label: "Debt" },
  { href: "/capex", label: "CapEx" },
  { href: "/close", label: "Close" },
  { href: "/tax", label: "Tax" },
  { href: "/vault", label: "Vault" },
  { href: "/archive", label: "Archive" },
  { href: "/scheduler", label: "Scheduler" },
  { href: "/vendors", label: "1099" },
  { href: "/reports/trial-balance", label: "Trial Balance" },
  { href: "/reports/income-statement", label: "Income Statement" },
  { href: "/reports/balance-sheet", label: "Balance Sheet" },
  { href: "/reports/cash-flow", label: "Cash Flow" },
];

export function Shell({
  children,
  entities,
  activeEntity,
  year,
  month,
  consolidated,
  pathname,
  periodLabels,
}: {
  children: ReactNode;
  entities: {
    code: string;
    name: string;
    type: string;
    unitCount: number | null;
    strategy: string | null;
  }[];
  activeEntity: string;
  year: number;
  month: number;
  consolidated: boolean;
  pathname: string;
  periodLabels?: string[];
}) {
  const qs = (path: string) => {
    const params = new URLSearchParams({
      entity: activeEntity,
      period: `${year}-${String(month).padStart(2, "0")}`,
    });
    if (consolidated) params.set("view", "combined");
    return `${path}?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-cream-100 text-ink-900">
      <header className="bg-navy-900 text-cream-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center border border-gold-500 text-sm font-semibold tracking-[0.18em] text-gold-400">
              RCP
            </div>
            <div>
              <p className="font-display text-xl tracking-wide text-cream-50">{RCP_NAME}</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold-400">
                {RCP_PRODUCT} · {RCP_PRODUCT_LINE}
              </p>
            </div>
          </div>
          <div className="hidden text-right text-[11px] uppercase tracking-[0.16em] text-gold-400/90 sm:block">
            <p>USD · en-US</p>
            <p>America/New_York</p>
          </div>
        </div>
        <div className="rcp-hairline" />
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap gap-1 text-[12px] uppercase tracking-[0.14em]">
            {NAV.map((item) => {
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard" || /^\/dashboard\/SPE-/.test(pathname) || pathname === "/dashboard/RCP-OPCO"
                  : item.href === "/dashboard/ratios"
                    ? pathname.startsWith("/dashboard/ratios")
                    : item.href === "/narratives"
                      ? pathname.startsWith("/narratives")
                    : item.href === "/tax"
                      ? pathname.startsWith("/tax")
                    : item.href === "/deals"
                      ? pathname.startsWith("/deals")
                    : item.href === "/archive"
                      ? pathname.startsWith("/archive")
                    : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={qs(item.href)}
                  className={`px-3 py-1.5 ${
                    active
                      ? "bg-gold-500 text-navy-950"
                      : "text-cream-200 hover:bg-navy-800 hover:text-gold-400"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <EntitySwitcher
            entities={entities}
            activeEntity={activeEntity}
            year={year}
            month={month}
            consolidated={consolidated}
            pathname={pathname}
            periodLabels={periodLabels}
          />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <footer className="border-t border-cream-300 bg-cream-200">
        <div className="mx-auto flex max-w-7xl justify-between px-6 py-4 text-[11px] uppercase tracking-[0.14em] text-ink-500">
          <span>{RCP_CONFIDENTIAL}</span>
          <span>Phase F tax / vault / scheduler · Does not file</span>
        </div>
      </footer>
    </div>
  );
}
