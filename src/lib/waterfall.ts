import {
  applyWaterfallTemplate,
  defaultWaterfallConfig,
  hasCoGp,
  isLookThroughTemplate,
  isWaterfallTemplateId,
  lookThroughConfig,
  prefAccrualCents,
  resolveUnpaidPrefCents,
  resolveUnreturnedCapitalCents,
  runWaterfall,
  scaleByShare,
  summarizeWaterfall,
  WATERFALL_COMPOUNDING,
  PROMOTE_BASES,
  type PromoteBase,
  type WaterfallCompounding,
  type WaterfallConfig,
  type WaterfallRunResult,
  type WaterfallTemplateId,
  type WaterfallTier,
} from "@rcp/ledger";
import { ownedSpeWhere } from "./deal-status";
import { prisma } from "./prisma";
import { DealValidationError } from "./deals/create-spe";
import { ledgerCapitalByEntity, type LedgerCapitalRow } from "./distribution-read";

export type SpeWaterfallRecord = {
  entityId: string;
  entityCode: string;
  entityName: string;
  config: WaterfallConfig;
  lpContributedCents: bigint;
  /** null = blank = use LP contributed at run time. 0 = nothing left unreturned. */
  unreturnedCapitalCents: bigint | null;
  /** null = blank = no pref carried in. 0 = zero unpaid pref. */
  unpaidPrefCents: bigint | null;
  prefPaidToDateCents: bigint;
  persisted: boolean;
  /** Ledger owns unreturned capital and unpaid pref once a distribution is posted. */
  capitalSource?: "ledger" | "waterfall";
};

export type WaterfallSaveInput = {
  templateId: string;
  prefRateBps: number;
  compounding: string;
  catchUpEnabled: boolean;
  catchUpBps: number;
  gpCoInvestBps: number;
  coGpName?: string;
  coGpOfPromoteBps?: number;
  coGpCoInvestShareBps?: number;
  promoteBase: string;
  lookbackClawback: boolean;
  lpContributedCents: bigint | string | number;
  unreturnedCapitalCents: bigint | string | number | null;
  unpaidPrefCents: bigint | string | number | null;
  prefPaidToDateCents: bigint | string | number;
  notes: string;
  tiers: WaterfallTier[];
};

function asOptionalCents(value: bigint | string | number | null | undefined): bigint | null {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return asCents(value);
}

function asCents(value: bigint | string | number | undefined, fallback = 0n): bigint {
  if (typeof value === "bigint") return value < 0n ? 0n : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = BigInt(Math.max(0, Math.round(value)));
    return n;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const n = BigInt(value.trim());
      return n < 0n ? 0n : n;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function clampBps(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10_000, Math.max(0, Math.round(n)));
}

function sanitizeCoGpName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}

type CapitalBlock = {
  unreturnedCapitalCents: string | null;
  unpaidPrefCents: string | null;
};

function unwrapTiersDocument(raw: unknown): { rows: unknown; capital: CapitalBlock | null } {
  if (Array.isArray(raw)) return { rows: raw, capital: null };
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.tiers)) {
      return { rows: rec.tiers, capital: capitalBlock(rec.capital) };
    }
  }
  return { rows: [], capital: null };
}

function capitalBlock(value: unknown): CapitalBlock | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (!("unreturnedCapitalCents" in rec) || !("unpaidPrefCents" in rec)) return null;
  if (rec.unreturnedCapitalCents != null && typeof rec.unreturnedCapitalCents !== "string") return null;
  if (rec.unpaidPrefCents != null && typeof rec.unpaidPrefCents !== "string") return null;
  return {
    unreturnedCapitalCents: (rec.unreturnedCapitalCents as string | null) ?? null,
    unpaidPrefCents: (rec.unpaidPrefCents as string | null) ?? null,
  };
}

function parseStoredOptionalCents(value: string | null): bigint | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const n = BigInt(trimmed);
    return n < 0n ? 0n : n;
  } catch {
    return null;
  }
}

/**
 * Blank vs zero cannot live in the required `unreturnedCapitalCents` / `unpaidPrefCents`
 * columns (preview builds must not `db push` the shared database). A save writes the
 * choice into `tiersJson.capital`: null is blank, "0" is zero. Rows saved before that
 * block existed stored both as 0, and 0 meant "use the default".
 */
export function waterfallAmountsFromStored(row: {
  tiersJson: string;
  unreturnedCapitalCents: bigint;
  unpaidPrefCents: bigint;
}): { unreturnedCapitalCents: bigint | null; unpaidPrefCents: bigint | null } {
  let capital: CapitalBlock | null = null;
  try {
    capital = unwrapTiersDocument(JSON.parse(row.tiersJson || "[]") as unknown).capital;
  } catch {
    capital = null;
  }
  if (capital) {
    return {
      unreturnedCapitalCents: parseStoredOptionalCents(capital.unreturnedCapitalCents),
      unpaidPrefCents: parseStoredOptionalCents(capital.unpaidPrefCents),
    };
  }
  return {
    unreturnedCapitalCents: row.unreturnedCapitalCents === 0n ? null : row.unreturnedCapitalCents,
    unpaidPrefCents: row.unpaidPrefCents === 0n ? null : row.unpaidPrefCents,
  };
}

function encodeTiersJson(
  tiers: WaterfallTier[],
  capital: { unreturnedCapitalCents: bigint | null; unpaidPrefCents: bigint | null },
): string {
  return JSON.stringify({
    tiers,
    capital: {
      unreturnedCapitalCents: capital.unreturnedCapitalCents == null ? null : capital.unreturnedCapitalCents.toString(),
      unpaidPrefCents: capital.unpaidPrefCents == null ? null : capital.unpaidPrefCents.toString(),
    },
  });
}

function parseTiers(raw: string | WaterfallTier[] | undefined, fallback: WaterfallTier[]): WaterfallTier[] {
  const parsed = typeof raw === "string" ? (JSON.parse(raw || "[]") as unknown) : raw;
  const rows = unwrapTiersDocument(parsed).rows;
  if (!Array.isArray(rows) || rows.length === 0) return fallback;
  const out: WaterfallTier[] = [];
  for (const [i, row] of rows.entries()) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const kind = rec.kind === "ROC" || rec.kind === "PREF" || rec.kind === "CATCH_UP" || rec.kind === "PROMOTE" ? rec.kind : null;
    if (!kind) continue;
    out.push({
      id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : `tier_${i}`,
      kind,
      label: typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : kind,
      hurdleIrrBps: rec.hurdleIrrBps == null ? null : clampBps(rec.hurdleIrrBps, 0),
      lpSplitBps: clampBps(rec.lpSplitBps, 8_000),
      gpSplitBps: clampBps(rec.gpSplitBps, 2_000),
    });
  }
  return out.length ? out : fallback;
}

export function configFromRow(row: {
  templateId: string;
  prefRateBps: number;
  compounding: string;
  catchUpEnabled: boolean;
  catchUpBps: number;
  gpCoInvestBps: number;
  coGpName?: string | null;
  coGpOfPromoteBps?: number | null;
  coGpCoInvestShareBps?: number | null;
  promoteBase: string;
  lookbackClawback: boolean;
  notes: string | null;
  tiersJson: string;
}): WaterfallConfig {
  const templateId = isWaterfallTemplateId(row.templateId) ? row.templateId : "look_through_100";
  const fallback = applyWaterfallTemplate(templateId);
  const compounding = (WATERFALL_COMPOUNDING as readonly string[]).includes(row.compounding)
    ? (row.compounding as WaterfallCompounding)
    : fallback.compounding;
  const promoteBase = (PROMOTE_BASES as readonly string[]).includes(row.promoteBase)
    ? (row.promoteBase as PromoteBase)
    : fallback.promoteBase;
  return {
    templateId,
    prefRateBps: clampBps(row.prefRateBps, fallback.prefRateBps),
    compounding,
    catchUpEnabled: row.catchUpEnabled,
    catchUpBps: clampBps(row.catchUpBps, fallback.catchUpBps),
    gpCoInvestBps: clampBps(row.gpCoInvestBps, fallback.gpCoInvestBps),
    coGpName: sanitizeCoGpName(row.coGpName) || fallback.coGpName,
    coGpOfPromoteBps: clampBps(row.coGpOfPromoteBps ?? 0, fallback.coGpOfPromoteBps),
    coGpCoInvestShareBps: clampBps(row.coGpCoInvestShareBps ?? 0, fallback.coGpCoInvestShareBps),
    promoteBase,
    lookbackClawback: row.lookbackClawback,
    notes: row.notes ?? fallback.notes,
    tiers: parseTiers(row.tiersJson, fallback.tiers),
  };
}

export function effectiveCapital(record: SpeWaterfallRecord): {
  lpContributedCents: bigint;
  unreturnedCapitalCents: bigint;
  unpaidPrefCents: bigint;
  prefPaidToDateCents: bigint;
} {
  const lp = record.lpContributedCents > 0n ? record.lpContributedCents : 0n;
  return {
    lpContributedCents: lp,
    unreturnedCapitalCents: resolveUnreturnedCapitalCents(record.unreturnedCapitalCents, lp),
    unpaidPrefCents: resolveUnpaidPrefCents(record.unpaidPrefCents),
    prefPaidToDateCents: record.prefPaidToDateCents > 0n ? record.prefPaidToDateCents : 0n,
  };
}

function overlayRecord(record: SpeWaterfallRecord, row: LedgerCapitalRow | undefined): SpeWaterfallRecord {
  if (!row?.hasEvents) return { ...record, capitalSource: "waterfall" };
  return {
    ...record,
    unreturnedCapitalCents: row.unreturnedCapitalCents,
    unpaidPrefCents: row.unpaidPrefCents,
    prefPaidToDateCents: row.prefPaidCents,
    capitalSource: "ledger",
  };
}

async function overlayRecords(records: SpeWaterfallRecord[]): Promise<SpeWaterfallRecord[]> {
  const map = await ledgerCapitalByEntity(records.map((record) => record.entityId));
  return records.map((record) => overlayRecord(record, map.get(record.entityId)));
}

export async function loadSpeWaterfall(entityId: string): Promise<SpeWaterfallRecord | null> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    include: { waterfall: true },
  });
  if (!entity || entity.type !== "SPE") return null;
  if (!entity.waterfall) {
    return overlayRecord(
      {
        entityId: entity.id,
        entityCode: entity.code,
        entityName: entity.name,
        config: lookThroughConfig(),
        lpContributedCents: 0n,
        unreturnedCapitalCents: null,
        unpaidPrefCents: null,
        prefPaidToDateCents: 0n,
        persisted: false,
      },
      (await ledgerCapitalByEntity([entity.id])).get(entity.id),
    );
  }
  const amounts = waterfallAmountsFromStored(entity.waterfall);
  return overlayRecord(
    {
      entityId: entity.id,
      entityCode: entity.code,
      entityName: entity.name,
      config: configFromRow(entity.waterfall),
      lpContributedCents: entity.waterfall.lpContributedCents,
      unreturnedCapitalCents: amounts.unreturnedCapitalCents,
      unpaidPrefCents: amounts.unpaidPrefCents,
      prefPaidToDateCents: entity.waterfall.prefPaidToDateCents,
      persisted: true,
    },
    (await ledgerCapitalByEntity([entity.id])).get(entity.id),
  );
}

export async function loadSpeWaterfallByCode(code: string): Promise<SpeWaterfallRecord | null> {
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return null;
  return loadSpeWaterfall(entity.id);
}

export async function loadLiveSpeWaterfalls(parentOpCoId: string): Promise<SpeWaterfallRecord[]> {
  const spes = await prisma.entity.findMany({
    where: { parentId: parentOpCoId, ...ownedSpeWhere() },
    include: { waterfall: true },
    orderBy: { code: "asc" },
  });
  return overlayRecords(
    spes.map((entity) => {
      if (!entity.waterfall) {
        return {
          entityId: entity.id,
          entityCode: entity.code,
          entityName: entity.name,
          config: lookThroughConfig(),
          lpContributedCents: 0n,
          unreturnedCapitalCents: null,
          unpaidPrefCents: null,
          prefPaidToDateCents: 0n,
          persisted: false,
        };
      }
      const amounts = waterfallAmountsFromStored(entity.waterfall);
      return {
        entityId: entity.id,
        entityCode: entity.code,
        entityName: entity.name,
        config: configFromRow(entity.waterfall),
        lpContributedCents: entity.waterfall.lpContributedCents,
        unreturnedCapitalCents: amounts.unreturnedCapitalCents,
        unpaidPrefCents: amounts.unpaidPrefCents,
        prefPaidToDateCents: entity.waterfall.prefPaidToDateCents,
        persisted: true,
      };
    }),
  );
}

/** Portfolio capital+pref still unpaid on live SPEs that have a real LP waterfall and capital entered. */
export function europeanPromoteOpen(records: SpeWaterfallRecord[], periodMonths = 1): boolean {
  let unpaid = 0n;
  for (const row of records) {
    if (isLookThroughTemplate(row.config.templateId)) continue;
    const cap = effectiveCapital(row);
    if (cap.lpContributedCents <= 0n) continue;
    const pref = prefAccrualCents({
      capitalCents: cap.lpContributedCents,
      prefRateBps: row.config.prefRateBps,
      compounding: row.config.compounding,
      periodMonths,
      prefPaidToDateCents: cap.prefPaidToDateCents,
    });
    unpaid += cap.unreturnedCapitalCents + cap.unpaidPrefCents + pref;
  }
  return unpaid <= 0n;
}

export function runRecordWaterfall(
  record: SpeWaterfallRecord,
  distributableCents: bigint,
  opts: { periodMonths?: number; europeanPromoteOpen?: boolean } = {},
): WaterfallRunResult {
  const cap = effectiveCapital(record);
  return runWaterfall({
    config: record.config,
    distributableCents,
    ...cap,
    periodMonths: opts.periodMonths ?? 1,
    europeanPromoteOpen: opts.europeanPromoteOpen,
  });
}

export type SpeWaterfallPools = {
  entityCode: string;
  entityName: string;
  templateId: WaterfallTemplateId;
  lookThrough: boolean;
  hasCoGp: boolean;
  coGpName: string;
  cashGrossCents: bigint;
  cfadsGrossCents: bigint;
  cashGpCents: bigint;
  cashLpCents: bigint;
  cashRcpCents: bigint;
  cashCoGpCents: bigint;
  cfadsGpCents: bigint;
  cfadsLpCents: bigint;
  cfadsRcpCents: bigint;
  cfadsCoGpCents: bigint;
  unpaidPrefAfterCents: bigint;
  prefAccruedThisRunCents: bigint;
  rocLpCents: bigint;
  prefLpCents: bigint;
  catchUpGpCents: bigint;
  promoteGpCents: bigint;
  residualLpCents: bigint;
  waterfallNote: string;
};

export function applyWaterfallToPools(
  record: SpeWaterfallRecord,
  pools: { cashCents: bigint; cfadsCents: bigint },
  europeanOpen: boolean,
  periodMonths = 1,
): SpeWaterfallPools {
  const cashRun = runRecordWaterfall(record, pools.cashCents, { periodMonths, europeanPromoteOpen: europeanOpen });
  const cfadsRun = runRecordWaterfall(record, pools.cfadsCents, { periodMonths, europeanPromoteOpen: europeanOpen });
  const tiers = summarizeWaterfall(cfadsRun);
  return {
    entityCode: record.entityCode,
    entityName: record.entityName,
    templateId: record.config.templateId,
    lookThrough: cashRun.lookThrough && cfadsRun.lookThrough,
    hasCoGp: hasCoGp(record.config),
    coGpName: record.config.coGpName.trim(),
    cashGrossCents: pools.cashCents > 0n ? pools.cashCents : 0n,
    cfadsGrossCents: pools.cfadsCents,
    cashGpCents: cashRun.gpCents,
    cashLpCents: cashRun.lpCents,
    cashRcpCents: cashRun.rcpCents,
    cashCoGpCents: cashRun.coGpCents,
    cfadsGpCents: cfadsRun.gpCents,
    cfadsLpCents: cfadsRun.lpCents,
    cfadsRcpCents: cfadsRun.rcpCents,
    cfadsCoGpCents: cfadsRun.coGpCents,
    unpaidPrefAfterCents: cfadsRun.unpaidPrefAfterCents,
    prefAccruedThisRunCents: cfadsRun.prefAccruedThisRunCents,
    rocLpCents: tiers.rocLpCents,
    prefLpCents: tiers.prefLpCents,
    catchUpGpCents: tiers.catchUpGpCents,
    promoteGpCents: tiers.promoteGpCents,
    residualLpCents: tiers.residualLpCents,
    waterfallNote: [...cfadsRun.notes, ...cfadsRun.steps.slice(0, 1).map((s) => s.label)].join(" "),
  };
}

export type OpCoWaterfallRollup = {
  applied: boolean;
  speCount: number;
  templatedCount: number;
  hasCoGp: boolean;
  cashGrossCents: bigint;
  cashGpCents: bigint;
  cashLpCents: bigint;
  cashRcpCents: bigint;
  cashCoGpCents: bigint;
  cfadsGrossCents: bigint;
  cfadsGpCents: bigint;
  cfadsLpCents: bigint;
  cfadsRcpCents: bigint;
  cfadsCoGpCents: bigint;
  unpaidPrefCents: bigint;
  rocLpCents: bigint;
  prefLpCents: bigint;
  catchUpGpCents: bigint;
  promoteGpCents: bigint;
  residualLpCents: bigint;
  europeanPromoteOpen: boolean;
  note: string;
  spes: SpeWaterfallPools[];
};

export function rollupWaterfallPools(
  records: SpeWaterfallRecord[],
  spePools: { entityCode: string; cashCents: bigint; cfadsCents: bigint }[],
  opcoCashCents: bigint,
  periodMonths = 1,
): OpCoWaterfallRollup {
  const gate = europeanPromoteOpen(records, periodMonths);
  const byCode = new Map(records.map((r) => [r.entityCode, r]));
  const spes: SpeWaterfallPools[] = [];
  for (const pool of spePools) {
    const record = byCode.get(pool.entityCode);
    if (!record) continue;
    spes.push(applyWaterfallToPools(record, pool, gate, periodMonths));
  }
  const templatedCount = spes.filter((s) => !s.lookThrough).length;
  const coGpCount = spes.filter((s) => s.hasCoGp && s.cashCoGpCents + s.cfadsCoGpCents > 0n).length;
  const opcoOwn = opcoCashCents > 0n ? opcoCashCents : 0n;
  const cashGross = spes.reduce((acc, s) => acc + s.cashGrossCents, 0n) + opcoOwn;
  const cashGp = spes.reduce((acc, s) => acc + s.cashGpCents, 0n) + opcoOwn;
  const cashLp = spes.reduce((acc, s) => acc + s.cashLpCents, 0n);
  const cashRcp = spes.reduce((acc, s) => acc + s.cashRcpCents, 0n) + opcoOwn;
  const cashCoGp = spes.reduce((acc, s) => acc + s.cashCoGpCents, 0n);
  const cfadsGross = spes.reduce((acc, s) => acc + (s.cfadsGrossCents > 0n ? s.cfadsGrossCents : 0n), 0n);
  const cfadsGp = spes.reduce((acc, s) => acc + s.cfadsGpCents, 0n);
  const cfadsLp = spes.reduce((acc, s) => acc + s.cfadsLpCents, 0n);
  const cfadsRcp = spes.reduce((acc, s) => acc + s.cfadsRcpCents, 0n);
  const cfadsCoGp = spes.reduce((acc, s) => acc + s.cfadsCoGpCents, 0n);
  const unpaidPref = spes.reduce((acc, s) => acc + s.unpaidPrefAfterCents, 0n);
  const rocLpCents = spes.reduce((acc, s) => acc + s.rocLpCents, 0n);
  const prefLpCents = spes.reduce((acc, s) => acc + s.prefLpCents, 0n);
  const catchUpGpCents = spes.reduce((acc, s) => acc + s.catchUpGpCents, 0n);
  const promoteGpCents = spes.reduce((acc, s) => acc + s.promoteGpCents, 0n);
  const residualLpCents = spes.reduce((acc, s) => acc + s.residualLpCents, 0n);
  const applied = templatedCount > 0;
  const hasCoGpApplied = coGpCount > 0;
  const note = applied
    ? `OpCo cash and CFADS are RCP after waterfall (${templatedCount} SPE template(s)${hasCoGpApplied ? `; Co-GP stays at the deal` : ""}). LP share is not look-through. Property NOI stays look-through. Soft-archived SPEs stay out.`
    : "No deal waterfall selected — OpCo still 100% look-through of live SPE cash/CFADS (demo default).";
  return {
    applied,
    speCount: spes.length,
    templatedCount,
    hasCoGp: hasCoGpApplied,
    cashGrossCents: cashGross,
    cashGpCents: cashGp,
    cashLpCents: cashLp,
    cashRcpCents: cashRcp,
    cashCoGpCents: cashCoGp,
    cfadsGrossCents: cfadsGross,
    cfadsGpCents: cfadsGp,
    cfadsLpCents: cfadsLp,
    cfadsRcpCents: cfadsRcp,
    cfadsCoGpCents: cfadsCoGp,
    unpaidPrefCents: unpaidPref,
    rocLpCents,
    prefLpCents,
    catchUpGpCents,
    promoteGpCents,
    residualLpCents,
    europeanPromoteOpen: gate,
    note,
    spes,
  };
}

export function scaleCashBreakdown(
  parts: { operating: bigint; reserve: bigint; escrow: bigint; deposits: bigint; total: bigint },
  gpCents: bigint,
): { operating: bigint; reserve: bigint; escrow: bigint; deposits: bigint; total: bigint } {
  const gross = parts.total;
  if (gross <= 0n) {
    return { operating: 0n, reserve: 0n, escrow: 0n, deposits: 0n, total: gpCents > 0n ? gpCents : 0n };
  }
  const operating = scaleByShare(parts.operating, gpCents, gross);
  const reserve = scaleByShare(parts.reserve, gpCents, gross);
  const escrow = scaleByShare(parts.escrow, gpCents, gross);
  const deposits = gpCents - operating - reserve - escrow;
  return { operating, reserve, escrow, deposits: deposits < 0n ? 0n : deposits, total: gpCents };
}

export function parseWaterfallSave(body: Partial<WaterfallSaveInput>): {
  config: WaterfallConfig;
  lpContributedCents: bigint;
  unreturnedCapitalCents: bigint | null;
  unpaidPrefCents: bigint | null;
  prefPaidToDateCents: bigint;
} {
  if (!body.templateId || !isWaterfallTemplateId(body.templateId)) {
    throw new DealValidationError("Pick a waterfall template (including 100% look-through).", "templateId");
  }
  const base = applyWaterfallTemplate(body.templateId);
  const compounding = (WATERFALL_COMPOUNDING as readonly string[]).includes(String(body.compounding))
    ? (body.compounding as WaterfallCompounding)
    : base.compounding;
  const promoteBase = (PROMOTE_BASES as readonly string[]).includes(String(body.promoteBase))
    ? (body.promoteBase as PromoteBase)
    : base.promoteBase;
  const config: WaterfallConfig = {
    templateId: body.templateId,
    prefRateBps: clampBps(body.prefRateBps, base.prefRateBps),
    compounding,
    catchUpEnabled: Boolean(body.catchUpEnabled),
    catchUpBps: clampBps(body.catchUpBps, base.catchUpBps),
    gpCoInvestBps: clampBps(body.gpCoInvestBps, base.gpCoInvestBps),
    coGpName: sanitizeCoGpName(body.coGpName) || base.coGpName,
    coGpOfPromoteBps: clampBps(body.coGpOfPromoteBps, base.coGpOfPromoteBps),
    coGpCoInvestShareBps: clampBps(body.coGpCoInvestShareBps, base.coGpCoInvestShareBps),
    promoteBase,
    lookbackClawback: Boolean(body.lookbackClawback),
    notes: typeof body.notes === "string" ? body.notes.slice(0, 4_000) : base.notes,
    tiers: parseTiers(body.tiers, base.tiers),
  };
  const lpContributedCents = asCents(body.lpContributedCents);
  const unreturnedCapitalCents = asOptionalCents(body.unreturnedCapitalCents);
  return {
    config,
    lpContributedCents,
    unreturnedCapitalCents,
    unpaidPrefCents: asOptionalCents(body.unpaidPrefCents),
    prefPaidToDateCents: asCents(body.prefPaidToDateCents),
  };
}

export async function saveSpeWaterfall(entityId: string, body: Partial<WaterfallSaveInput>): Promise<SpeWaterfallRecord> {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity || entity.type !== "SPE") {
    throw new DealValidationError("Waterfall is per property SPE, not HoldCo or OpCo.", "code");
  }
  const parsed = parseWaterfallSave(body);
  const ledger = (await ledgerCapitalByEntity([entityId])).get(entityId);
  const existing = await prisma.speWaterfall.findUnique({ where: { entityId } });
  const keepOpening = Boolean(ledger?.hasEvents && existing);
  const storedOpening = existing ? waterfallAmountsFromStored(existing) : null;
  const unreturnedCapitalCents = keepOpening ? storedOpening!.unreturnedCapitalCents : parsed.unreturnedCapitalCents;
  const unpaidPrefCents = keepOpening ? storedOpening!.unpaidPrefCents : parsed.unpaidPrefCents;
  const prefPaidToDateCents = keepOpening ? existing!.prefPaidToDateCents : parsed.prefPaidToDateCents;
  const tiersJson = encodeTiersJson(parsed.config.tiers, {
    unreturnedCapitalCents,
    unpaidPrefCents,
  });
  const storedUnreturned = unreturnedCapitalCents ?? 0n;
  const storedUnpaid = unpaidPrefCents ?? 0n;
  const row = await prisma.speWaterfall.upsert({
    where: { entityId },
    create: {
      entityId,
      templateId: parsed.config.templateId,
      prefRateBps: parsed.config.prefRateBps,
      compounding: parsed.config.compounding,
      catchUpEnabled: parsed.config.catchUpEnabled,
      catchUpBps: parsed.config.catchUpBps,
      gpCoInvestBps: parsed.config.gpCoInvestBps,
      coGpName: parsed.config.coGpName || null,
      coGpOfPromoteBps: parsed.config.coGpOfPromoteBps,
      coGpCoInvestShareBps: parsed.config.coGpCoInvestShareBps,
      promoteBase: parsed.config.promoteBase,
      lookbackClawback: parsed.config.lookbackClawback,
      lpContributedCents: parsed.lpContributedCents,
      unreturnedCapitalCents: storedUnreturned,
      unpaidPrefCents: storedUnpaid,
      prefPaidToDateCents,
      notes: parsed.config.notes,
      tiersJson,
    },
    update: {
      templateId: parsed.config.templateId,
      prefRateBps: parsed.config.prefRateBps,
      compounding: parsed.config.compounding,
      catchUpEnabled: parsed.config.catchUpEnabled,
      catchUpBps: parsed.config.catchUpBps,
      gpCoInvestBps: parsed.config.gpCoInvestBps,
      coGpName: parsed.config.coGpName || null,
      coGpOfPromoteBps: parsed.config.coGpOfPromoteBps,
      coGpCoInvestShareBps: parsed.config.coGpCoInvestShareBps,
      promoteBase: parsed.config.promoteBase,
      lookbackClawback: parsed.config.lookbackClawback,
      lpContributedCents: parsed.lpContributedCents,
      unreturnedCapitalCents: storedUnreturned,
      unpaidPrefCents: storedUnpaid,
      prefPaidToDateCents,
      notes: parsed.config.notes,
      tiersJson,
    },
  });
  const amounts = waterfallAmountsFromStored(row);
  return overlayRecord(
    {
      entityId: entity.id,
      entityCode: entity.code,
      entityName: entity.name,
      config: configFromRow(row),
      lpContributedCents: row.lpContributedCents,
      unreturnedCapitalCents: amounts.unreturnedCapitalCents,
      unpaidPrefCents: amounts.unpaidPrefCents,
      prefPaidToDateCents: row.prefPaidToDateCents,
      persisted: true,
    },
    ledger,
  );
}

export { defaultWaterfallConfig, lookThroughConfig };
