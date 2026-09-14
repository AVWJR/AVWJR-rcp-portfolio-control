import { CsvParseError, parseUsdToCents } from "../csv-parse";
import {
  classifyChargeCode,
  emptyRentRollMeta,
  finalizeUnitCharges,
  inferBedsFromUnitType,
  mergeExtras,
  type CanonicalCharge,
  type CanonicalUnit,
  type DialectDetectHit,
  type DialectParseOpts,
  type NormalizedRentRoll,
} from "../rent-roll-canonical";
import {
  couldNotMapColumnsMessage,
  looksLikeUnitCode,
  mergeHeaderRows,
  normalizeHeader,
  parseBrokerDate,
  parseRentRollStatus,
} from "../rent-roll-map";
import type { UnitStatus } from "../types";

const CHARGE_CODE_RE = /^(?:[A-Za-z]{1,4}-[A-Za-z0-9]{2,}|rent|laundry|cable|trash|parking|petrent)$/i;

const FIELD_ALIASES: Record<string, string[]> = {
  unit: ["unit id", "unit number", "unit no", "unit #", "unit", "apt"],
  unitType: ["unit type", "unit design", "floorplan", "floor plan", "plan"],
  sqft: ["unit sq ft", "unit sf", "square feet", "sq ft", "sqft", "sf"],
  residentId: ["resident id", "tenant id", "resident code"],
  residentName: ["resident name", "tenant name", "name"],
  resident: ["resident", "tenant"],
  market: ["market rent", "market", "mkt rent", "mkt"],
  chargeCode: ["charge code", "chg code"],
  amount: ["charge amount", "charge amt", "amount"],
  residentDeposit: ["resident deposit", "sec deposit", "security deposit"],
  otherDeposit: ["other deposit"],
  deposit: ["deposit"],
  moveIn: ["move in date", "move in", "move-in", "lease start", "lease from"],
  leaseExpiration: ["lease expiration", "lease expire", "lease end", "lease to", "expiration"],
  moveOut: ["move out date", "move out", "move-out"],
  balance: ["balance", "amt balance", "ar balance"],
};

type ColMap = Partial<Record<keyof typeof FIELD_ALIASES, number>>;

function aliasHits(normalized: string, aliases: string[]): boolean {
  return aliases.some((alias) => normalized === alias || normalized.replace(/\s+/g, "") === alias.replace(/\s+/g, ""));
}

function mapLeaseChargeHeaders(headers: string[]): { map: ColMap; used: Set<number> } {
  const normalized = headers.map(normalizeHeader);
  const map: ColMap = {};
  const used = new Set<number>();
  const assign = (field: keyof typeof FIELD_ALIASES) => {
    const aliases = FIELD_ALIASES[field]!;
    let best = -1;
    let bestLen = -1;
    for (let i = 0; i < normalized.length; i += 1) {
      if (used.has(i) || !normalized[i]) continue;
      if (aliasHits(normalized[i]!, aliases)) {
        const len = normalized[i]!.length;
        if (len > bestLen) {
          best = i;
          bestLen = len;
        }
      }
    }
    if (best >= 0) {
      map[field] = best;
      used.add(best);
    }
  };

  (
    [
      "unitType",
      "sqft",
      "residentId",
      "residentName",
      "residentDeposit",
      "otherDeposit",
      "chargeCode",
      "leaseExpiration",
      "moveOut",
      "moveIn",
      "market",
      "amount",
      "balance",
      "deposit",
      "resident",
      "unit",
    ] as Array<keyof typeof FIELD_ALIASES>
  ).forEach(assign);

  if (map.residentId == null && map.resident != null) map.residentId = map.resident;
  if (map.residentName == null && map.resident != null && map.residentId !== map.resident) {
    map.residentName = map.resident;
  }
  if (map.residentDeposit == null && map.deposit != null) map.residentDeposit = map.deposit;
  return { map, used };
}

function cell(row: string[], index: number | undefined): string {
  if (index == null) return "";
  return (row[index] ?? "").trim();
}

function mergeLeaseHeaders(top: string[], bot: string[]): string[] {
  const len = Math.max(top.length, bot.length);
  return Array.from({ length: len }, (_, i) => {
    const a = (top[i] ?? "").trim();
    const b = (bot[i] ?? "").trim();
    if (!b) return a;
    if (!a) return b;
    if (normalizeHeader(a) === normalizeHeader(b)) return b;
    return `${a} ${b}`.replace(/\s+/g, " ").trim();
  });
}

function hasChargeCodeHeader(headers: string[]): boolean {
  return headers.some((h) => {
    const n = normalizeHeader(h);
    return n === "charge code" || n === "chg code" || n === "chargecode";
  });
}

function hasUnitHeader(headers: string[]): boolean {
  return headers.some((h) => {
    const n = normalizeHeader(h);
    return n === "unit" || n === "unit id" || n === "unit number" || n === "unit no";
  });
}

function looksLikeChargeCode(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return CHARGE_CODE_RE.test(v);
}

function looksLikeTotalRow(row: string[], map: ColMap): boolean {
  const charge = cell(row, map.chargeCode).toLowerCase();
  if (charge === "total" || charge === "subtotal") return true;
  const filled = row.map((c) => c.trim()).filter(Boolean);
  if (!filled.length) return false;
  const first = filled[0]!.toLowerCase();
  if (first === "total" || first === "grand total" || first === "subtotal") return true;
  return filled.some((v) => /^total$/i.test(v)) && !cell(row, map.unit);
}

function looksLikeSectionHeader(row: string[]): boolean {
  const filled = row.map((c) => c.trim()).filter(Boolean);
  if (filled.length === 0 || filled.length > 3) return false;
  const text = filled.join(" ").toLowerCase();
  if (/current|notice|vacant|occupied|down|model|resident/.test(text) && !looksLikeUnitCode(filled[0] ?? "")) {
    return true;
  }
  return false;
}

function looksLikeHeaderRepeat(row: string[]): boolean {
  const hay = row.map((c) => normalizeHeader(c)).join(" ");
  return /\bunit\b/.test(hay) && /(\bcharge code\b|\bmarket\b|\bamount\b)/.test(hay);
}

function parseCents(raw: string, line: number, field: string, lenient: boolean): bigint {
  try {
    return parseUsdToCents(raw || "0", line, field);
  } catch (error) {
    if (lenient) return 0n;
    throw error;
  }
}

export function findLeaseChargesHeader(rows: string[][]): {
  index: number;
  headers: string[];
  dataStart: number;
} | null {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const single = rows[i] ?? [];
    if (hasUnitHeader(single) && hasChargeCodeHeader(single)) {
      return { index: i, headers: single, dataStart: i + 1 };
    }
    const next = rows[i + 1];
    if (!next) continue;
    const merged = mergeLeaseHeaders(single, next);
    if (hasUnitHeader(merged) && hasChargeCodeHeader(merged)) {
      return { index: i, headers: merged, dataStart: i + 2 };
    }
    // Fallback: generic merge still yields Charge Code.
    const generic = mergeHeaderRows(single, next);
    if (hasUnitHeader(generic) && hasChargeCodeHeader(generic)) {
      return { index: i, headers: generic, dataStart: i + 2 };
    }
  }
  return null;
}

export type LeaseChargeSignals = {
  titleLeaseCharges: boolean;
  hasChargeCode: boolean;
  nestedChargeHits: number;
  totalRows: number;
  metaHits: boolean;
};

export function leaseChargeSignals(rows: string[][]): LeaseChargeSignals {
  const head = rows.slice(0, 25);
  const hay = head.flat().join(" ").toLowerCase();
  const found = findLeaseChargesHeader(rows);
  const headers = found?.headers ?? [];
  const { map } = mapLeaseChargeHeaders(headers);
  const body = found ? rows.slice(found.dataStart) : rows;
  let nestedChargeHits = 0;
  let totalRows = 0;
  let lastHadUnit = false;
  for (const row of body.slice(0, 80)) {
    const unit = cell(row, map.unit) || (row[0] ?? "").trim();
    const charge = cell(row, map.chargeCode) || row.find((c) => looksLikeChargeCode(c)) || "";
    if (looksLikeTotalRow(row, map)) totalRows += 1;
    if (!unit && looksLikeChargeCode(charge) && lastHadUnit) nestedChargeHits += 1;
    if (unit && looksLikeUnitCode(unit)) lastHadUnit = true;
    else if (!unit && looksLikeChargeCode(charge)) {
      /* keep lastHadUnit */
    } else if (unit) lastHadUnit = looksLikeUnitCode(unit);
  }
  return {
    titleLeaseCharges: /rent roll with lease charges|lease charges/.test(hay),
    hasChargeCode: hasChargeCodeHeader(headers) || /charge code/.test(hay),
    nestedChargeHits,
    totalRows,
    metaHits: /as of|property name|transaction date/.test(hay),
  };
}

export function scoreYardiLeaseCharges(rows: string[][]): DialectDetectHit | null {
  const signals = leaseChargeSignals(rows);
  if (!signals.hasChargeCode && signals.nestedChargeHits < 2) return null;
  let score = 0;
  const reasons: string[] = [];
  if (signals.hasChargeCode) {
    score += 18;
    reasons.push("charge_code");
  }
  if (signals.nestedChargeHits >= 2) {
    score += 16;
    reasons.push(`nested_charges:${signals.nestedChargeHits}`);
  }
  if (signals.totalRows >= 1) {
    score += 6;
    reasons.push("unit_totals");
  }
  if (signals.titleLeaseCharges) {
    score += 8;
    reasons.push("title");
  }
  if (signals.metaHits) {
    score += 4;
    reasons.push("meta");
  }
  if (score < 18) return null;
  return { dialect: "yardi_lease_charges", score, reason: reasons.join(",") };
}

function parseMetaLabelRows(
  rows: string[][],
  headerIndex: number,
  meta: NormalizedRentRoll["meta"],
  unmapped: NormalizedRentRoll["unmapped"],
): void {
  for (let i = 0; i < headerIndex; i += 1) {
    const row = rows[i] ?? [];
    const text = row.map((c) => c.trim()).filter(Boolean).join(" ").trim();
    if (!text) continue;
    const asOf = text.match(/as\s*of\s*[=:]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i);
    const txn = text.match(/transaction\s*date\s*[=:]?\s*([0-9]{1,2}[./-][0-9]{2,4}[./-][0-9]{2,4})/i);
    const property = text.match(/property\s*(?:name|code)?\s*[=:]?\s*(.+)$/i);
    const monthYear = text.match(/month\s*\/?\s*year\s*[=:]?\s*(.+)$/i);
    if (/rent roll/i.test(text) && !meta.reportTitle) {
      meta.reportTitle = text;
      continue;
    }
    if (asOf) {
      const parsed = parseBrokerDate(asOf[1]!, i + 1, "as_of", true);
      meta.asOfDate = parsed ? parsed.toISOString().slice(0, 10) : asOf[1]!;
      continue;
    }
    if (txn) {
      const parsed = parseBrokerDate(txn[1]!, i + 1, "transaction_date", true);
      meta.transactionDate = parsed ? parsed.toISOString().slice(0, 10) : txn[1]!;
      continue;
    }
    if (property && !/^property name$/i.test(property[1]!.trim())) {
      meta.propertyName = property[1]!.trim();
      continue;
    }
    if (monthYear) {
      meta.monthYear = monthYear[1]!.trim();
      continue;
    }
    meta.extras[`source_row_${i + 1}`] = text;
    unmapped.push({ row: i + 1, value: text, reason: "metadata_row" });
  }
}

function inferStatus(opts: {
  section: string | null;
  residentId: string;
  residentName: string;
  inPlace: bigint;
}): UnitStatus {
  const fromResident = parseRentRollStatus(opts.residentName) ?? parseRentRollStatus(opts.residentId);
  if (fromResident) return fromResident;
  if (/^(vacant|vac|empty|n\/a|-)$/i.test(opts.residentName) || /^(vacant|vac)$/i.test(opts.residentId)) {
    return "VACANT";
  }
  const section = (opts.section ?? "").toLowerCase();
  const mixedSection = /current/.test(section) && /vacant/.test(section);
  if (/\b(down|model|admin|offline)\b/.test(`${section} ${opts.residentName} ${opts.residentId}`)) return "DOWN";
  if (!mixedSection && /^vacant\b|vacant residents/.test(section) && !opts.residentName && !opts.residentId) {
    return "VACANT";
  }
  if (opts.residentName || opts.residentId || opts.inPlace > 0n) return "OCCUPIED";
  if (!mixedSection && /vacant/.test(section)) return "VACANT";
  return "VACANT";
}

function unusedCells(
  row: string[],
  headers: string[],
  used: Set<number>,
): Record<string, string> {
  const extras: Record<string, string> = {};
  row.forEach((raw, i) => {
    const value = (raw ?? "").trim();
    if (!value || used.has(i)) return;
    const header = (headers[i] ?? "").trim() || `col_${i + 1}`;
    extras[header] = extras[header] ? `${extras[header]} | ${value}` : value;
  });
  return extras;
}

export function parseYardiLeaseCharges(rows: string[][], opts: DialectParseOpts = {}): NormalizedRentRoll {
  const found = findLeaseChargesHeader(rows);
  if (!found) {
    throw new CsvParseError(1, couldNotMapColumnsMessage((rows[0] ?? []).filter(Boolean), ["unit", "charge code"]));
  }
  const { map, used: mappedCols } = mapLeaseChargeHeaders(found.headers);
  if (map.unit == null) {
    throw new CsvParseError(found.index + 1, couldNotMapColumnsMessage(found.headers.filter(Boolean), ["unit"]));
  }

  const lenient = opts.lenient ?? true;
  const meta = emptyRentRollMeta("yardi_lease_charges", opts);
  meta.headerRows = [found.headers];
  const unmapped: NormalizedRentRoll["unmapped"] = [];
  const warnings: string[] = [];
  parseMetaLabelRows(rows, found.index, meta, unmapped);
  if (!meta.monthYear && meta.asOfDate) {
    const d = new Date(`${meta.asOfDate}T16:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) {
      meta.monthYear = d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    }
  }

  const units: CanonicalUnit[] = [];
  const byCode = new Map<string, CanonicalUnit>();
  let current: CanonicalUnit | null = null;
  let section: string | null = null;

  const flush = () => {
    if (!current) return;
    finalizeUnitCharges(current);
    if (current.reportedTotalCents != null) {
      const sum = current.charges.reduce((acc, c) => acc + c.amountCents, 0n);
      if (sum !== current.reportedTotalCents) {
        warnings.push(
          `${current.unitCode}: charge lines sum ${sum} cents vs Total ${current.reportedTotalCents} cents`,
        );
      }
    }
    current = null;
  };

  rows.slice(found.dataStart).forEach((row, offset) => {
    const line = found.dataStart + offset + 1;
    const nonempty = row.some((c) => (c ?? "").trim());
    if (!nonempty) return;
    if (looksLikeHeaderRepeat(row)) return;
    if (looksLikeSectionHeader(row)) {
      const maybeUnit = cell(row, map.unit) || (row[0] ?? "").trim();
      if (!maybeUnit || !looksLikeUnitCode(maybeUnit)) {
        flush();
        section = row.map((c) => c.trim()).filter(Boolean).join(" ");
        return;
      }
    }

    const rawUnit = cell(row, map.unit);
    const chargeCode = cell(row, map.chargeCode);
    const isTotal = looksLikeTotalRow(row, map);

    if (isTotal && current) {
      const amountRaw = cell(row, map.amount) || row.map((c) => c.trim()).filter((c) => /^-?[\d,.]+$/.test(c)).at(-1) || "";
      current.reportedTotalCents = parseCents(amountRaw, line, "total", true);
      current.sourceRows.push(line);
      const leftover = unusedCells(row, found.headers, new Set([...mappedCols, map.chargeCode ?? -1, map.amount ?? -1]));
      mergeExtras(current.extras, leftover);
      Object.entries(leftover).forEach(([header, value]) => {
        unmapped.push({ row: line, header, value, reason: "total_row_extra" });
      });
      flush();
      return;
    }

    const startingUnit = Boolean(
      rawUnit &&
        !/^total$/i.test(rawUnit) &&
        !looksLikeHeaderRepeat([rawUnit]) &&
        (looksLikeUnitCode(rawUnit) || !looksLikeSectionHeader(row)),
    );
    if (startingUnit) {
      flush();
      const residentId = cell(row, map.residentId);
      const residentName = cell(row, map.residentName) || (!map.residentName ? cell(row, map.resident) : "");
      const market = parseCents(cell(row, map.market), line, "market", lenient);
      const amount = parseCents(cell(row, map.amount), line, "amount", lenient);
      const unitType = cell(row, map.unitType);
      const sqftRaw = cell(row, map.sqft);
      const extras = unusedCells(row, found.headers, mappedCols);
      const status = inferStatus({
        section,
        residentId,
        residentName,
        inPlace: amount,
      });
      const unit: CanonicalUnit = {
        unitCode: rawUnit,
        unitType,
        beds: inferBedsFromUnitType(unitType),
        bathsTenths: 0,
        sqft: sqftRaw ? Number(sqftRaw.replace(/[, ]/g, "")) || 0 : 0,
        status,
        section,
        residentId: residentName && residentId === residentName ? "" : residentId,
        residentName: residentName || (residentId && !/^\d+$/.test(residentId) ? residentId : ""),
        marketRentCents: market,
        inPlaceRentCents: 0n,
        otherChargesCents: 0n,
        concessionCents: 0n,
        residentDepositCents: parseCents(cell(row, map.residentDeposit), line, "resident_deposit", true),
        otherDepositCents: parseCents(cell(row, map.otherDeposit), line, "other_deposit", true),
        balanceCents: parseCents(cell(row, map.balance), line, "balance", true),
        moveIn: parseBrokerDate(cell(row, map.moveIn), line, "move_in", true),
        leaseExpiration: parseBrokerDate(cell(row, map.leaseExpiration), line, "lease_expiration", true),
        moveOut: parseBrokerDate(cell(row, map.moveOut), line, "move_out", true),
        reportedTotalCents: null,
        charges: [],
        extras,
        sourceRows: [line],
      };
      Object.entries(extras).forEach(([header, value]) => {
        unmapped.push({ row: line, header, value, reason: "unmapped_column" });
      });
      const existing = byCode.get(unit.unitCode);
      if (existing) {
        existing.sourceRows.push(line);
        mergeExtras(existing.extras, extras);
        current = existing;
      } else {
        byCode.set(unit.unitCode, unit);
        units.push(unit);
        current = unit;
      }
      if (chargeCode && !/^total$/i.test(chargeCode)) {
        const charge = makeCharge(current.unitCode, chargeCode, amount, line, unusedCells(row, found.headers, mappedCols));
        current.charges.push(charge);
      }
      return;
    }

    if (current && looksLikeChargeCode(chargeCode)) {
      const amount = parseCents(cell(row, map.amount), line, "amount", lenient);
      const leftover = unusedCells(row, found.headers, new Set([map.chargeCode ?? -1, map.amount ?? -1, map.unit ?? -1]));
      current.charges.push(makeCharge(current.unitCode, chargeCode, amount, line, leftover));
      current.sourceRows.push(line);
      mergeExtras(current.extras, leftover);
      Object.entries(leftover).forEach(([header, value]) => {
        unmapped.push({ row: line, header, value, reason: "charge_row_extra" });
      });
      return;
    }

    const leftover = unusedCells(row, found.headers, new Set());
    Object.entries(leftover).forEach(([header, value]) => {
      unmapped.push({ row: line, header, value, reason: "unclassified_row" });
      if (current) mergeExtras(current.extras, { [header]: value });
      else meta.extras[`row_${line}_${header}`] = value;
    });
  });

  flush();

  if (!units.length) {
    throw new CsvParseError(found.dataStart + 1, couldNotMapColumnsMessage(found.headers.filter(Boolean), ["unit rows"]));
  }

  const charges = units.flatMap((unit) => unit.charges);
  return { meta, units, charges, unmapped, warnings };
}

function makeCharge(
  unitCode: string,
  chargeCode: string,
  amountCents: bigint,
  sourceRow: number,
  extras: Record<string, string>,
): CanonicalCharge {
  return {
    unitCode,
    chargeCode,
    chargeClass: classifyChargeCode(chargeCode),
    amountCents,
    sourceRow,
    extras,
  };
}
