import { AUDIENCE_BRIEFS } from "./audience-briefs";
import { buildChartSuite, CHART_IDS, CHART_TITLES, type ChartId, type ChartSuite } from "./charts";
import { buildAllNarratives, buildNarrative, type AudienceNarrative } from "./narratives";
import {
  buildPackSlides,
  type PackKpi,
  type PackSlide,
} from "./pack-spine";
import type { AudienceId, PeriodSnapshot } from "./snapshot-types";

export const PACK_IDS = ["monthly_investor", "quarterly_lender", "ic_memo", "management_flash"] as const;
export type PackId = (typeof PACK_IDS)[number];

export type PackMeta = {
  id: PackId;
  title: string;
  audience: AudienceId;
  cadence: "monthly" | "quarterly" | "as_needed" | "flash";
  description: string;
  charts: ChartId[];
};

export const PACK_CATALOG: PackMeta[] = [
  {
    id: "monthly_investor",
    title: "Monthly Investor Pack",
    audience: "lp",
    cadence: "monthly",
    description: AUDIENCE_BRIEFS.lp.dek,
    charts: AUDIENCE_BRIEFS.lp.chartIds,
  },
  {
    id: "quarterly_lender",
    title: "Quarterly Lender Pack",
    audience: "lender",
    cadence: "quarterly",
    description: AUDIENCE_BRIEFS.lender.dek,
    charts: AUDIENCE_BRIEFS.lender.chartIds,
  },
  {
    id: "ic_memo",
    title: "IC Memo Pack",
    audience: "ic",
    cadence: "as_needed",
    description: AUDIENCE_BRIEFS.ic.dek,
    charts: AUDIENCE_BRIEFS.ic.chartIds,
  },
  {
    id: "management_flash",
    title: "Management Flash",
    audience: "mgmt",
    cadence: "flash",
    description: AUDIENCE_BRIEFS.mgmt.dek,
    charts: AUDIENCE_BRIEFS.mgmt.chartIds,
  },
];

export type BuiltPack = {
  meta: PackMeta;
  entityCode: string;
  entityName: string;
  period: string;
  viewLabel: string;
  generatedLabel: string;
  narrative: AudienceNarrative;
  charts: ChartSuite;
  slides: PackSlide[];
  filenameBase: string;
};

export function getPackMeta(id: string): PackMeta | undefined {
  return PACK_CATALOG.find((p) => p.id === id);
}

export function isPackId(value: string): value is PackId {
  return (PACK_IDS as readonly string[]).includes(value);
}

export function buildPack(snap: PeriodSnapshot, packId: PackId): BuiltPack {
  const meta = getPackMeta(packId);
  if (!meta) throw new Error(`Unknown pack ${packId}`);
  const charts = buildChartSuite(snap);
  const narrative = buildNarrative(snap, meta.audience);
  const slides = buildPackSlides({
    snap,
    audience: meta.audience,
    packTitle: meta.title,
    chartIds: meta.charts,
    narrative,
    charts,
  });
  return {
    meta,
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    generatedLabel: `Roche Capital Partners · Portfolio Control · ${meta.title}`,
    narrative,
    charts,
    slides,
    filenameBase: `RCP-${meta.id}-${snap.entityCode}-${snap.period}`,
  };
}

export function buildAllPacks(snap: PeriodSnapshot): BuiltPack[] {
  return PACK_CATALOG.map((meta) => buildPack(snap, meta.id));
}

export { CHART_IDS, CHART_TITLES, buildAllNarratives, buildChartSuite };
