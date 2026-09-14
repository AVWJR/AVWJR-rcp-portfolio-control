import { CsvParseError } from "./csv-parse";
import { parseFlatTabular, scoreFlatTabular } from "./dialects/flat-tabular";
import { parseYardiLeaseCharges, scoreYardiLeaseCharges } from "./dialects/yardi-lease-charges";
import {
  RENT_ROLL_DIALECT_LABELS,
  type DialectDetectHit,
  type DialectParseOpts,
  type NormalizedRentRoll,
  type RentRollDialectId,
} from "./rent-roll-canonical";
import { couldNotMapColumnsMessage } from "./rent-roll-map";

export { parseFlatTabular, scoreFlatTabular } from "./dialects/flat-tabular";
export { findLeaseChargesHeader, parseYardiLeaseCharges, scoreYardiLeaseCharges } from "./dialects/yardi-lease-charges";

export type RentRollDialectParser = {
  id: RentRollDialectId;
  label: string;
  score: (rows: string[][]) => DialectDetectHit | null;
  parse: (rows: string[][], opts?: DialectParseOpts) => NormalizedRentRoll;
};

/**
 * Registry — add a PMS format by pushing a dialect with the same canonical output.
 * Detection is score-based so Hampton/Yardi nested “Lease Charges” does not
 * replace redIQ or flat broker paths.
 */
export const RENT_ROLL_DIALECTS: RentRollDialectParser[] = [
  {
    id: "yardi_lease_charges",
    label: RENT_ROLL_DIALECT_LABELS.yardi_lease_charges,
    score: scoreYardiLeaseCharges,
    parse: parseYardiLeaseCharges,
  },
  {
    id: "redi_q_machine",
    label: RENT_ROLL_DIALECT_LABELS.redi_q_machine,
    score: (rows) => {
      const hit = scoreFlatTabular(rows);
      return hit?.dialect === "redi_q_machine" ? hit : null;
    },
    parse: parseFlatTabular,
  },
  {
    id: "broker_flat",
    label: RENT_ROLL_DIALECT_LABELS.broker_flat,
    score: (rows) => {
      const hit = scoreFlatTabular(rows);
      return hit && hit.dialect !== "canonical_csv" && hit.dialect !== "redi_q_machine" ? hit : null;
    },
    parse: parseFlatTabular,
  },
  {
    id: "canonical_csv",
    label: RENT_ROLL_DIALECT_LABELS.canonical_csv,
    score: (rows) => {
      const hit = scoreFlatTabular(rows);
      return hit?.dialect === "canonical_csv" ? hit : null;
    },
    parse: parseFlatTabular,
  },
];

const TIE_BREAK: Record<RentRollDialectId, number> = {
  yardi_lease_charges: 4,
  redi_q_machine: 3,
  broker_flat: 2,
  canonical_csv: 1,
};

export function detectRentRollDialect(rows: string[][]): DialectDetectHit | null {
  const hits = RENT_ROLL_DIALECTS.map((dialect) => dialect.score(rows)).filter((hit): hit is DialectDetectHit => Boolean(hit));
  hits.sort((a, b) => b.score - a.score || TIE_BREAK[b.dialect] - TIE_BREAK[a.dialect]);
  return hits[0] ?? null;
}

export function parserForDialect(id: RentRollDialectId): RentRollDialectParser {
  const found = RENT_ROLL_DIALECTS.find((dialect) => dialect.id === id);
  if (!found) throw new Error(`Unknown rent-roll dialect: ${id}`);
  return found;
}

export function normalizeRentRollTable(rows: string[][], opts: DialectParseOpts = {}): NormalizedRentRoll {
  if (!rows.some((row) => row.some((cell) => (cell ?? "").trim()))) {
    throw new CsvParseError(0, "file is empty");
  }
  const detected = detectRentRollDialect(rows);
  if (!detected) {
    const sample = (rows.find((row) => row.some((cell) => cell.trim())) ?? []).filter(Boolean);
    throw new CsvParseError(1, couldNotMapColumnsMessage(sample, ["unit"]));
  }
  const parser = parserForDialect(detected.dialect);
  const normalized = parser.parse(rows, opts);
  if (normalized.meta.dialect !== detected.dialect) {
    normalized.meta.dialect = detected.dialect;
    normalized.meta.dialectLabel = RENT_ROLL_DIALECT_LABELS[detected.dialect];
  }
  return normalized;
}

export type SheetCandidate = { name: string; rows: string[][] };

export function normalizeRentRollSheets(
  sheets: SheetCandidate[],
  opts: DialectParseOpts = {},
): { normalized: NormalizedRentRoll; selectedSheet: string; detection: DialectDetectHit } {
  let best: {
    sheet: SheetCandidate;
    hit: DialectDetectHit;
    sheetBonus: number;
  } | null = null;
  for (const sheet of sheets) {
    const hit = detectRentRollDialect(sheet.rows);
    if (!hit) continue;
    const sheetBonus = sheetNameBonus(sheet.name);
    if (!best || hit.score + sheetBonus > best.hit.score + best.sheetBonus) {
      best = { sheet, hit, sheetBonus };
    }
  }
  if (!best) {
    const sample = sheets[0]?.rows.find((row) => row.some((cell) => cell.trim())) ?? [];
    throw new CsvParseError(1, couldNotMapColumnsMessage(sample.filter(Boolean), ["unit"]));
  }
  const normalized = parserForDialect(best.hit.dialect).parse(best.sheet.rows, {
    ...opts,
    sheetName: best.sheet.name,
  });
  normalized.meta.sheetName = best.sheet.name;
  return { normalized, selectedSheet: best.sheet.name, detection: best.hit };
}

function sheetNameBonus(name: string): number {
  const lower = name.trim().toLowerCase();
  if (lower === "rent roll" || lower === "rentroll") return 12;
  if (/lease charges/.test(lower)) return 14;
  if (/^(floor plan|floorplan|about|sheet\d+|cover)$/.test(lower)) return -12;
  if (/cover|instr|toc|summary|index|check|about/.test(lower)) return -8;
  if (/rent|roll|unit|resi/.test(lower)) return 6;
  return 0;
}
