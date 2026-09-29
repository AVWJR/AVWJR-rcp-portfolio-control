import {
  applyDistribution,
  isDistributionSource,
  lookThroughConfig,
  lpDpiBps,
  negateLines,
  openingDistributionState,
  waterfallPosition,
  type AppliedDistribution,
  type DistributionLine,
  type DistributionPosting,
  type DistributionRunningTotals,
  type DistributionSource,
  type PartyCents,
  type TierPartyTotals,
  type WaterfallPosition,
} from "@rcp/ledger";
import { isArchivedSpe } from "@/lib/archive";
import { prisma } from "@/lib/prisma";
import { dealsVisibleToLp, lpCanSeeDeal } from "@/lib/lp-scope";
import { isMissingDistributionTable, ledgerCapitalByEntity } from "@/lib/distribution-read";
import type { Prisma } from "@prisma/client";
import {
  configFromRow,
  europeanPromoteOpen,
  loadLiveSpeWaterfalls,
  waterfallAmountsFromStored,
  type SpeWaterfallRecord,
} from "@/lib/waterfall";

export class DistributionLedgerError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DistributionLedgerError";
    this.status = status;
  }
}

export function rejectDistributionEdit(): never {
  throw new DistributionLedgerError(
    "Posted distributions cannot be edited. Record a reversing distribution instead.",
    409,
  );
}

export function rejectDistributionDelete(): never {
  throw new DistributionLedgerError(
    "Posted distributions cannot be deleted. Record a reversing distribution instead.",
    409,
  );
}

export function assertCanMutateDistributions(role: "principal" | "viewer" | null | undefined): void {
  if (role === "viewer") {
    throw new DistributionLedgerError("Partner view is read-only. Unlock to record a distribution.", 403);
  }
}

type StoredEvent = {
  id: string;
  entityId: string;
  eventDate: Date;
  year: number;
  month: number;
  periodLabel: string;
  grossCents: bigint;
  source: string;
  memo: string | null;
  waterfallSnapshotJson: string;
  actor: string | null;
  sequence: number;
  reversesEventId: string | null;
  monthsAccrued: number;
  capitalContributedCents: bigint;
  capitalReturnedCents: bigint;
  unreturnedCapitalCents: bigint;
  prefAccruedCents: bigint;
  prefPaidCents: bigint;
  prefUnpaidCents: bigint;
  catchUpPaidCents: bigint;
  catchUpTargetCents: bigint;
  promoteEarnedCents: bigint;
  cumulativeLpCents: bigint;
  cumulativeRcpCents: bigint;
  cumulativeCoGpCents: bigint;
  tierTotalsJson: string;
  createdAt: Date;
  lines: {
    tierKind: string;
    tierLabel: string;
    lpCents: bigint;
    rcpCents: bigint;
    coGpCents: bigint;
    sortOrder: number;
  }[];
};

function emptyParty(): PartyCents {
  return { lpCents: 0n, rcpCents: 0n, coGpCents: 0n };
}

function parseParty(value: unknown): PartyCents {
  if (!value || typeof value !== "object") return emptyParty();
  const row = value as Record<string, unknown>;
  const cents = (key: string) => {
    try {
      return BigInt(String(row[key] ?? "0"));
    } catch {
      return 0n;
    }
  };
  return { lpCents: cents("lpCents"), rcpCents: cents("rcpCents"), coGpCents: cents("coGpCents") };
}

function parseTiers(json: string): TierPartyTotals {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return {
      roc: parseParty(raw.roc),
      pref: parseParty(raw.pref),
      catchUp: parseParty(raw.catchUp),
      promote: parseParty(raw.promote),
    };
  } catch {
    return { roc: emptyParty(), pref: emptyParty(), catchUp: emptyParty(), promote: emptyParty() };
  }
}

function tiersJson(tiers: TierPartyTotals): string {
  const party = (row: PartyCents) => ({
    lpCents: row.lpCents.toString(),
    rcpCents: row.rcpCents.toString(),
    coGpCents: row.coGpCents.toString(),
  });
  return JSON.stringify({
    roc: party(tiers.roc),
    pref: party(tiers.pref),
    catchUp: party(tiers.catchUp),
    promote: party(tiers.promote),
  });
}

function stateFromRow(row: StoredEvent): DistributionRunningTotals {
  return {
    capitalContributedCents: row.capitalContributedCents,
    capitalReturnedCents: row.capitalReturnedCents,
    unreturnedCapitalCents: row.unreturnedCapitalCents,
    prefAccruedCents: row.prefAccruedCents,
    prefPaidCents: row.prefPaidCents,
    prefUnpaidCents: row.prefUnpaidCents,
    catchUpPaidCents: row.catchUpPaidCents,
    catchUpTargetCents: row.catchUpTargetCents,
    promoteEarnedCents: row.promoteEarnedCents,
    cumulativeLpCents: row.cumulativeLpCents,
    cumulativeRcpCents: row.cumulativeRcpCents,
    cumulativeCoGpCents: row.cumulativeCoGpCents,
    byTier: parseTiers(row.tierTotalsJson),
  };
}

type LedgerDb = Prisma.TransactionClient | typeof prisma;

async function loadRows(entityId: string, db: LedgerDb = prisma): Promise<StoredEvent[]> {
  try {
    return await db.distributionEvent.findMany({
      where: { entityId },
      orderBy: [{ sequence: "asc" }, { periodLabel: "asc" }],
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  } catch (error) {
    if (isMissingDistributionTable(error)) return [];
    throw error;
  }
}

function latestSequence(rows: { sequence: number }[]): number {
  return rows.reduce((max, row) => (row.sequence > max ? row.sequence : max), 0);
}

function assertNoConcurrentPost(before: { sequence: number }[], inside: { sequence: number }[]): void {
  if (latestSequence(before) !== latestSequence(inside)) {
    throw new DistributionLedgerError(CONCURRENT_POST, 409);
  }
}

function isUniqueClash(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && (error as { code: unknown }).code === "P2002") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint failed/i.test(message);
}

const CONCURRENT_POST = "Another distribution was just recorded. Refresh and preview again.";

/** Lets a concurrent post read the current sequence before this one locks the row. */
function yieldToConcurrentPost(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function parseWholeCents(value: unknown): bigint {
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  throw new DistributionLedgerError("Amount must be whole cents", 400);
}

export function assertPreviewGrossMatches(grossCents: bigint, previewGrossCents: unknown): void {
  let preview: bigint;
  try {
    preview = parseWholeCents(previewGrossCents);
  } catch {
    throw new DistributionLedgerError("Preview this amount before confirming.", 409);
  }
  if (preview !== grossCents) {
    throw new DistributionLedgerError("Preview this amount before confirming.", 409);
  }
}

function assertPeriodNotBefore(anchor: { year: number; month: number } | null, year: number, month: number): void {
  if (!anchor) return;
  const earlier = year < anchor.year || (year === anchor.year && month < anchor.month);
  if (!earlier) return;
  const label = `${anchor.year}-${String(anchor.month).padStart(2, "0")}`;
  throw new DistributionLedgerError(
    `That period is before the latest distribution (${label}). Pick that month or a later one.`,
    409,
  );
}

async function assertSpeOpen(entityId: string): Promise<void> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { type: true, lifecycleStatus: true },
  });
  if (!entity || entity.type !== "SPE") throw new DistributionLedgerError("Unknown SPE.", 404);
  if (isArchivedSpe(entity)) {
    throw new DistributionLedgerError(
      "This SPE is soft-archived. Restore it from Deal Archive before recording a distribution.",
      409,
    );
  }
}

function reversedIds(rows: StoredEvent[]): Set<string> {
  return new Set(rows.map((row) => row.reversesEventId).filter((id): id is string => Boolean(id)));
}

function activeRows(rows: StoredEvent[]): StoredEvent[] {
  const reversed = reversedIds(rows);
  return rows.filter((row) => !row.reversesEventId && !reversed.has(row.id));
}

async function rawWaterfall(entityId: string): Promise<SpeWaterfallRecord | null> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    include: { waterfall: true },
  });
  if (!entity || entity.type !== "SPE") return null;
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
}

function seedFrom(record: SpeWaterfallRecord) {
  return {
    config: record.config,
    lpContributedCents: record.lpContributedCents,
    openingUnreturnedCents: record.unreturnedCapitalCents,
    openingUnpaidPrefCents: record.unpaidPrefCents,
    europeanPromoteOpen: record.config.templateId !== "european_fund",
  };
}

export type DistributionBoardEvent = {
  id: string;
  eventDate: string;
  periodLabel: string;
  grossCents: bigint;
  source: DistributionSource;
  memo: string | null;
  actor: string | null;
  sequence: number;
  reversesEventId: string | null;
  reversed: boolean;
  monthsAccrued: number;
  lines: DistributionLine[];
  state: DistributionRunningTotals;
  createdAt: string;
};

export type DistributionBoard = {
  ready: boolean;
  entityId: string;
  entityCode: string;
  entityName: string;
  hasEvents: boolean;
  capitalSource: "ledger" | "waterfall";
  position: WaterfallPosition;
  dpiBps: number | null;
  opening: DistributionRunningTotals;
  current: DistributionRunningTotals;
  events: DistributionBoardEvent[];
  audits: { id: string; action: string; actor: string | null; detail: string; eventId: string | null; createdAt: string }[];
};

function toBoardEvent(row: StoredEvent, reversed: Set<string>): DistributionBoardEvent {
  return {
    id: row.id,
    eventDate: row.eventDate.toISOString().slice(0, 10),
    periodLabel: row.periodLabel,
    grossCents: row.grossCents,
    source: isDistributionSource(row.source) ? row.source : "OPERATING_CASH",
    memo: row.memo,
    actor: row.actor,
    sequence: row.sequence,
    reversesEventId: row.reversesEventId,
    reversed: reversed.has(row.id),
    monthsAccrued: row.monthsAccrued,
    lines: row.lines.map((line) => ({
      tierKind: line.tierKind === "ROC" || line.tierKind === "PREF" || line.tierKind === "CATCH_UP" || line.tierKind === "PROMOTE" ? line.tierKind : "PROMOTE",
      tierLabel: line.tierLabel,
      lpCents: line.lpCents,
      rcpCents: line.rcpCents,
      coGpCents: line.coGpCents,
    })),
    state: stateFromRow(row),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadDistributionBoard(entityId: string, lpDealCodes?: string[] | null): Promise<DistributionBoard | null> {
  const record = await rawWaterfall(entityId);
  if (!record) return null;
  if (!lpCanSeeDeal(record.entityCode, lpDealCodes)) return null;
  const opening = openingDistributionState(seedFrom(record));
  let rows: StoredEvent[] = [];
  let audits: DistributionBoard["audits"] = [];
  let ready = true;
  try {
    rows = await loadRows(entityId);
    const auditRows = await prisma.distributionAudit.findMany({
      where: { entityId },
      orderBy: { createdAt: "asc" },
    });
    audits = auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor,
      detail: row.detail,
      eventId: row.eventId,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    if (!isMissingDistributionTable(error)) throw error;
    ready = false;
    rows = [];
  }
  const reversed = reversedIds(rows);
  const active = activeRows(rows);
  const current = rows.length ? stateFromRow(rows[rows.length - 1]!) : opening;
  return {
    ready,
    entityId: record.entityId,
    entityCode: record.entityCode,
    entityName: record.entityName,
    hasEvents: active.length > 0,
    capitalSource: active.length > 0 ? "ledger" : "waterfall",
    position: waterfallPosition(current, record.config),
    dpiBps: lpDpiBps(current.cumulativeLpCents, current.capitalContributedCents),
    opening,
    current,
    events: rows.map((row) => toBoardEvent(row, reversed)),
    audits,
  };
}

export function filterBoardCodes(codes: string[], lpDealCodes: string[] | null | undefined): string[] {
  return dealsVisibleToLp(codes, lpDealCodes);
}

function snapshotJson(record: SpeWaterfallRecord): string {
  return JSON.stringify({
    templateId: record.config.templateId,
    prefRateBps: record.config.prefRateBps,
    compounding: record.config.compounding,
    catchUpEnabled: record.config.catchUpEnabled,
    catchUpBps: record.config.catchUpBps,
    gpCoInvestBps: record.config.gpCoInvestBps,
    coGpName: record.config.coGpName,
    tiers: record.config.tiers,
    lpContributedCents: record.lpContributedCents.toString(),
    openingUnreturnedCents: record.unreturnedCapitalCents == null ? null : record.unreturnedCapitalCents.toString(),
    openingUnpaidPrefCents: record.unpaidPrefCents == null ? null : record.unpaidPrefCents.toString(),
  });
}

function openingFromSnapshot(json: string, fallback: SpeWaterfallRecord): DistributionRunningTotals {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (raw && typeof raw === "object" && "lpContributedCents" in raw && "openingUnreturnedCents" in raw) {
      const optional = (value: unknown): bigint | null => {
        if (value == null || value === "") return null;
        return BigInt(String(value));
      };
      return openingDistributionState({
        config: fallback.config,
        lpContributedCents: BigInt(String(raw.lpContributedCents)),
        openingUnreturnedCents: optional(raw.openingUnreturnedCents),
        openingUnpaidPrefCents: optional(raw.openingUnpaidPrefCents),
        europeanPromoteOpen: fallback.config.templateId !== "european_fund",
      });
    }
  } catch {
    // Older snapshots fall back to the waterfall row saved on the deal.
  }
  return openingDistributionState(seedFrom(fallback));
}

function dataFromApplied(applied: AppliedDistribution, extras: {
  entityId: string;
  eventDate: Date;
  memo: string | null;
  actor: string;
  reversesEventId?: string | null;
  snapshot: string;
}) {
  const state = applied.state;
  return {
    entityId: extras.entityId,
    eventDate: extras.eventDate,
    year: applied.year,
    month: applied.month,
    periodLabel: applied.periodLabel,
    grossCents: extras.reversesEventId ? -applied.grossCents : applied.grossCents,
    source: applied.source,
    memo: extras.memo,
    waterfallSnapshotJson: extras.snapshot,
    actor: extras.actor,
    reversesEventId: extras.reversesEventId ?? null,
    monthsAccrued: applied.monthsAccrued,
    capitalContributedCents: state.capitalContributedCents,
    capitalReturnedCents: state.capitalReturnedCents,
    unreturnedCapitalCents: state.unreturnedCapitalCents,
    prefAccruedCents: state.prefAccruedCents,
    prefPaidCents: state.prefPaidCents,
    prefUnpaidCents: state.prefUnpaidCents,
    catchUpPaidCents: state.catchUpPaidCents,
    catchUpTargetCents: state.catchUpTargetCents,
    promoteEarnedCents: state.promoteEarnedCents,
    cumulativeLpCents: state.cumulativeLpCents,
    cumulativeRcpCents: state.cumulativeRcpCents,
    cumulativeCoGpCents: state.cumulativeCoGpCents,
    tierTotalsJson: tiersJson(state.byTier),
    lines: {
      create: (extras.reversesEventId ? negateLines(applied.lines) : applied.lines).map((line, index) => ({
        tierKind: line.tierKind,
        tierLabel: line.tierLabel,
        lpCents: line.lpCents,
        rcpCents: line.rcpCents,
        coGpCents: line.coGpCents,
        sortOrder: index,
      })),
    },
  };
}

async function seedFor(record: SpeWaterfallRecord, entityId: string) {
  const seed = seedFrom(record);
  const parent = await prisma.entity.findUnique({ where: { id: entityId }, select: { parentId: true } });
  if (parent?.parentId) {
    seed.europeanPromoteOpen = europeanPromoteOpen(await loadLiveSpeWaterfalls(parent.parentId), 1);
  }
  return seed;
}

function mapLedgerWriteError(error: unknown): never {
  if (error instanceof DistributionLedgerError) throw error;
  if (isUniqueClash(error)) throw new DistributionLedgerError(CONCURRENT_POST, 409);
  if (isMissingDistributionTable(error)) {
    throw new DistributionLedgerError("The distribution ledger is not on this database yet.", 503);
  }
  throw error;
}

export async function previewDistribution(opts: {
  entityId: string;
  year: number;
  month: number;
  grossCents: bigint;
  source: DistributionSource;
}): Promise<{ applied: AppliedDistribution; position: WaterfallPosition; dpiBps: number | null }> {
  await assertSpeOpen(opts.entityId);
  const record = await rawWaterfall(opts.entityId);
  if (!record) throw new DistributionLedgerError("Unknown SPE.", 404);
  const rows = await loadRows(opts.entityId);
  const active = activeRows(rows);
  const seed = await seedFor(record, opts.entityId);
  const opening = openingDistributionState(seed);
  const prior = rows.length ? stateFromRow(rows[rows.length - 1]!) : opening;
  const anchor = active.length ? { year: active[active.length - 1]!.year, month: active[active.length - 1]!.month } : null;
  assertPeriodNotBefore(anchor, opts.year, opts.month);
  const posting: DistributionPosting = {
    year: opts.year,
    month: opts.month,
    grossCents: opts.grossCents,
    source: opts.source,
  };
  let applied: AppliedDistribution;
  try {
    applied = applyDistribution(seed, prior, anchor, posting);
  } catch (error) {
    if (error instanceof DistributionLedgerError) throw error;
    throw new DistributionLedgerError(error instanceof Error ? error.message : "Could not preview the distribution.");
  }
  return {
    applied,
    position: waterfallPosition(applied.state, record.config),
    dpiBps: lpDpiBps(applied.state.cumulativeLpCents, applied.state.capitalContributedCents),
  };
}

export async function postDistribution(opts: {
  entityId: string;
  eventDate: Date;
  year: number;
  month: number;
  grossCents: bigint;
  source: DistributionSource;
  memo: string | null;
  actor: string;
  role: "principal" | "viewer";
}): Promise<DistributionBoard> {
  assertCanMutateDistributions(opts.role);
  await assertSpeOpen(opts.entityId);
  const record = await rawWaterfall(opts.entityId);
  if (!record) throw new DistributionLedgerError("Unknown SPE.", 404);
  const seed = await seedFor(record, opts.entityId);
  const priorRows = await loadRows(opts.entityId);
  await yieldToConcurrentPost();
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await loadRows(opts.entityId, tx);
      assertNoConcurrentPost(priorRows, rows);
      const active = activeRows(rows);
      const anchor = active.length ? { year: active[active.length - 1]!.year, month: active[active.length - 1]!.month } : null;
      assertPeriodNotBefore(anchor, opts.year, opts.month);
      const opening = openingDistributionState(seed);
      const prior = rows.length ? stateFromRow(rows[rows.length - 1]!) : opening;
      let applied: AppliedDistribution;
      try {
        applied = applyDistribution(seed, prior, anchor, {
          year: opts.year,
          month: opts.month,
          grossCents: opts.grossCents,
          source: opts.source,
        });
      } catch (error) {
        if (error instanceof DistributionLedgerError) throw error;
        throw new DistributionLedgerError(error instanceof Error ? error.message : "Could not record the distribution.");
      }
      const created = await tx.distributionEvent.create({
        data: {
          ...dataFromApplied(applied, {
            entityId: opts.entityId,
            eventDate: opts.eventDate,
            memo: opts.memo,
            actor: opts.actor,
            snapshot: snapshotJson(record),
          }),
          sequence: latestSequence(rows) + 1,
        },
      });
      await tx.distributionAudit.create({
        data: {
          entityId: opts.entityId,
          eventId: created.id,
          action: "POST",
          actor: opts.actor,
          detail: `Posted ${applied.periodLabel} ${opts.source === "CAPITAL_EVENT" ? "capital event" : "operating cash"} distribution.`,
        },
      });
    });
  } catch (error) {
    mapLedgerWriteError(error);
  }
  const board = await loadDistributionBoard(opts.entityId);
  if (!board) throw new DistributionLedgerError("Unknown SPE.", 404);
  return board;
}

export async function reverseDistribution(opts: {
  entityId: string;
  eventId: string;
  actor: string;
  role: "principal" | "viewer";
  memo?: string | null;
}): Promise<DistributionBoard> {
  assertCanMutateDistributions(opts.role);
  await assertSpeOpen(opts.entityId);
  const record = await rawWaterfall(opts.entityId);
  if (!record) throw new DistributionLedgerError("Unknown SPE.", 404);
  const priorRows = await loadRows(opts.entityId);
  const seen = priorRows.find((row) => row.id === opts.eventId);
  if (!seen) throw new DistributionLedgerError("That distribution is not on this deal.", 404);
  await yieldToConcurrentPost();
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await loadRows(opts.entityId, tx);
      assertNoConcurrentPost(priorRows, rows);
      const target = rows.find((row) => row.id === opts.eventId);
      if (!target) throw new DistributionLedgerError("That distribution is not on this deal.", 404);
      if (target.reversesEventId) {
        throw new DistributionLedgerError("A reversing row cannot be edited or reversed again.", 409);
      }
      const reversed = reversedIds(rows);
      if (reversed.has(target.id)) {
        throw new DistributionLedgerError("That distribution is already reversed.", 409);
      }
      const active = activeRows(rows);
      const latest = active[active.length - 1];
      if (!latest || latest.id !== target.id) {
        throw new DistributionLedgerError("Reverse the latest distribution first so the running totals stay in order.", 409);
      }
      const priorIndex = active.length - 2;
      const restored = priorIndex >= 0 ? stateFromRow(active[priorIndex]!) : openingFromSnapshot(target.waterfallSnapshotJson, record);
      const applied: AppliedDistribution = {
        year: target.year,
        month: target.month,
        periodLabel: target.periodLabel,
        grossCents: target.grossCents < 0n ? -target.grossCents : target.grossCents,
        source: isDistributionSource(target.source) ? target.source : "OPERATING_CASH",
        monthsAccrued: 0,
        lines: target.lines.map((line) => ({
          tierKind: line.tierKind === "ROC" || line.tierKind === "PREF" || line.tierKind === "CATCH_UP" || line.tierKind === "PROMOTE" ? line.tierKind : "PROMOTE",
          tierLabel: line.tierLabel,
          lpCents: line.lpCents,
          rcpCents: line.rcpCents,
          coGpCents: line.coGpCents,
        })),
        state: restored,
        run: null as unknown as AppliedDistribution["run"],
      };
      const created = await tx.distributionEvent.create({
        data: {
          ...dataFromApplied(applied, {
            entityId: opts.entityId,
            eventDate: new Date(),
            memo: opts.memo?.trim() || `Reverses the ${target.periodLabel} distribution.`,
            actor: opts.actor,
            reversesEventId: target.id,
            snapshot: target.waterfallSnapshotJson,
          }),
          sequence: latestSequence(rows) + 1,
        },
      });
      await tx.distributionAudit.create({
        data: {
          entityId: opts.entityId,
          eventId: created.id,
          action: "REVERSE",
          actor: opts.actor,
          detail: `Reversed ${target.periodLabel} distribution ${target.id}. Running totals restored to the prior distribution.`,
        },
      });
    });
  } catch (error) {
    mapLedgerWriteError(error);
  }
  const board = await loadDistributionBoard(opts.entityId);
  if (!board) throw new DistributionLedgerError("Unknown SPE.", 404);
  return board;
}

export function distributionCsv(board: DistributionBoard): string {
  const headers = [
    "period",
    "date",
    "source",
    "gross",
    "memo",
    "actor",
    "reverses",
    "reversed",
    "lp",
    "rcp",
    "co_gp",
    "roc_lp",
    "roc_rcp",
    "roc_co_gp",
    "pref_lp",
    "pref_rcp",
    "pref_co_gp",
    "catch_up_lp",
    "catch_up_rcp",
    "catch_up_co_gp",
    "promote_lp",
    "promote_rcp",
    "promote_co_gp",
    "capital_contributed",
    "capital_returned",
    "unreturned",
    "pref_accrued",
    "pref_paid",
    "pref_unpaid",
    "catch_up_paid",
    "catch_up_target",
    "promote_earned",
    "cumulative_lp",
    "cumulative_rcp",
    "cumulative_co_gp",
  ];
  const cell = (value: string | bigint | boolean | null) => {
    const text = value == null ? "" : typeof value === "bigint" ? (Number(value) / 100).toFixed(2) : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [headers.join(",")];
  for (const event of board.events) {
    const tier = (kind: DistributionLine["tierKind"]) =>
      event.lines.filter((line) => line.tierKind === kind).reduce(
        (acc, line) => ({
          lpCents: acc.lpCents + line.lpCents,
          rcpCents: acc.rcpCents + line.rcpCents,
          coGpCents: acc.coGpCents + line.coGpCents,
        }),
        emptyParty(),
      );
    const roc = tier("ROC");
    const pref = tier("PREF");
    const catchUp = tier("CATCH_UP");
    const promote = tier("PROMOTE");
    const state = event.state;
    lines.push(
      [
        event.periodLabel,
        event.eventDate,
        event.source,
        event.grossCents,
        event.memo,
        event.actor,
        event.reversesEventId,
        event.reversed,
        event.lines.reduce((acc, line) => acc + line.lpCents, 0n),
        event.lines.reduce((acc, line) => acc + line.rcpCents, 0n),
        event.lines.reduce((acc, line) => acc + line.coGpCents, 0n),
        roc.lpCents,
        roc.rcpCents,
        roc.coGpCents,
        pref.lpCents,
        pref.rcpCents,
        pref.coGpCents,
        catchUp.lpCents,
        catchUp.rcpCents,
        catchUp.coGpCents,
        promote.lpCents,
        promote.rcpCents,
        promote.coGpCents,
        state.capitalContributedCents,
        state.capitalReturnedCents,
        state.unreturnedCapitalCents,
        state.prefAccruedCents,
        state.prefPaidCents,
        state.prefUnpaidCents,
        state.catchUpPaidCents,
        state.catchUpTargetCents,
        state.promoteEarnedCents,
        state.cumulativeLpCents,
        state.cumulativeRcpCents,
        state.cumulativeCoGpCents,
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export async function rcpDistributionsByCode(entityIds: string[]): Promise<Map<string, bigint>> {
  const map = await ledgerCapitalByEntity(entityIds);
  const out = new Map<string, bigint>();
  for (const [id, row] of map) out.set(id, row.hasEvents ? row.cumulativeRcpCents : 0n);
  return out;
}
