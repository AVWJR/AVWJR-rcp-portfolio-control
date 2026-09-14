import { CsvParseError } from "../csv-parse";
import {
  emptyRentRollMeta,
  type CanonicalUnit,
  type DialectDetectHit,
  type DialectParseOpts,
  type NormalizedRentRoll,
  type RentRollDialectId,
} from "../rent-roll-canonical";
import {
  couldNotMapColumnsMessage,
  findRentRollHeader,
  mapRentRollHeaders,
  parseMappedRentRollRows,
  parseRentRollStatus,
  rediqMachineHeaderBonus,
} from "../rent-roll-map";

function flavorFromHeaders(headers: string[]): RentRollDialectId {
  const canonical = headers.map((h) => h.toLowerCase().trim());
  if (canonical.includes("unit_id") && canonical.includes("market_rent")) return "canonical_csv";
  if (rediqMachineHeaderBonus(headers) >= 12) return "redi_q_machine";
  return "broker_flat";
}

export function scoreFlatTabular(rows: string[][]): DialectDetectHit | null {
  const found = findRentRollHeader(rows, 80);
  if (!found) return null;
  const dialect = flavorFromHeaders(found.headers);
  let score = found.score;
  if (dialect === "canonical_csv") score += 10;
  if (dialect === "redi_q_machine") score += 8;
  return { dialect, score, reason: `header:${found.score}` };
}

function unusedMapped(headers: string[]): { used: Set<number>; labels: string[] } {
  const { map } = mapRentRollHeaders(headers);
  const used = new Set<number>();
  for (const index of Object.values(map)) {
    if (typeof index === "number") used.add(index);
  }
  return { used, labels: headers };
}

function rowExtras(headers: string[], cols: string[], used: Set<number>): Record<string, string> {
  const extras: Record<string, string> = {};
  cols.forEach((raw, i) => {
    const value = (raw ?? "").trim();
    if (!value || used.has(i)) return;
    const header = (headers[i] ?? "").trim() || `col_${i + 1}`;
    extras[header] = extras[header] ? `${extras[header]} | ${value}` : value;
  });
  return extras;
}

function parseMeta(rows: string[][], headerIndex: number, meta: NormalizedRentRoll["meta"]): void {
  for (let i = 0; i < headerIndex; i += 1) {
    const text = (rows[i] ?? []).map((c) => c.trim()).filter(Boolean).join(" ").trim();
    if (!text) continue;
    if (/rent roll|resi rr|unit mix/i.test(text) && !meta.reportTitle) {
      meta.reportTitle = text;
      continue;
    }
    const asOf = text.match(/as\s*of\s*[:\s]+(.+)/i);
    if (asOf && !meta.asOfDate) {
      meta.asOfDate = asOf[1]!.trim();
      continue;
    }
    if (!meta.propertyName && /park|garden|apart|llc|life at/i.test(text) && !/do not import|skip|cover/i.test(text)) {
      meta.propertyName = text;
      continue;
    }
    meta.extras[`source_row_${i + 1}`] = text;
  }
}

export function parseFlatTabular(rows: string[][], opts: DialectParseOpts = {}): NormalizedRentRoll {
  const found = findRentRollHeader(rows, 80);
  if (!found) {
    throw new CsvParseError(1, couldNotMapColumnsMessage((rows[0] ?? []).filter(Boolean), ["unit"]));
  }
  const dialect = flavorFromHeaders(found.headers);
  const canonical = found.headers.map((h) => h.toLowerCase());
  const isCanonical = canonical.includes("unit_id") && canonical.includes("market_rent");
  const snapshots = parseMappedRentRollRows(found.headers, rows.slice(found.index + 1), {
    lenient: opts.lenient ?? !isCanonical,
  });
  const { used } = unusedMapped(found.headers);
  const { map } = mapRentRollHeaders(found.headers);
  const extrasByUnit = new Map<string, Record<string, string>>();
  const sourceRows = new Map<string, number[]>();
  const unmapped: NormalizedRentRoll["unmapped"] = [];

  rows.slice(found.index + 1).forEach((cols, i) => {
    const line = found.index + i + 2;
    const rawUnit = map.unit != null ? (cols[map.unit] ?? "").trim() : "";
    const bldg = map.building != null ? (cols[map.building] ?? "").trim() : "";
    const unitCode = bldg && rawUnit && !rawUnit.startsWith(`${bldg}-`) && !rawUnit.includes("/") ? `${bldg}-${rawUnit}` : rawUnit;
    if (!unitCode) return;
    const extras = rowExtras(found.headers, cols, used);
    const prior = extrasByUnit.get(unitCode) ?? {};
    extrasByUnit.set(unitCode, { ...prior, ...extras });
    sourceRows.set(unitCode, [...(sourceRows.get(unitCode) ?? []), line]);
    Object.entries(extras).forEach(([header, value]) => {
      unmapped.push({ row: line, header, value, reason: "unmapped_column" });
    });
  });

  const meta = emptyRentRollMeta(dialect, opts);
  meta.headerRows = [found.headers];
  parseMeta(rows, found.index, meta);

  const units: CanonicalUnit[] = snapshots.map((snapshot) => {
    const extras = extrasByUnit.get(snapshot.unitCode) ?? {};
    const resident = extras.Resident || extras.resident || extras["Resident Name"] || extras["Tenant Name"] || "";
    if (resident && !parseRentRollStatus(resident)) {
      extras.resident_name = extras.resident_name || resident;
    }
    const charges =
      snapshot.inPlaceRent !== 0n
        ? [
            {
              unitCode: snapshot.unitCode,
              chargeCode: "in_place_rent",
              chargeClass: "rent" as const,
              amountCents: snapshot.inPlaceRent,
              sourceRow: sourceRows.get(snapshot.unitCode)?.[0] ?? 0,
              extras: {},
            },
          ]
        : [];
    if (snapshot.concessionCents !== 0n) {
      charges.push({
        unitCode: snapshot.unitCode,
        chargeCode: "concession",
        chargeClass: "concession",
        amountCents: snapshot.concessionCents,
        sourceRow: sourceRows.get(snapshot.unitCode)?.[0] ?? 0,
        extras: {},
      });
    }
    return {
      unitCode: snapshot.unitCode,
      unitType: snapshot.floorplan,
      beds: snapshot.beds,
      bathsTenths: snapshot.bathsTenths,
      sqft: snapshot.sqft,
      status: snapshot.status,
      section: extras.section || extras.Status || null,
      residentId: extras.resident_id || extras["Resident ID"] || "",
      residentName: extras.resident_name || resident,
      marketRentCents: snapshot.marketRent,
      inPlaceRentCents: snapshot.inPlaceRent,
      otherChargesCents: 0n,
      concessionCents: snapshot.concessionCents,
      residentDepositCents: 0n,
      otherDepositCents: 0n,
      balanceCents: 0n,
      moveIn: snapshot.leaseStart,
      leaseExpiration: snapshot.leaseEnd,
      moveOut: null,
      reportedTotalCents: snapshot.inPlaceRent !== 0n ? snapshot.inPlaceRent : null,
      charges,
      extras,
      sourceRows: sourceRows.get(snapshot.unitCode) ?? [],
    };
  });

  return {
    meta,
    units,
    charges: units.flatMap((unit) => unit.charges),
    unmapped,
    warnings: [],
  };
}
