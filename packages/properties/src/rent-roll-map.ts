import { bathsToTenths, isUnitStatus, type UnitSnapshot, type UnitStatus } from "./types";
import { CsvParseError, parseUsdToCents, splitCsvLine } from "./csv";

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
export type RentRollColumnMap = Partial<Record<RentRollField | "beds_baths", number>>;

const FIELD_ALIASES: Record<RentRollField | "beds_baths", string[]> = {
  unit: [
    "unit_id",
    "unit id",
    "unit number",
    "unit nbr",
    "unit no",
    "unit code",
    "unit #",
    "unit",
    "apt no",
    "apt #",
    "apartment",
    "apt",
  ],
  floorplan: [
    "floorplan",
    "floor plan",
    "unit type",
    "unit design",
    "floorplan name",
    "plan name",
    "plan",
    "fp",
    "type",
  ],
  beds: ["bedrooms", "bedroom", "beds", "bed", "bdrms", "bdrm", "br", "bd"],
  baths: ["bathrooms", "bathroom", "baths", "bath", "ba"],
  beds_baths: ["bd ba", "beds baths", "bed bath", "br ba", "bds bas", "bed/bath", "bd/ba"],
  sqft: ["square footage", "square feet", "unit sf", "sq ft", "sqft", "sf", "nra", "nsa"],
  status: ["occupancy status", "unit status", "occ status", "occupancy", "status", "occ"],
  market_rent: [
    "market rent",
    "asking rent",
    "street rent",
    "proforma rent",
    "mkt rent",
    "scheduled market",
    "market",
    "asking",
    "mkt",
  ],
  in_place_rent: [
    "in_place_rent",
    "in place rent",
    "leased rent",
    "lease rent",
    "current rent",
    "actual rent",
    "charged rent",
    "in-place rent",
    "in place",
    "actual",
  ],
  lease_start: [
    "lease_start",
    "lease start",
    "lease from",
    "lease begin",
    "start date",
    "move in date",
    "move-in",
    "move in",
    "mi date",
  ],
  lease_end: [
    "lease_end",
    "lease end",
    "lease expiration",
    "lease expire",
    "lease to",
    "end date",
    "expiration date",
    "expiration",
    "le date",
  ],
  concession: ["concessions", "concession", "free rent", "conc"],
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

  const assign = (field: RentRollField | "beds_baths") => {
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

  (Object.keys(FIELD_ALIASES) as Array<RentRollField | "beds_baths">)
    .sort((a, b) => FIELD_ALIASES[b][0]!.length - FIELD_ALIASES[a][0]!.length)
    .forEach(assign);

  const missing: RentRollField[] = [];
  if (map.unit == null) missing.push("unit");
  if (map.status == null && map.in_place_rent == null && map.market_rent == null) {
    missing.push("status");
  }
  return { map, missing, detected: headers.filter((h) => h.trim()) };
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
  return score;
}

export function findRentRollHeaderRow(rows: string[][], maxScan = 25): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, maxScan);
  for (let i = 0; i < limit; i += 1) {
    const score = scoreRentRollHeaderRow(rows[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return bestScore >= 8 ? best : -1;
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
  if (/^(occupied|current|occ|leased|notice|ntv|onnotice|pending|resident)$/.test(compact)) return "OCCUPIED";
  if (/^(vacant|vac|empty|ready|available|unoccupied|unrented)$/.test(compact)) return "VACANT";
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
  return /^(total|average|avg|subtotal|grand total)/.test(unitCode.toLowerCase()) || /\b(total|average)\b/.test(hay) && !/\d/.test(unitCode);
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

  const seen = new Set<string>();
  const units: UnitSnapshot[] = [];
  rows.forEach((cols, i) => {
    const line = i + 2;
    const unitCode = cell(cols, map.unit);
    if (!unitCode || looksLikeSummary(unitCode, cols)) return;

    if (seen.has(unitCode)) {
      throw new CsvParseError(line, `duplicate unit_id ${unitCode}`);
    }
    seen.add(unitCode);

    const combo = map.beds_baths != null ? parseBedsBaths(cell(cols, map.beds_baths)) : null;
    const bedsN = combo ? Math.trunc(combo.beds) : Number(cell(cols, map.beds) || "0");
    const bathsN = combo ? combo.baths : Number(cell(cols, map.baths) || "0");
    const sqftN = Number(cell(cols, map.sqft) || "0");
    if (!Number.isInteger(bedsN) || bedsN < 0) {
      throw new CsvParseError(line, "beds must be a non-negative integer");
    }
    if (!Number.isFinite(bathsN) || bathsN < 0) {
      throw new CsvParseError(line, "baths must be a non-negative number");
    }
    if (!Number.isInteger(sqftN) || sqftN < 0) {
      throw new CsvParseError(line, "sqft must be a non-negative integer");
    }

    const marketRent = parseUsdToCents(cell(cols, map.market_rent) || "0", line, "market_rent");
    let inPlaceRent = parseUsdToCents(cell(cols, map.in_place_rent) || "0", line, "in_place_rent");
    const concessionCents = parseUsdToCents(cell(cols, map.concession) || "0", line, "concession");

    const statusRaw = cell(cols, map.status);
    let statusValue = parseRentRollStatus(statusRaw);
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

    units.push({
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
    });
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
