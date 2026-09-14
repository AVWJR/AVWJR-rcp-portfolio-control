import { bathsToTenths, isUnitStatus, type UnitSnapshot, type UnitStatus } from "./types";
import { CsvParseError, parseUsdToCents, splitCsvLine } from "./csv-parse";

export const RENT_ROLL_CANONICAL_FIELDS = [
  "unit",
  "floorplan",
  "beds",
  "baths",
  "sqft",
  "status",
  "market_rent",
  "in_place_rent",
  "lease_start",
  "lease_end",
  "concession",
] as const;

export type RentRollField = (typeof RENT_ROLL_CANONICAL_FIELDS)[number];
export type RentRollColumnMap = Partial<Record<RentRollField | "beds_baths" | "building" | "resident", number>>;

const FIELD_ALIASES: Record<RentRollField | "beds_baths" | "building" | "resident", string[]> = {
  unit: [
    "unitid",
    "unit_id",
    "unit id",
    "unit number",
    "unit nbr",
    "unit no",
    "unit code",
    "unit #",
    "resi unit",
    "bldg unit",
    "building unit",
    "apt number",
    "apt no",
    "apt #",
    "apartment",
    "unit",
    "apt",
  ],
  building: ["building number", "building no", "bldg number", "bldg nbr", "bldg no", "building", "bldg"],
  resident: ["resident name", "tenant name", "resident", "tenant"],
  floorplan: [
    "floorplan",
    "floor plan",
    "unit type",
    "unit design",
    "floorplan name",
    "floorplan code",
    "plan name",
    "planid",
    "plan id",
    "flrpln",
    "plan",
    "fp",
    "type",
  ],
  beds: ["bedrooms", "bedroom", "beds", "bed", "bdrms", "bdrm", "br", "bd"],
  baths: ["bathrooms", "bathroom", "baths", "bath", "ba"],
  beds_baths: ["bd ba", "beds baths", "bed bath", "br ba", "bds bas", "bed/bath", "bd/ba"],
  sqft: ["square footage", "square feet", "unit sq ft", "unit sf", "net sf", "netsf", "sq ft", "sqft", "sf", "nra", "nsa"],
  status: [
    "occupancy status",
    "status occupancy",
    "unit occupancy",
    "unit status",
    "occstatus",
    "occ status",
    "occupancy",
    "occupied",
    "status",
    "occ",
  ],
  market_rent: [
    "market rent",
    "rent market",
    "asking rent",
    "street rent",
    "proforma rent",
    "monthly market",
    "scheduled market",
    "mktrent",
    "mkt rent",
    "market",
    "asking",
    "mkt",
  ],
  in_place_rent: [
    "in_place_rent",
    "inplacerent",
    "in place rent",
    "rent contractual",
    "resident rent",
    "leased rent",
    "lease rent",
    "current rent",
    "actual rent",
    "charged rent",
    "charge amt",
    "in-place rent",
    "rent amount",
    "code1",
    "code 1",
    "charges",
    "in place",
    "actual",
    "chg",
  ],
  lease_start: [
    "lease_start",
    "leasesign",
    "lease sign",
    "lease start",
    "lease from",
    "lease begin",
    "start date",
    "moveindate",
    "move in date",
    "move-in",
    "move in",
    "mi date",
  ],
  lease_end: [
    "lease_end",
    "leaseexp",
    "lease exp",
    "lease end",
    "lease expiration",
    "lease expire",
    "lease to",
    "end date",
    "expiration date",
    "expiration",
    "le date",
  ],
  concession: ["recconc", "rec conc", "concessions", "concession", "free rent", "conc"],
};

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[#]/g, " number ")
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasHits(normalized: string, aliases: string[]): boolean {
  return aliases.some((alias) => normalized === alias || normalized.replace(/\s+/g, "") === alias.replace(/\s+/g, ""));
}

export function mapRentRollHeaders(headers: string[]): {
  map: RentRollColumnMap;
  missing: RentRollField[];
  detected: string[];
} {
  const normalized = headers.map(normalizeHeader);
  const map: RentRollColumnMap = {};
  const used = new Set<number>();

  const assign = (field: RentRollField | "beds_baths" | "building" | "resident") => {
    const aliases = FIELD_ALIASES[field];
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

  (Object.keys(FIELD_ALIASES) as Array<RentRollField | "beds_baths" | "building" | "resident">)
    .sort((a, b) => FIELD_ALIASES[b][0]!.length - FIELD_ALIASES[a][0]!.length)
    .forEach(assign);

  const missing: RentRollField[] = [];
  if (map.unit == null) missing.push("unit");
  if (map.status == null && map.in_place_rent == null && map.market_rent == null) {
    missing.push("status");
  }
  return { map, missing, detected: headers.filter((h) => h.trim()) };
}

export function rediqMachineHeaderBonus(headers: string[]): number {
  const compact = headers.map((h) => normalizeHeader(h).replace(/\s+/g, ""));
  let bonus = 0;
  if (compact.includes("unitid")) bonus += 12;
  if (compact.includes("occstatus")) bonus += 6;
  if (compact.includes("mktrent")) bonus += 6;
  if (compact.includes("inplacerent")) bonus += 6;
  if (compact.includes("netsf")) bonus += 3;
  if (compact.includes("planid")) bonus += 2;
  return bonus;
}

export function scoreRentRollHeaderRow(headers: string[]): number {
  const { map } = mapRentRollHeaders(headers);
  let score = 0;
  if (map.unit != null) score += 8;
  if (map.status != null) score += 4;
  if (map.market_rent != null) score += 3;
  if (map.in_place_rent != null) score += 3;
  if (map.floorplan != null) score += 1;
  if (map.beds != null || map.beds_baths != null) score += 1;
  if (map.sqft != null) score += 1;
  if (map.lease_start != null || map.lease_end != null) score += 1;
  return score + rediqMachineHeaderBonus(headers);
}

function mergeHeaderCells(top: string, bot: string): string {
  const a = (top ?? "").trim();
  const b = (bot ?? "").trim();
  if (!b) return a;
  if (!a) return b;
  if (normalizeHeader(a) === normalizeHeader(b)) return b;
  const botScore = scoreRentRollHeaderRow([b]);
  const topScore = scoreRentRollHeaderRow([a]);
  if (botScore > topScore) return b;
  if (topScore > botScore) return a;
  return `${a} ${b}`;
}

export function mergeHeaderRows(top: string[], bot: string[]): string[] {
  const len = Math.max(top.length, bot.length);
  return Array.from({ length: len }, (_, i) => mergeHeaderCells(top[i] ?? "", bot[i] ?? ""));
}

export function findRentRollHeader(
  rows: string[][],
  maxScan = 40,
): { index: number; headers: string[]; score: number } | null {
  type Found = { index: number; headers: string[]; score: number };
  const limit = Math.min(rows.length, maxScan);
  let best: Found | null = null;
  for (let i = 0; i < limit; i += 1) {
    const headers = rows[i] ?? [];
    const score = scoreRentRollHeaderRow(headers);
    if (score >= 8 && (!best || score > best.score)) best = { index: i, headers, score };
  }
  if (best && rediqMachineHeaderBonus(best.headers) >= 12) return best;
  for (let i = 0; i < limit; i += 1) {
    const next = rows[i + 1];
    if (!next) continue;
    const headers = mergeHeaderRows(rows[i] ?? [], next);
    const score = scoreRentRollHeaderRow(headers);
    if (score >= 8 && (!best || score > best.score)) best = { index: i + 1, headers, score };
  }
  if (best) return best;
  const inferred = inferUnitColumnFromRows(rows);
  if (inferred != null) {
    const probe = rows.find((row) => scoreRentRollHeaderRow(row) > 0) ?? rows[0] ?? [];
    const headers = [...probe];
    headers[inferred] = "Unit";
    const index = rows.indexOf(probe);
    const rescored = scoreRentRollHeaderRow(headers);
    if (rescored >= 8) return { index: Math.max(0, index), headers, score: rescored };
  }
  return null;
}

export function findRentRollHeaderRow(rows: string[][], maxScan = 40): number {
  return findRentRollHeader(rows, maxScan)?.index ?? -1;
}

export type ResolvedRentRollHeader = {
  index: number;
  headers: string[];
  dataStart: number;
  score: number;
};

export function resolveRentRollHeader(rows: string[][], maxScan = 80): ResolvedRentRollHeader | null {
  const found = findRentRollHeader(rows, maxScan);
  if (!found) return null;
  return { index: found.index, headers: found.headers, dataStart: found.index + 1, score: found.score };
}

export function looksLikeUnitCode(value: string): boolean {
  const v = value.trim();
  if (!v || looksLikeSummary(v, [v]) || looksLikeHeaderRepeat(v)) return false;
  if (/^[4-7]\d{3}$/.test(v)) return false;
  return /^(?:[A-Za-z]{1,3}[-/]?)?\d{1,5}[A-Za-z]{0,2}$/.test(v) || /^\d{1,3}-\d{2,4}$/.test(v) || /^[A-Za-z0-9]{3,14}-\d{1,4}$/.test(v);
}

function inferUnitColumnFromRows(rows: string[][]): number | null {
  const body = rows.slice(0, 80);
  const width = body.reduce((max, row) => Math.max(max, row.length), 0);
  let bestCol = -1;
  let bestHits = 0;
  for (let col = 0; col < width; col += 1) {
    let hits = 0;
    let nonempty = 0;
    for (const row of body) {
      const cell = (row[col] ?? "").trim();
      if (!cell) continue;
      nonempty += 1;
      if (looksLikeUnitCode(cell)) hits += 1;
    }
    if (nonempty >= 3 && hits / nonempty >= 0.5 && hits > bestHits) {
      bestHits = hits;
      bestCol = col;
    }
  }
  return bestCol >= 0 ? bestCol : null;
}

export function couldNotMapColumnsMessage(detected: string[], missing: string[] = ["unit"]): string {
  const headers = detected.length ? detected.join(", ") : "(none)";
  return `could not map columns: ${missing.join(", ")}. Detected headers: ${headers}`;
}

export function parseRentRollStatus(raw: string): UnitStatus | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const compact = value.replace(/[^a-z]/g, "");
  if (isUnitStatus(raw.trim().toUpperCase())) return raw.trim().toUpperCase() as UnitStatus;
  if (/^(occupied|current|occ|leased|notice|ntv|onnotice|pending|resident|y|yes|true|1)$/.test(compact)) return "OCCUPIED";
  if (/^(vacant|vac|empty|ready|available|unoccupied|unrented|n|no|false|0)$/.test(compact)) return "VACANT";
  if (/^(down|offline|model|admin|employee|makeready|nrv|unrentable)$/.test(compact)) return "DOWN";
  return null;
}

export function parseBrokerDate(raw: string, line: number, field: string, lenient = false): Date | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(`${text.slice(0, 10)}T16:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const us = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
    }
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    if (!Number.isNaN(utc.getTime())) return utc;
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  if (lenient) return null;
  throw new CsvParseError(line, `${field} must be a date, got "${raw}"`);
}

function parseBedsBaths(raw: string): { beds: number; baths: number } | null {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*[x/]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return { beds: Number(match[1]), baths: Number(match[2]) };
}

function cell(cols: string[], index: number | undefined): string {
  if (index == null) return "";
  return (cols[index] ?? "").trim();
}

function looksLikeSummary(unitCode: string, cols: string[]): boolean {
  const hay = `${unitCode} ${cols.join(" ")}`.toLowerCase();
  return /^(total|average|avg|subtotal|grand total)/.test(unitCode.toLowerCase()) || (/\b(total|average)\b/.test(hay) && !/\d/.test(unitCode));
}

function looksLikeHeaderRepeat(unitCode: string): boolean {
  const compact = unitCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return /^(unit|unitid|unitno|unitnbr|unitnumber|propname|planid|bldg|building|status|occstatus|renstatus|resident|market|mktrent|inplacerent|charges|netsf|type)$/.test(
    compact,
  );
}

function parseNonNegNumber(raw: string, field: string, line: number, integer: boolean, lenient: boolean): number {
  const cleaned = raw.replace(/[,$\s]/g, "").replace(/[—–]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    if (lenient) return 0;
    throw new CsvParseError(line, `${field} must be a non-negative ${integer ? "integer" : "number"}`);
  }
  return integer ? Math.round(n) : n;
}

export function parseMappedRentRollRows(
  headers: string[],
  rows: string[][],
  opts: { lenient?: boolean } = {},
): UnitSnapshot[] {
  const { map, missing, detected } = mapRentRollHeaders(headers);
  if (missing.includes("unit") || map.unit == null) {
    throw new CsvParseError(1, couldNotMapColumnsMessage(detected, missing.length ? missing : ["unit"]));
  }

  const byCode = new Map<string, UnitSnapshot>();
  const units: UnitSnapshot[] = [];
  rows.forEach((cols, i) => {
    const line = i + 2;
    try {
      const rawUnit = cell(cols, map.unit);
      const bldg = cell(cols, map.building);
      const unitCode = bldg && rawUnit && !rawUnit.startsWith(`${bldg}-`) && !rawUnit.includes("/") ? `${bldg}-${rawUnit}` : rawUnit;
      if (!unitCode || looksLikeSummary(unitCode, cols) || looksLikeHeaderRepeat(unitCode)) return;

      const combo = map.beds_baths != null ? parseBedsBaths(cell(cols, map.beds_baths)) : null;
      const bedsN = combo ? Math.trunc(combo.beds) : parseNonNegNumber(cell(cols, map.beds), "beds", line, true, opts.lenient ?? false);
      const bathsN = combo ? combo.baths : parseNonNegNumber(cell(cols, map.baths), "baths", line, false, opts.lenient ?? false);
      const sqftN = parseNonNegNumber(cell(cols, map.sqft), "sqft", line, true, opts.lenient ?? false);

      const marketRent = parseUsdToCents(cell(cols, map.market_rent) || "0", line, "market_rent");
      let inPlaceRent = parseUsdToCents(cell(cols, map.in_place_rent) || "0", line, "in_place_rent");
      const concessionCents = parseUsdToCents(cell(cols, map.concession) || "0", line, "concession");

      const statusRaw = cell(cols, map.status);
      const resident = cell(cols, map.resident);
      let statusValue = parseRentRollStatus(statusRaw);
      if (!statusValue && resident) {
        statusValue = /^(vacant|vac|empty|n\/a|-)$/i.test(resident) ? "VACANT" : "OCCUPIED";
      }
      if (!statusValue) {
        if (opts.lenient || !statusRaw) {
          statusValue = inPlaceRent > 0n ? "OCCUPIED" : "VACANT";
        } else {
          throw new CsvParseError(line, `status must be OCCUPIED, VACANT, or DOWN`);
        }
      }
      if (statusValue !== "OCCUPIED" && inPlaceRent !== 0n) {
        if (opts.lenient) {
          inPlaceRent = 0n;
        } else {
          throw new CsvParseError(line, "in_place_rent must be 0 unless status is OCCUPIED");
        }
      }

      const existing = byCode.get(unitCode);
      if (existing) {
        if (!opts.lenient) {
          throw new CsvParseError(line, `duplicate unit_id ${unitCode}`);
        }
        if (statusValue === "OCCUPIED") {
          existing.inPlaceRent += inPlaceRent;
          existing.concessionCents += concessionCents;
          if (existing.marketRent === 0n && marketRent > 0n) existing.marketRent = marketRent;
          if (!existing.leaseStart) existing.leaseStart = parseBrokerDate(cell(cols, map.lease_start), line, "lease_start", true);
          if (!existing.leaseEnd) existing.leaseEnd = parseBrokerDate(cell(cols, map.lease_end), line, "lease_end", true);
        }
        return;
      }

      const snapshot: UnitSnapshot = {
        unitCode,
        floorplan: cell(cols, map.floorplan),
        beds: bedsN,
        bathsTenths: bathsToTenths(bathsN),
        sqft: sqftN,
        status: statusValue,
        marketRent,
        inPlaceRent,
        leaseStart: parseBrokerDate(cell(cols, map.lease_start), line, "lease_start", opts.lenient ?? true),
        leaseEnd: parseBrokerDate(cell(cols, map.lease_end), line, "lease_end", opts.lenient ?? true),
        concessionCents,
      };
      byCode.set(unitCode, snapshot);
      units.push(snapshot);
    } catch (error) {
      if (opts.lenient) return;
      throw error;
    }
  });

  if (!units.length) {
    throw new CsvParseError(1, couldNotMapColumnsMessage(detected, ["unit rows"]));
  }
  return units;
}

export function looksLikeRentRollHeaders(headers: string[]): boolean {
  return scoreRentRollHeaderRow(headers) >= 8;
}

export function parseCsvRows(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map(splitCsvLine);
}
