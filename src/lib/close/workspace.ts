import { createHash } from "node:crypto";
import { isArchivedSpe } from "@/lib/archive";
import { ensureMasterCoaCurrent } from "@/lib/entities";
import { openPeriod } from "@/lib/deals/periods";
import { parseRentRollSource } from "@/lib/deals/workbook";
import { hardLockPeriod, reopenPeriod, softClosePeriod } from "@/lib/period-close";
import { assertTieOutsAllowLock } from "@/lib/close/guards";
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
  rentRollGpr,
  rentRollNonRevenue,
  rentRollVacancyLoss,
  signedLossToLease,
  runRentRollTieOuts,
  leaseExpirationSummary,
  leaseMasterRecord,
  type CanonicalUnit,
  type LeaseUnit,
  type TieOut,
  type TieTolerance,
} from "@rcp/properties";
import {
  applyRememberedMaps,
  classifyCloseFile,
  parseCloseFile,
  type CloseFileClass,
  type ParsedCloseLine,
} from "./parse-file";

export function isLiveRentRollMonth(year: number, month: number, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const liveYear = Number(parts.find((part) => part.type === "year")?.value);
  const liveMonth = Number(parts.find((part) => part.type === "month")?.value);
  return liveYear === year && liveMonth === month;
}

function periodEndIso(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function rememberedMaps(entityId: string) {
  return prisma.vendorAccountMap.findMany({ where: { entityId } });
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
  await prisma.vendorAccountMap.upsert({
    where: {
      entityId_sourceSystem_sourceAccountNo_normalizedLabel: {
        entityId: opts.entityId,
        sourceSystem: opts.sourceSystem,
        sourceAccountNo: opts.sourceAccountNo,
        normalizedLabel,
      },
    },
    update: { accountCode: opts.accountCode },
    create: {
      entityId: opts.entityId,
      sourceSystem: opts.sourceSystem,
      sourceAccountNo: opts.sourceAccountNo,
      normalizedLabel,
      accountCode: opts.accountCode,
    },
  });
  await prisma.monthEndEvent.create({
    data: {
      entityId: opts.entityId,
      year: opts.year ?? 0,
      month: opts.month ?? 0,
      action: "MAP",
      detail: `${opts.label} → ${opts.accountCode}`,
    },
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
    if (isLiveRentRollMonth(opts.year, opts.month)) {
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
  await prisma.monthEndEvent.create({
    data: {
      entityId: opts.entityId,
      year: opts.year,
      month: opts.month,
      action: "UPLOAD",
      detail: `${opts.filename} · ${classification} · ${lines.length} lines · ${rentRollUnits || "no"} rent-roll units`,
    },
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

export async function postCloseToBooks(opts: { entityId: string; year: number; month: number }) {
  await ensureMasterCoaCurrent();
  const period = await openPeriod(opts.entityId, opts.year, opts.month);
  if (period.status === "CLOSED") {
    throw new PeriodLockedError("Closed months are not overwritten. Reopen with a reason and a ticket.");
  }
  const uploads = await prisma.monthEndUpload.findMany({
    where: { entityId: opts.entityId, year: opts.year, month: opts.month },
    orderBy: { createdAt: "asc" },
  });
  const maps = await rememberedMaps(opts.entityId);
  const income: ImportAmount[] = [];
  const balanceDesired = new Map<string, bigint>();
  for (const upload of uploads) {
    const kind = upload.classification as CloseFileClass;
    if (kind === "rent_roll" || (kind === "pdf" && linesFromUpload(upload.parsedJson).length === 0)) continue;
    const control = uploadControl(upload.parsedJson);
    if (control?.blocksPosting) throw new Error(control.detail || "Import control totals do not tie. Posting is blocked.");
    const lines = applyRememberedMaps(linesFromUpload(upload.parsedJson), maps);
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
      } else {
        income.push({ accountCode: code, signedCents: signed, memo: line.sourceLabel });
      }
    }
  }
  const existing = await prisma.journal.findMany({
    where: { entityId: opts.entityId, periodId: period.id, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const foreignPnl = existing.filter(
    (journal) =>
      !journal.source.startsWith("month_end_") &&
      journal.lines.some((line) => line.account.type === "REVENUE" || line.account.type === "EXPENSE"),
  );
  if (foreignPnl.length > 0) {
    throw new Error(
      `This month already has ${foreignPnl.length} operating journal(s). Posting the package would count NOI twice. Reverse those journals before posting the close.`,
    );
  }
  if (period.status === "SOFT_CLOSED") {
    for (const journal of existing.filter((row) => row.source === "month_end_is" || row.source === "month_end_bs")) {
      await postJournal({
        entityId: opts.entityId,
        periodId: period.id,
        date: new Date(`${periodEndIso(opts.year, opts.month)}T16:00:00.000Z`),
        memo: `Reversal of ${journal.memo}`,
        source: `${journal.source}_reversal`,
        allowControllerAdjustment: true,
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
      where: { entityId: opts.entityId, periodId: period.id, source: { in: ["month_end_is", "month_end_bs"] } },
    });
  }
  const date = new Date(`${periodEndIso(opts.year, opts.month)}T16:00:00.000Z`);
  const controller = period.status === "SOFT_CLOSED";
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
  await prisma.monthEndEvent.create({
    data: {
      entityId: opts.entityId,
      year: opts.year,
      month: opts.month,
      action: "POST",
      detail: `Posted ${income.length} income lines and ${balanceDesired.size} balance-sheet lines`,
    },
  });
}

export async function loadCloseWorkspace(entityId: string, year: number, month: number) {
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId, year, month } },
    include: { closeEvents: { orderBy: { createdAt: "asc" } } },
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
  const signedLtlCents = fromSnapshot
    ? leaseUnits
        .filter((unit) => unit.status === "OCCUPIED")
        .reduce((acc, unit) => acc + (unit.marketRentCents - unit.leaseRentCents), 0n)
    : signedLossToLease(live);
  const toleranceRows = await prisma.tieOutTolerance.findMany({ where: { entityId } });
  const tolerances: Partial<Record<string, TieTolerance>> = {};
  for (const row of toleranceRows) {
    tolerances[row.key] = {
      ...(row.cents != null ? { cents: row.cents } : {}),
      ...(row.bps != null ? { bps: row.bps } : {}),
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
      .filter((unit) => unit.status === "OCCUPIED")
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
  const fileViews = uploads.map((upload) => {
    const lines = applyRememberedMaps(linesFromUpload(upload.parsedJson), maps);
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
    };
  });
  return {
    periodStatus: (period?.status ?? "OPEN") as PeriodCloseStatus,
    uploads: fileViews,
    events: [
      ...events.map((event) => ({ at: event.createdAt.toISOString(), action: event.action, detail: event.detail })),
      ...(period?.closeEvents ?? []).map((event) => ({
        at: event.createdAt.toISOString(),
        action: event.action,
        detail: [event.reason, event.ticket].filter(Boolean).join(" · "),
      })),
    ],
    tieOuts,
    summary,
    suspense: fileViews.reduce((acc, file) => acc + file.unmapped.length, 0),
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

function snapshotToLease(payloadJson: string, unitCode: string): LeaseUnit {
  const payload = JSON.parse(payloadJson) as Record<string, string>;
  return {
    unitCode,
    status: (payload.unit_status as LeaseUnit["status"]) || "OCCUPIED",
    marketRentCents: BigInt(payload.market_rent || "0"),
    leaseRentCents: BigInt(payload.lease_rent || "0"),
    leaseStart: payload.lease_start || null,
    leaseEnd: payload.lease_end || null,
    moveIn: payload.move_in_date || null,
    moveOut: payload.move_out_date || null,
    mtm: payload.mtm_flag === "true",
    balanceCents: BigInt(payload.balance_total || "0"),
    depositCents: BigInt(payload.security_deposit_held || "0"),
    concessionCents: BigInt(payload.concession_amount || "0"),
    substatus: payload.unit_substatus,
  };
}
