import { createHash } from "node:crypto";
import { actingUserId } from "@/lib/auth/actor";
import { isArchivedSpe } from "@/lib/archive";
import { ensureMasterCoaCurrent } from "@/lib/entities";
import { openPeriod } from "@/lib/deals/periods";
import { parseRentRollSource } from "@/lib/deals/workbook";
import { hardLockPeriod, reopenPeriod, softClosePeriod } from "@/lib/period-close";
import { assertTieOutsAllowLock } from "@/lib/close/guards";
import { clearReviewerSignOff } from "@/lib/close/sign-off";
import { putStoredFile } from "@/lib/file-store";
import { postJournal } from "@/lib/post-journal";
import { importRentRollSource } from "@/lib/rent-roll";
import { loadPostedLines } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import {
  MASTER_COA_BY_CODE,
  PeriodLockedError,
  balanceSheetDeltaJournal,
  incomeStatementJournal,
  journalBalances,
  netByCode,
  rollupBalances,
  type ImportAmount,
  type PeriodCloseStatus,
} from "@rcp/ledger";
import {
  normalizeVendorLabel,
  isNonRevenueSubstatus,
  rentRollGpr,
  rentRollNonRevenue,
  rentRollVacancyLoss,
  signedLossToLease,
  runRentRollTieOuts,
  TIE_OUT_TOLERANCE_KEYS,
  leaseExpirationSummary,
  leaseMasterRecord,
  type CanonicalUnit,
  type LeaseUnit,
  type TieOut,
  type TieTolerance,
} from "@rcp/properties";
import {
  balancePostingLabel,
  balanceSourceSummary,
  chooseBalanceUpload,
  isBalanceSource,
  MISSING_BALANCE_SOURCE_MESSAGE,
  newerBalanceNotice,
} from "./balance-source";
import {
  chooseIncomeUpload,
  incomePostingLabel,
  incomeSourceSummary,
  isIncomeSource,
  MISSING_INCOME_SOURCE_MESSAGE,
  newerFileNotice,
  newerSelectableUpload,
} from "./income-source";
import {
  applyRememberedMaps,
  balanceSheetLacksUsableAmount,
  classifyCloseFile,
  EMPTY_BALANCE_SHEET_MESSAGE,
  parseCloseFile,
  type CloseFileClass,
  type ParsedCloseLine,
} from "./parse-file";

function periodRank(year: number, month: number): number {
  return year * 12 + month;
}

/**
 * Replace the live Unit table when the upload is the SPE's most recent period
 * or its latest open period that has not been reopened. Earlier months and
 * reopened months write the lease snapshot only.
 */
export async function shouldReplaceLiveUnits(entityId: string, year: number, month: number): Promise<boolean> {
  const periods = await prisma.period.findMany({
    where: { entityId },
    select: { year: true, month: true, status: true, reopenedAt: true },
  });
  const current = periods.find((row) => row.year === year && row.month === month);
  if (current?.reopenedAt) return false;
  const target = periodRank(year, month);
  const latest = periods.reduce((best, row) => Math.max(best, periodRank(row.year, row.month)), 0);
  if (target === latest && latest > 0) return true;
  const latestOpen = periods
    .filter((row) => row.status === "OPEN" && !row.reopenedAt)
    .reduce((best, row) => Math.max(best, periodRank(row.year, row.month)), 0);
  return latestOpen > 0 && target === latestOpen;
}

function periodEndIso(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function rememberedMaps(entityId: string) {
  return prisma.vendorAccountMap.findMany({ where: { entityId } });
}

async function logMonthEnd(data: {
  entityId: string;
  year: number;
  month: number;
  action: string;
  detail: string;
}) {
  await prisma.monthEndEvent.create({
    data: { ...data, actorUserId: await actingUserId() },
  });
}

export async function rememberMap(opts: {
  entityId: string;
  sourceSystem: string;
  sourceAccountNo: string;
  label: string;
  accountCode: string;
  year?: number;
  month?: number;
}) {
  const normalizedLabel = normalizeVendorLabel(opts.label);
  const actorUserId = await actingUserId();
  await prisma.vendorAccountMap.upsert({
    where: {
      entityId_sourceSystem_sourceAccountNo_normalizedLabel: {
        entityId: opts.entityId,
        sourceSystem: opts.sourceSystem,
        sourceAccountNo: opts.sourceAccountNo,
        normalizedLabel,
      },
    },
    update: { accountCode: opts.accountCode, updatedByUserId: actorUserId },
    create: {
      entityId: opts.entityId,
      sourceSystem: opts.sourceSystem,
      sourceAccountNo: opts.sourceAccountNo,
      normalizedLabel,
      accountCode: opts.accountCode,
      updatedByUserId: actorUserId,
    },
  });
  await logMonthEnd({
    entityId: opts.entityId,
    year: opts.year ?? 0,
    month: opts.month ?? 0,
    action: "MAP",
    detail: `${opts.label} → ${opts.accountCode}`,
  });
}

function unmappedLabels(lines: ParsedCloseLine[]): string[] {
  return lines.filter((line) => !line.accountCode).map((line) => line.sourceLabel);
}

export async function storeCloseUpload(opts: {
  entityId: string;
  entityCode: string;
  year: number;
  month: number;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const entity = await prisma.entity.findUnique({ where: { id: opts.entityId } });
  if (!entity) throw new Error("Unknown SPE.");
  if (isArchivedSpe(entity)) {
    throw new Error("This SPE is soft-archived. Restore it from Deal Archive before uploading a month-end package.");
  }
  const period = await openPeriod(opts.entityId, opts.year, opts.month);
  if (period.status === "CLOSED") {
    throw new PeriodLockedError("This month is hard-locked. Reopen it with a reason and a ticket before uploading a replacement.");
  }
  const classification = classifyCloseFile(opts.filename, opts.bytes);
  const parsed = parseCloseFile(opts.filename, opts.bytes, {
    classification,
    year: opts.year,
    month: opts.month,
  });
  const maps = await rememberedMaps(opts.entityId);
  const lines = applyRememberedMaps(parsed.lines, maps);
  const sha = createHash("sha256").update(opts.bytes).digest("hex");
  const storagePath = await putStoredFile(
    `month-end/${opts.entityCode}/${opts.year}-${String(opts.month).padStart(2, "0")}/${sha.slice(0, 12)}-${opts.filename}`,
    opts.bytes,
    opts.mimeType || "application/octet-stream",
  );
  await prisma.vaultDocument.create({
    data: {
      entityId: opts.entityId,
      kind: classification === "rent_roll" ? "rent_roll" : "month_end",
      title: opts.filename,
      filename: opts.filename,
      mimeType: opts.mimeType || "application/octet-stream",
      storagePath,
      byteSize: opts.bytes.length,
      notes: `Month-end ${opts.year}-${String(opts.month).padStart(2, "0")} · ${classification}`,
    },
  });
  const upload = await prisma.monthEndUpload.create({
    data: {
      entityId: opts.entityId,
      year: opts.year,
      month: opts.month,
      filename: opts.filename,
      mimeType: opts.mimeType || "application/octet-stream",
      classification,
      byteSize: opts.bytes.length,
      sha256: sha,
      storagePath,
      parsedJson: JSON.stringify({ ...parsed, lines, unmapped: unmappedLabels(lines) }),
      uploadedByUserId: await actingUserId(),
    },
  });
  let rentRollUnits = 0;
  if (classification === "rent_roll") {
    const source = parseRentRollSource({
      filename: opts.filename,
      mimeType: opts.mimeType,
      bytes: opts.bytes,
    });
    rentRollUnits = source.normalized.units.length;
    const chargeMismatchCount = source.normalized.warnings.filter((warning) => /charge lines sum/.test(warning)).length;
    const balanceColumnPresent = source.normalized.meta.extras.has_balance_column === "yes";
    await writeLeaseSnapshots(opts.entityCode, opts.entityId, opts.year, opts.month, source.normalized.units, {
      asOfDate: source.normalized.meta.asOfDate,
      dialect: source.normalized.meta.dialect,
    });
    await prisma.monthEndUpload.update({
      where: { id: upload.id },
      data: {
        parsedJson: JSON.stringify({
          lines,
          unmapped: unmappedLabels(lines),
          asOfDate: source.normalized.meta.asOfDate,
          chargeMismatchCount,
          balanceColumnPresent,
          unitCount: rentRollUnits,
          note: parsed.note,
        }),
      },
    });
    if (await shouldReplaceLiveUnits(opts.entityId, opts.year, opts.month)) {
      await importRentRollSource({
        entityId: opts.entityId,
        filename: opts.filename,
        mimeType: opts.mimeType,
        bytes: opts.bytes,
        confirmReplace: true,
        asOfDate: source.normalized.meta.asOfDate
          ? new Date(`${source.normalized.meta.asOfDate.slice(0, 10)}T16:00:00.000Z`)
          : new Date(`${periodEndIso(opts.year, opts.month)}T16:00:00.000Z`),
      });
    }
  }
  await logMonthEnd({
    entityId: opts.entityId,
    year: opts.year,
    month: opts.month,
    action: "UPLOAD",
    detail: `${opts.filename} · ${classification} · ${lines.length} lines · ${rentRollUnits || "no"} rent-roll units`,
  });
  return { uploadId: upload.id, classification, unmapped: unmappedLabels(lines), rentRollUnits, note: parsed.note };
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

async function writeLeaseSnapshots(
  propertyCode: string,
  entityId: string,
  year: number,
  month: number,
  units: CanonicalUnit[],
  meta: { asOfDate: string | null; dialect: string | null },
) {
  await prisma.leasePeriodSnapshot.deleteMany({ where: { entityId, year, month } });
  if (!units.length) return;
  await prisma.leasePeriodSnapshot.createMany({
    data: units.map((unit) => ({
      entityId,
      year,
      month,
      unitCode: unit.unitCode,
      payloadJson: JSON.stringify(
        leaseMasterRecord({
          propertyCode,
          asOfDate: meta.asOfDate,
          dialect: meta.dialect,
          unitCode: unit.unitCode,
          building: unit.section,
          unitType: unit.unitType,
          beds: unit.beds,
          bathsTenths: unit.bathsTenths,
          sqft: unit.sqft,
          status: unit.status,
          substatus: unit.extras.unit_substatus || "",
          residentId: unit.residentId,
          residentName: unit.residentName,
          leaseStart: extraLeaseStart(unit),
          leaseEnd: iso(unit.leaseExpiration),
          moveIn: iso(unit.moveIn),
          moveOut: iso(unit.moveOut),
          marketRentCents: unit.marketRentCents,
          leaseRentCents: unit.inPlaceRentCents,
          concessionCents: unit.concessionCents,
          depositCents: unit.residentDepositCents + unit.otherDepositCents,
          balanceCents: unit.balanceCents,
          charges: unit.charges,
          extras: unit.extras,
          sourceRows: unit.sourceRows,
        }),
      ),
    })),
  });
}

function extraLeaseStart(unit: CanonicalUnit): string | null {
  for (const [key, value] of Object.entries(unit.extras)) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (norm === "leasestart" || norm === "leasestartdate") return value.slice(0, 10);
  }
  return null;
}

function uploadNote(parsedJson: string): { note: string; blocksPosting: boolean } {
  try {
    const parsed = JSON.parse(parsedJson) as { note?: string; control?: { blocksPosting?: boolean } };
    return { note: parsed.note ?? "", blocksPosting: Boolean(parsed.control?.blocksPosting) };
  } catch {
    return { note: "", blocksPosting: false };
  }
}

function mappedIncomeLines(lines: ParsedCloseLine[]): ParsedCloseLine[] {
  return lines.filter((line) => line.accountCode && !line.flag && !line.balanceSheet);
}

/**
 * Unmapped labels are not frozen at upload. After remembered maps, zero mapped
 * income lines still block; a file that now maps does not.
 */
function postingBlockAfterMaps(
  classification: string,
  lines: ParsedCloseLine[],
  saved: { note: string; blocksPosting: boolean },
): { note: string; blocksPosting: boolean } {
  if (classification === "balance_sheet" && balanceSheetLacksUsableAmount(lines)) {
    return {
      blocksPosting: true,
      note: /posting is blocked/i.test(saved.note) ? saved.note : `${saved.note} ${EMPTY_BALANCE_SHEET_MESSAGE}`.trim(),
    };
  }
  if (saved.blocksPosting) return saved;
  if (classification !== "t12" && classification !== "income_statement") return saved;
  if (!lines.some((line) => !line.flag) || mappedIncomeLines(lines).length > 0) return saved;
  return {
    blocksPosting: true,
    note: "No income lines are mapped yet, so posting is blocked. Remember an RCP account for each line, then post. You do not need to upload the file again.",
  };
}

function uploadIsBlocked(
  upload: { classification: string; parsedJson: string },
  maps: { normalizedLabel: string; sourceAccountNo: string; accountCode: string }[],
): boolean {
  const lines = applyRememberedMaps(linesFromUpload(upload.parsedJson), maps);
  return postingBlockAfterMaps(upload.classification, lines, uploadNote(upload.parsedJson)).blocksPosting;
}

function uploadControl(parsedJson: string): { blocksPosting: boolean; detail: string } | null {
  try {
    const parsed = JSON.parse(parsedJson) as { control?: { blocksPosting?: boolean; detail?: string } };
    if (!parsed.control) return null;
    return { blocksPosting: Boolean(parsed.control.blocksPosting), detail: parsed.control.detail ?? "" };
  } catch {
    return null;
  }
}

function uploadMeta(parsedJson: string): {
  asOfDate?: string | null;
  chargeMismatchCount?: number;
  balanceColumnPresent?: boolean;
} {
  try {
    return JSON.parse(parsedJson) as {
      asOfDate?: string | null;
      chargeMismatchCount?: number;
      balanceColumnPresent?: boolean;
    };
  } catch {
    return {};
  }
}

function linesFromUpload(parsedJson: string): ParsedCloseLine[] {
  try {
    const parsed = JSON.parse(parsedJson) as { lines?: ParsedCloseLine[] };
    return parsed.lines ?? [];
  } catch {
    return [];
  }
}

function controllerOverrideAccepted(value: boolean | string | undefined): boolean {
  return value === true || value === "yes";
}

/** Soft-closed months stay put until a controller checks the override and writes a reason. */
function softCloseOverrideReason(
  status: string,
  opts: { controllerOverride?: boolean | string; reason?: string },
): string | null {
  if (status !== "SOFT_CLOSED") return null;
  const reason = opts.reason?.trim() ?? "";
  if (!controllerOverrideAccepted(opts.controllerOverride) || !reason) {
    throw new Error(
      "This month is soft-closed. Check the controller override and enter a reason before posting or reversing. Without that, the books stay as they are.",
    );
  }
  return reason;
}

async function logControllerOverride(entityId: string, year: number, month: number, reason: string) {
  await logMonthEnd({
    entityId,
    year,
    month,
    action: "CONTROLLER_OVERRIDE",
    detail: reason,
  });
}

export async function postCloseToBooks(opts: {
  entityId: string;
  year: number;
  month: number;
  /** Income statement, T12, or other file to post. Blank reuses a saved choice, or the most recent income statement. */
  incomeUploadId?: string | null;
  /** Balance sheet to post. Blank reuses a saved choice, or the most recent balance sheet. */
  balanceUploadId?: string | null;
  controllerOverride?: boolean | string;
  reason?: string;
}) {
  await ensureMasterCoaCurrent();
  const period = await openPeriod(opts.entityId, opts.year, opts.month);
  if (period.status === "CLOSED") {
    throw new PeriodLockedError("Closed months are not overwritten. Reopen with a reason and a ticket.");
  }
  const overrideReason = softCloseOverrideReason(period.status, opts);
  const uploads = await prisma.monthEndUpload.findMany({
    where: { entityId: opts.entityId, year: opts.year, month: opts.month },
    orderBy: { createdAt: "asc" },
  });
  const maps = await rememberedMaps(opts.entityId);
  const blocked = (upload: (typeof uploads)[number]) => uploadIsBlocked(upload, maps);
  const chosen = chooseIncomeUpload(uploads, opts.incomeUploadId, {
    savedUploadId: period.incomeSourceUploadId,
    isBlocked: blocked,
    blockedSaved: "throw",
    missingSaved: "throw",
  });
  const chosenBalance = chooseBalanceUpload(uploads, opts.balanceUploadId, {
    savedUploadId: period.balanceSourceUploadId,
    isBlocked: blocked,
    blockedSaved: "throw",
    missingSaved: "throw",
  });
  const income: ImportAmount[] = [];
  const balanceDesired = new Map<string, bigint>();
  for (const upload of uploads) {
    const kind = upload.classification as CloseFileClass;
    if (kind === "rent_roll" || (kind === "pdf" && linesFromUpload(upload.parsedJson).length === 0)) continue;
    const incomeFile = isIncomeSource(kind);
    if (incomeFile && upload.id !== chosen?.id) continue;
    if (isBalanceSource(kind) && upload.id !== chosenBalance?.id) continue;
    const control = uploadControl(upload.parsedJson);
    if (control?.blocksPosting) throw new Error(control.detail || "Import control totals do not tie. Posting is blocked.");
    const lines = applyRememberedMaps(linesFromUpload(upload.parsedJson), maps);
    if (isBalanceSource(kind) && balanceSheetLacksUsableAmount(lines)) {
      throw new Error(`${upload.filename} has no usable balance-sheet amount, so posting is blocked.`);
    }
    if (incomeFile && mappedIncomeLines(lines).length === 0) {
      throw new Error(
        `${upload.filename} has no mapped income lines for this close month, so posting is blocked. Remember an RCP account for each line, then post again.`,
      );
    }
    const postIncome = incomeFile || !chosen;
    for (const line of lines) {
      if (line.flag) continue;
      const code = line.accountCode ?? "1999";
      const signed = BigInt(line.signedCents);
      if (kind === "balance_sheet" || line.balanceSheet) {
        const account = MASTER_COA_BY_CODE.get(code);
        const displayed = signed < 0n ? -signed : signed;
        const net = !account
          ? signed
          : account.normalBalance === "DEBIT"
            ? account.isContra
              ? -displayed
              : displayed
            : account.isContra
              ? displayed
              : -displayed;
        balanceDesired.set(code, (balanceDesired.get(code) ?? 0n) + net);
      } else if (postIncome) {
        // A chosen T12 already stores only the close-month column. Budget, variance, YTD, and the trailing total stay off the books.
        income.push({ accountCode: code, signedCents: signed, memo: line.sourceLabel });
      }
    }
  }
  const existing = await prisma.journal.findMany({
    where: { entityId: opts.entityId, periodId: period.id, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const reversedIds = new Set(
    existing.map((row) => row.reversesJournalId).filter((id): id is string => Boolean(id)),
  );
  const foreignPnl = existing.flatMap((journal) => {
    const plan = planOperatingReversal(journal, reversedIds);
    return plan ? [plan] : [];
  });
  if (foreignPnl.length > 0) {
    const manual = foreignPnl.filter((plan) => plan.needsManualSplit);
    if (manual.length === foreignPnl.length) {
      throw new Error(
        `${manual.length} journal(s) mix above-NOI accounts with an OpCo mirror (1310, 2310, 6310, or 7010) and need a manual split. Posting is blocked so those operating lines are not counted twice.`,
      );
    }
    const extra = manual.length
      ? ` ${manual.length} of them mix in an OpCo mirror and need a manual split.`
      : "";
    throw new Error(
      `This month already has ${foreignPnl.length} above-NOI operating journal(s). Posting the package would count NOI twice. Reverse those journals before posting the close.${extra}`,
    );
  }
  const importSources = ["month_end_is", "month_end_bs"] as const;
  if (overrideReason) await logControllerOverride(opts.entityId, opts.year, opts.month, overrideReason);
  const controller = overrideReason != null;
  if (period.status === "SOFT_CLOSED") {
    const stillInEffect = existing.filter(
      (row) => (row.source === "month_end_is" || row.source === "month_end_bs") && !reversedIds.has(row.id),
    );
    for (const journal of stillInEffect) {
      await postJournal({
        entityId: opts.entityId,
        periodId: period.id,
        date: new Date(`${periodEndIso(opts.year, opts.month)}T16:00:00.000Z`),
        memo: `Reversal of ${journal.memo}`,
        source: `${journal.source}_reversal`,
        reversesJournalId: journal.id,
        allowControllerAdjustment: controller,
        lines: journal.lines.map((line) => ({
          accountCode: line.account.code,
          debit: line.credit,
          credit: line.debit,
          memo: `Reversal: ${line.memo ?? journal.memo}`,
        })),
      });
    }
  } else {
    await prisma.journal.deleteMany({
      where: {
        entityId: opts.entityId,
        periodId: period.id,
        source: { in: ["month_end_is_reversal", "month_end_bs_reversal"] },
      },
    });
    await prisma.journal.deleteMany({
      where: { entityId: opts.entityId, periodId: period.id, source: { in: [...importSources] } },
    });
  }
  const date = new Date(`${periodEndIso(opts.year, opts.month)}T16:00:00.000Z`);
  if (income.length) {
    const journal = incomeStatementJournal(income);
    if (!journalBalances(journal)) throw new Error("Income statement import did not balance.");
    await postJournal({
      entityId: opts.entityId,
      periodId: period.id,
      date,
      memo: `Month-end income statement ${period.label}`,
      source: "month_end_is",
      lines: journal,
      allowControllerAdjustment: controller,
    });
  }
  if (balanceDesired.size) {
    const through = await loadPostedLines({ entityIds: [opts.entityId], through: date });
    const balances = rollupBalances(through);
    const current = new Map(balances.map((row) => [row.code, netByCode(balances, row.code)]));
    const journal = balanceSheetDeltaJournal(current, balanceDesired);
    if (journal.length && journalBalances(journal)) {
      await postJournal({
        entityId: opts.entityId,
        periodId: period.id,
        date,
        memo: `Month-end balance sheet ${period.label}`,
        source: "month_end_bs",
        lines: journal,
        allowControllerAdjustment: controller,
      });
    }
  }
  await logMonthEnd({
    entityId: opts.entityId,
    year: opts.year,
    month: opts.month,
    action: "POST",
    detail: `Posted ${income.length} income lines from ${chosen?.filename ?? "no income file"} and ${balanceDesired.size} balance-sheet lines from ${chosenBalance?.filename ?? "no balance sheet"}`,
  });
  await clearReviewerSignOff(period.id);
  const explicitIncome = opts.incomeUploadId?.trim();
  const explicitBalance = opts.balanceUploadId?.trim();
  const incomeToSave =
    explicitIncome && chosen
      ? chosen.id
      : !period.incomeSourceUploadId && chosen && onlyPostableUploadId(uploads, isIncomeSource, blocked) === chosen.id
        ? chosen.id
        : null;
  const balanceToSave =
    explicitBalance && chosenBalance
      ? chosenBalance.id
      : !period.balanceSourceUploadId &&
          chosenBalance &&
          onlyPostableUploadId(uploads, isBalanceSource, blocked) === chosenBalance.id
        ? chosenBalance.id
        : null;
  if (incomeToSave || balanceToSave) {
    await prisma.period.update({
      where: { id: period.id },
      data: {
        ...(incomeToSave ? { incomeSourceUploadId: incomeToSave } : {}),
        ...(balanceToSave ? { balanceSourceUploadId: balanceToSave } : {}),
      },
    });
  }
}

function onlyPostableUploadId<T extends { id: string; classification: string }>(
  uploads: T[],
  matches: (classification: string) => boolean,
  isBlocked: (upload: T) => boolean,
): string | null {
  const postable = uploads.filter((upload) => matches(upload.classification) && !isBlocked(upload));
  return postable.length === 1 ? postable[0]!.id : null;
}

function savedSourceMissing(
  uploads: { id: string; classification: string }[],
  savedId: string | null,
  matches: (classification: string) => boolean,
): boolean {
  const id = savedId?.trim();
  if (!id) return false;
  return !uploads.some((upload) => upload.id === id && matches(upload.classification));
}

export async function loadCloseWorkspace(entityId: string, year: number, month: number) {
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId, year, month } },
    include: {
      closeEvents: { orderBy: { createdAt: "asc" } },
      checklist: { orderBy: { sortOrder: "asc" } },
    },
  });
  const uploads = await prisma.monthEndUpload.findMany({
    where: { entityId, year, month },
    orderBy: { createdAt: "asc" },
  });
  const events = await prisma.monthEndEvent.findMany({
    where: { entityId, year, month },
    orderBy: { createdAt: "asc" },
  });
  const maps = await rememberedMaps(entityId);
  const snapshots = await prisma.leasePeriodSnapshot.findMany({ where: { entityId, year, month } });
  const liveUnits = await prisma.unit.findMany({ where: { entityId } });
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  const end = new Date(`${periodEndIso(year, month)}T23:59:59.000Z`);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const inPeriod = period
    ? await loadPostedLines({ entityIds: [entityId], from: start, to: end })
    : [];
  const throughEnd = period ? await loadPostedLines({ entityIds: [entityId], through: end }) : [];
  const balances = rollupBalances(inPeriod);
  const ending = rollupBalances(throughEnd);
  const gl = (code: string) => {
    const row = balances.find((item) => item.code === code);
    if (!row) return 0n;
    if (code === "4015") return row.debit - row.credit;
    if (row.type === "REVENUE") return row.credit - row.debit;
    return row.debit - row.credit;
  };
  const leaseUnits: LeaseUnit[] = snapshots.length
    ? snapshots.map((row) => snapshotToLease(row.payloadJson, row.unitCode))
    : liveUnits.map((unit) => ({
        unitCode: unit.unitCode,
        status: unit.status,
        marketRentCents: unit.marketRent,
        leaseRentCents: unit.inPlaceRent,
        leaseStart: unit.leaseStart ? unit.leaseStart.toISOString().slice(0, 10) : null,
        leaseEnd: unit.leaseEnd ? unit.leaseEnd.toISOString().slice(0, 10) : null,
        moveIn: unit.leaseStart ? unit.leaseStart.toISOString().slice(0, 10) : null,
        moveOut: null,
        mtm: false,
        balanceCents: 0n,
        depositCents: 0n,
        concessionCents: unit.concessionCents,
        substatus: unit.substatus ?? undefined,
      }));
  const rentRollUpload = uploads.find((upload) => upload.classification === "rent_roll");
  const rentMeta = rentRollUpload ? uploadMeta(rentRollUpload.parsedJson) : {};
  const fileAsOf = rentMeta.asOfDate ?? null;
  const periodEnd = periodEndIso(year, month);
  const summary = leaseExpirationSummary(leaseUnits, fileAsOf ?? periodEnd);
  const live = liveUnits.map((unit) => ({
    unitCode: unit.unitCode,
    floorplan: unit.floorplan,
    beds: unit.beds,
    bathsTenths: unit.bathsTenths,
    sqft: unit.sqft,
    status: unit.status,
    substatus: unit.substatus ?? undefined,
    marketRent: unit.marketRent,
    inPlaceRent: unit.inPlaceRent,
    leaseStart: unit.leaseStart,
    leaseEnd: unit.leaseEnd,
    concessionCents: unit.concessionCents,
  }));
  const fromSnapshot = snapshots.length > 0;
  const nonRevenue = (units: LeaseUnit[]) =>
    units
      .filter((unit) => ["MODEL", "EMPLOYEE", "ADMIN"].includes((unit.substatus ?? "").toUpperCase()))
      .reduce((acc, unit) => acc + unit.marketRentCents, 0n);
  const gpr = fromSnapshot
    ? leaseUnits.filter((unit) => unit.status !== "DOWN").reduce((acc, unit) => acc + unit.marketRentCents, 0n)
    : rentRollGpr(live);
  const vacancyCents = fromSnapshot
    ? leaseUnits.filter((unit) => unit.status === "VACANT").reduce((acc, unit) => acc + unit.marketRentCents, 0n)
    : rentRollVacancyLoss(live);
  const concessionCents = fromSnapshot
    ? leaseUnits
        .filter((unit) => unit.status === "OCCUPIED")
        .reduce((acc, unit) => acc + (unit.concessionCents ?? 0n), 0n)
    : liveUnits.reduce((acc, unit) => acc + unit.concessionCents, 0n);
  const nonRevenueCents = fromSnapshot ? nonRevenue(leaseUnits) : rentRollNonRevenue(live);
  const revenueOccupied = (unit: LeaseUnit) =>
    unit.status === "OCCUPIED" && !isNonRevenueSubstatus(unit.substatus);
  const signedLtlCents = fromSnapshot
    ? leaseUnits
        .filter(revenueOccupied)
        .reduce((acc, unit) => acc + (unit.marketRentCents - unit.leaseRentCents), 0n)
    : signedLossToLease(live);
  const toleranceRows = await prisma.tieOutTolerance.findMany({ where: { entityId } });
  const tolerances: Partial<Record<string, TieTolerance>> = {};
  for (const row of toleranceRows) {
    tolerances[row.key] = {
      ...(row.cents != null ? { cents: row.cents } : {}),
      ...(row.bps != null ? { bps: row.bps } : {}),
      ...(row.days != null ? { days: row.days } : {}),
    };
  }
  const tieOuts: TieOut[] = runRentRollTieOuts({
    rentRollPresent: leaseUnits.length > 0,
    entityUnitCount: entity?.unitCount ?? null,
    unitCount: leaseUnits.length,
    rentableCount: leaseUnits.filter((unit) => unit.status !== "DOWN").length,
    occupiedCount: leaseUnits.filter((unit) => unit.status === "OCCUPIED").length,
    vacantCount: leaseUnits.filter((unit) => unit.status === "VACANT").length,
    downCount: leaseUnits.filter((unit) => unit.status === "DOWN").length,
    gprCents: gpr,
    scheduledRentCents: leaseUnits
      .filter(revenueOccupied)
      .reduce((acc, unit) => acc + unit.leaseRentCents, 0n),
    signedLtlCents,
    vacancyCents,
    concessionCents,
    nonRevenueCents,
    delinquencyCents: rentMeta.balanceColumnPresent ? summary.delinquencyCents : null,
    depositCents: summary.depositsCents,
    prepaidCents: summary.creditCents,
    asOfDate: fileAsOf,
    periodEnd,
    gl: {
      gpr: gl("4010"),
      ltl: gl("4015"),
      vacancy: gl("4020"),
      concessions: gl("4030"),
      nru: gl("4040"),
      ar: netByCode(ending, "1110"),
      deposits: -netByCode(ending, "2050"),
      depositCash: netByCode(ending, "1040"),
      prepaid: -netByCode(ending, "2040"),
    },
    chargeMismatchCount: rentMeta.chargeMismatchCount ?? 0,
    tolerances,
  });
  const blocked = (upload: (typeof uploads)[number]) => uploadIsBlocked(upload, maps);
  const savedIncomeUploadId = period?.incomeSourceUploadId ?? null;
  const savedBalanceUploadId = period?.balanceSourceUploadId ?? null;
  const incomeMissing = savedSourceMissing(uploads, savedIncomeUploadId, isIncomeSource);
  const balanceMissing = savedSourceMissing(uploads, savedBalanceUploadId, isBalanceSource);
  const automaticIncome = chooseIncomeUpload(uploads, null, { isBlocked: blocked });
  const effectiveIncome = incomeMissing
    ? null
    : chooseIncomeUpload(uploads, null, {
        savedUploadId: savedIncomeUploadId,
        isBlocked: blocked,
        blockedSaved: "ignore",
        missingSaved: "ignore",
      });
  const automaticBalance = chooseBalanceUpload(uploads, null, { isBlocked: blocked });
  const effectiveBalance = balanceMissing
    ? null
    : chooseBalanceUpload(uploads, null, {
        savedUploadId: savedBalanceUploadId,
        isBlocked: blocked,
        blockedSaved: "ignore",
        missingSaved: "ignore",
      });
  const incomeSaved = Boolean(savedIncomeUploadId && effectiveIncome?.id === savedIncomeUploadId);
  const balanceSaved = Boolean(savedBalanceUploadId && effectiveBalance?.id === savedBalanceUploadId);
  const newerIncome = incomeSaved
    ? newerSelectableUpload(
        uploads.filter((upload) => isIncomeSource(upload.classification)),
        effectiveIncome,
        blocked,
      )
    : null;
  const newerBalance = balanceSaved
    ? newerSelectableUpload(
        uploads.filter((upload) => isBalanceSource(upload.classification)),
        effectiveBalance,
        blocked,
      )
    : null;
  const fileViews = uploads.map((upload) => {
    const lines = applyRememberedMaps(linesFromUpload(upload.parsedJson), maps);
    const meta = postingBlockAfterMaps(upload.classification, lines, uploadNote(upload.parsedJson));
    const incomePosting = !isIncomeSource(upload.classification)
      ? null
      : upload.id === effectiveIncome?.id
        ? ("source" as const)
        : ("superseded" as const);
    const balancePosting = !isBalanceSource(upload.classification)
      ? null
      : upload.id === effectiveBalance?.id
        ? ("source" as const)
        : ("superseded" as const);
    const postingLabel = incomePosting
      ? incomePostingLabel(upload, incomePosting, automaticIncome?.id ?? null)
      : balancePosting
        ? balancePostingLabel(balancePosting, upload.id === automaticBalance?.id && !balanceSaved)
        : null;
    return {
      id: upload.id,
      filename: upload.filename,
      classification: upload.classification,
      byteSize: upload.byteSize,
      createdAt: upload.createdAt.toISOString(),
      lines: lines.map((line) => ({
        ...line,
        signedCents: line.signedCents,
      })),
      unmapped: unmappedLabels(lines),
      note: meta.note,
      blocksPosting: meta.blocksPosting,
      incomePosting,
      balancePosting,
      postingLabel,
    };
  });
  const signIds = [
    period?.preparedByUserId,
    period?.reviewedByUserId,
    ...(period?.checklist ?? []).flatMap((item) => [item.preparedByUserId, item.reviewedByUserId]),
    ...events.map((event) => event.actorUserId),
    ...(period?.closeEvents ?? []).map((event) => event.actorUserId),
  ].filter((id): id is string => Boolean(id));
  const signUsers = signIds.length
    ? await prisma.appUser.findMany({ where: { id: { in: [...new Set(signIds)] } } })
    : [];
  const signName = (id: string | null | undefined) => {
    if (!id) return null;
    const user = signUsers.find((row) => row.id === id);
    return user?.name || user?.email || id;
  };
  return {
    periodStatus: (period?.status ?? "OPEN") as PeriodCloseStatus,
    defaultIncomeUploadId: effectiveIncome?.id ?? null,
    automaticIncomeUploadId: automaticIncome?.id ?? null,
    savedIncomeUploadId,
    incomeSourceSummary: incomeSourceSummary(effectiveIncome, incomeSaved),
    newerIncomeNotice: newerIncome ? newerFileNotice("income", newerIncome.filename) : null,
    missingIncomeNotice: incomeMissing ? MISSING_INCOME_SOURCE_MESSAGE : null,
    defaultBalanceUploadId: effectiveBalance?.id ?? null,
    automaticBalanceUploadId: automaticBalance?.id ?? null,
    savedBalanceUploadId,
    balanceSourceSummary: balanceSourceSummary(effectiveBalance, balanceSaved),
    newerBalanceNotice: newerBalance ? newerBalanceNotice(newerBalance.filename) : null,
    missingBalanceNotice: balanceMissing ? MISSING_BALANCE_SOURCE_MESSAGE : null,
    uploads: fileViews,
    signOff: {
      preparedBy: signName(period?.preparedByUserId),
      preparedAt: period?.preparedAt?.toISOString() ?? null,
      reviewedBy: signName(period?.reviewedByUserId),
      reviewedAt: period?.reviewedAt?.toISOString() ?? null,
      ownerSelfApproveReason: period?.ownerSelfApproveReason ?? null,
      items: (period?.checklist ?? []).map((item) => ({
        code: item.code,
        label: item.label,
        preparedBy: signName(item.preparedByUserId),
        preparedAt: item.preparedAt?.toISOString() ?? null,
        reviewedBy: signName(item.reviewedByUserId),
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
        ownerSelfApproveReason: item.ownerSelfApproveReason ?? null,
      })),
    },
    events: [
      ...events.map((event) => ({
        at: event.createdAt.toISOString(),
        action: event.action,
        detail: event.detail,
        actor: signName(event.actorUserId),
      })),
      ...(period?.closeEvents ?? []).map((event) => ({
        at: event.createdAt.toISOString(),
        action: event.action,
        detail: [event.reason, event.ticket].filter(Boolean).join(" · "),
        actor: signName(event.actorUserId),
      })),
    ],
    tieOuts,
    summary,
    suspense: fileViews.reduce((acc, file) => acc + file.unmapped.length, 0),
    tolerances: toleranceRows.map((row) => ({
      key: row.key,
      cents: row.cents?.toString() ?? null,
      bps: row.bps,
      days: row.days,
    })),
  };
}

export async function setTieOutTolerance(opts: {
  entityId: string;
  key: string;
  cents?: bigint | null;
  bps?: number | null;
  days?: number | null;
  year?: number;
  month?: number;
}) {
  const key = opts.key.trim();
  if (!key) throw new Error("Name the tie-out tolerance.");
  if (!(TIE_OUT_TOLERANCE_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown tie-out key "${key}". Use ${TIE_OUT_TOLERANCE_KEYS.join(", ")}.`);
  }
  await prisma.tieOutTolerance.upsert({
    where: { entityId_key: { entityId: opts.entityId, key } },
    update: { cents: opts.cents ?? null, bps: opts.bps ?? null, days: opts.days ?? null },
    create: {
      entityId: opts.entityId,
      key,
      cents: opts.cents ?? null,
      bps: opts.bps ?? null,
      days: opts.days ?? null,
    },
  });
  await logMonthEnd({
    entityId: opts.entityId,
    year: opts.year ?? 0,
    month: opts.month ?? 0,
    action: "TOLERANCE",
    detail: `${key} · cents ${opts.cents ?? "—"} · bps ${opts.bps ?? "—"} · days ${opts.days ?? "—"}`,
  });
}

const MIRROR_CODES = new Set(["1310", "2310", "6310", "7010"]);
const BELOW_NOI_CODES = new Set(["6110", "6120", "6210", "6220", "6310", "6410", "7010"]);

type ReversibleJournal = {
  id: string;
  memo: string;
  source: string;
  reversesJournalId: string | null;
  lines: {
    debit: bigint;
    credit: bigint;
    memo: string | null;
    account: { code: string; type: string };
  }[];
};

export type OperatingReversalPreview = {
  journalId: string;
  memo: string;
  source: string;
  /** Sum of the absolute above-NOI line amounts. Full and partial journals use this same figure. */
  amountCents: bigint;
  partial: boolean;
  /** Above-NOI lines share a journal with an OpCo mirror code. Do not reverse it automatically. */
  needsManualSplit: boolean;
};

type PlannedReversal = OperatingReversalPreview & {
  lines: { accountCode: string; debit: bigint; credit: bigint; memo: string }[];
};

function isAboveNoiLine(line: ReversibleJournal["lines"][number]): boolean {
  if (MIRROR_CODES.has(line.account.code) || BELOW_NOI_CODES.has(line.account.code)) return false;
  if (line.account.type !== "REVENUE" && line.account.type !== "EXPENSE") return false;
  return /^[45]\d{3}$/.test(line.account.code);
}

/** Absolute amount of one journal line (debit or credit, not both added together). */
function lineAmountCents(line: { debit: bigint; credit: bigint }): bigint {
  const net = line.debit - line.credit;
  return net < 0n ? -net : net;
}

/** One amount for every preview row: the above-NOI activity that would be reversed. */
function aboveNoiAmountCents(lines: { debit: bigint; credit: bigint }[]): bigint {
  return lines.reduce((acc, line) => acc + lineAmountCents(line), 0n);
}

function planOperatingReversal(journal: ReversibleJournal, reversedIds: Set<string>): PlannedReversal | null {
  if (journal.reversesJournalId || reversedIds.has(journal.id) || journal.source.startsWith("month_end_")) return null;
  const above = journal.lines.filter(isAboveNoiLine);
  if (journal.lines.some((line) => MIRROR_CODES.has(line.account.code))) {
    if (!above.length) return null;
    return {
      journalId: journal.id,
      memo: journal.memo,
      source: journal.source,
      amountCents: aboveNoiAmountCents(above),
      partial: false,
      needsManualSplit: true,
      lines: [],
    };
  }
  if (!above.length) return null;
  const otherPnl = journal.lines.some(
    (line) =>
      (line.account.type === "REVENUE" || line.account.type === "EXPENSE") && !isAboveNoiLine(line),
  );
  if (!otherPnl) {
    return {
      journalId: journal.id,
      memo: journal.memo,
      source: journal.source,
      amountCents: aboveNoiAmountCents(above),
      partial: false,
      needsManualSplit: false,
      lines: journal.lines.map((line) => ({
        accountCode: line.account.code,
        debit: line.credit,
        credit: line.debit,
        memo: `Reversal: ${line.memo ?? journal.memo}`,
      })),
    };
  }
  const lines = above.map((line) => ({
    accountCode: line.account.code,
    debit: line.credit,
    credit: line.debit,
    memo: `Reversal: ${line.memo ?? journal.memo}`,
  }));
  const imbalance = lines.reduce((acc, line) => acc + line.debit - line.credit, 0n);
  if (imbalance !== 0n) {
    const plug =
      journal.lines
        .filter((line) => line.account.type !== "REVENUE" && line.account.type !== "EXPENSE" && !MIRROR_CODES.has(line.account.code))
        .sort((a, b) => {
          const left = b.debit + b.credit;
          const right = a.debit + a.credit;
          return left > right ? 1 : left < right ? -1 : 0;
        })[0]?.account.code ?? "1999";
    if (imbalance > 0n) lines.push({ accountCode: plug, debit: 0n, credit: imbalance, memo: `Reversal balance: ${journal.memo}` });
    else lines.push({ accountCode: plug, debit: -imbalance, credit: 0n, memo: `Reversal balance: ${journal.memo}` });
  }
  return {
    journalId: journal.id,
    memo: journal.memo,
    source: journal.source,
    amountCents: aboveNoiAmountCents(above),
    partial: true,
    needsManualSplit: false,
    lines,
  };
}

async function plannedOperatingReversals(entityId: string, year: number, month: number): Promise<{
  periodId: string;
  status: string;
  plans: PlannedReversal[];
} | null> {
  const period = await prisma.period.findUnique({ where: { entityId_year_month: { entityId, year, month } } });
  if (!period) return null;
  const existing = await prisma.journal.findMany({
    where: { entityId, periodId: period.id, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const reversedIds = new Set(existing.map((row) => row.reversesJournalId).filter((id): id is string => Boolean(id)));
  return {
    periodId: period.id,
    status: period.status,
    plans: existing.flatMap((journal) => {
      const plan = planOperatingReversal(journal, reversedIds);
      return plan ? [plan] : [];
    }),
  };
}

/** Journals whose above-NOI lines would be reversed. Interest, depreciation, amortization, and OpCo mirrors stay. */
export async function previewOperatingReversals(opts: {
  entityId: string;
  year: number;
  month: number;
}): Promise<OperatingReversalPreview[]> {
  const planned = await plannedOperatingReversals(opts.entityId, opts.year, opts.month);
  return (planned?.plans ?? []).map(({ lines: _lines, ...preview }) => preview);
}

/** Reverse posted above-NOI journals that would make a month-end package count NOI twice. */
export async function reverseOperatingJournals(opts: {
  entityId: string;
  year: number;
  month: number;
  reason: string;
  controllerOverride?: boolean | string;
}) {
  const reason = opts.reason.trim();
  if (!reason) throw new Error("A reason is required to reverse operating journals.");
  const period = await openPeriod(opts.entityId, opts.year, opts.month);
  if (period.status === "CLOSED") {
    throw new PeriodLockedError("Closed months are not overwritten. Reopen with a reason and a ticket.");
  }
  const overrideReason = softCloseOverrideReason(period.status, opts);
  const planned = await plannedOperatingReversals(opts.entityId, opts.year, opts.month);
  const blocking = planned?.plans ?? [];
  const actionable = blocking.filter((journal) => !journal.needsManualSplit);
  if (!actionable.length) {
    if (blocking.some((journal) => journal.needsManualSplit)) {
      throw new Error(
        "A journal mixes above-NOI accounts with an OpCo mirror (1310, 2310, 6310, or 7010) and needs a manual split. It was not reversed.",
      );
    }
    throw new Error("No above-NOI operating journals are blocking this month.");
  }
  if (overrideReason) await logControllerOverride(opts.entityId, opts.year, opts.month, overrideReason);
  for (const journal of actionable) {
    await postJournal({
      entityId: opts.entityId,
      periodId: period.id,
      date: new Date(`${periodEndIso(opts.year, opts.month)}T16:00:00.000Z`),
      memo: journal.partial ? `Reversal of above-NOI lines in ${journal.memo}` : `Reversal of ${journal.memo}`,
      source: "operating_reversal",
      reversesJournalId: journal.journalId,
      allowControllerAdjustment: overrideReason != null,
      lines: journal.lines,
    });
  }
  await logMonthEnd({
    entityId: opts.entityId,
    year: opts.year,
    month: opts.month,
    action: "REVERSE_OPERATING",
    detail: `${reason} · ${actionable.length} above-NOI journal(s)`,
  });
  await clearReviewerSignOff(period.id);
  return {
    reversed: actionable.length,
    journals: actionable.map(({ lines: _lines, ...preview }) => preview),
  };
}

export async function transitionClose(opts: {
  entityId: string;
  year: number;
  month: number;
  action: "soft" | "hard" | "reopen";
  reason?: string;
  ticket?: string;
}) {
  const period = await openPeriod(opts.entityId, opts.year, opts.month);
  if (opts.action === "soft") {
    await softClosePeriod(period.id);
    return;
  }
  if (opts.action === "reopen") {
    await reopenPeriod({ periodId: period.id, reason: opts.reason ?? "", ticket: opts.ticket ?? "" });
    return;
  }
  const workspace = await loadCloseWorkspace(opts.entityId, opts.year, opts.month);
  if (workspace.uploads.some((file) => file.unmapped.length > 0) || workspace.suspense > 0) {
    throw new Error("Unmapped lines are in suspense. Map every line before a hard lock.");
  }
  assertTieOutsAllowLock(workspace.tieOuts);
  await hardLockPeriod(period.id);
}

function textField(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Boolean true and the text values true / yes / y / 1 / mtm count as month-to-month. */
export function readMtmFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === "number") return value === 1;
  const text = String(value).trim().toLowerCase();
  return text === "true" || text === "yes" || text === "y" || text === "1" || text === "mtm";
}

function snapshotToLease(payloadJson: string, unitCode: string): LeaseUnit {
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;
  return {
    unitCode,
    status: (textField(payload.unit_status) as LeaseUnit["status"]) || "OCCUPIED",
    marketRentCents: BigInt(textField(payload.market_rent) || "0"),
    leaseRentCents: BigInt(textField(payload.lease_rent) || "0"),
    leaseStart: textField(payload.lease_start) || null,
    leaseEnd: textField(payload.lease_end) || null,
    moveIn: textField(payload.move_in_date) || null,
    moveOut: textField(payload.move_out_date) || null,
    mtm: readMtmFlag(payload.mtm_flag),
    balanceCents: BigInt(textField(payload.balance_total) || "0"),
    depositCents: BigInt(textField(payload.security_deposit_held) || "0"),
    concessionCents: BigInt(textField(payload.concession_amount) || "0"),
    substatus: textField(payload.unit_substatus),
  };
}
