import {
  centsToDollars,
  extrasRecordToJson,
  ymd,
  type NormalizedRentRoll,
} from "./rent-roll-canonical";

export const CANONICAL_UNIT_HEADERS = [
  "unit_code",
  "unit_type",
  "beds",
  "baths",
  "sqft",
  "status",
  "section",
  "resident_id",
  "resident_name",
  "market_rent",
  "in_place_rent",
  "other_charges",
  "concession",
  "resident_deposit",
  "other_deposit",
  "balance",
  "move_in",
  "lease_expiration",
  "move_out",
  "charge_codes",
  "reported_total",
  "extras",
] as const;

export const CANONICAL_CHARGE_HEADERS = [
  "unit_code",
  "charge_code",
  "charge_class",
  "amount",
  "source_row",
  "extras",
] as const;

export function metaSheetRows(normalized: NormalizedRentRoll): string[][] {
  const { meta } = normalized;
  const rows: string[][] = [
    ["key", "value"],
    ["dialect", meta.dialect],
    ["dialect_label", meta.dialectLabel],
    ["report_title", meta.reportTitle ?? ""],
    ["property_name", meta.propertyName ?? ""],
    ["as_of", meta.asOfDate ?? ""],
    ["transaction_date", meta.transactionDate ?? ""],
    ["month_year", meta.monthYear ?? ""],
    ["source_filename", meta.sourceFilename ?? ""],
    ["source_sheet", meta.sheetName ?? ""],
    ["unit_count", String(normalized.units.length)],
    ["charge_count", String(normalized.charges.length)],
    ["unmapped_count", String(normalized.unmapped.length)],
    ["warning_count", String(normalized.warnings.length)],
  ];
  for (const [key, value] of Object.entries(meta.extras)) {
    rows.push([`meta_extra.${key}`, value]);
  }
  if (normalized.warnings.length) {
    rows.push([]);
    rows.push(["warnings"]);
    for (const warning of normalized.warnings) rows.push([warning]);
  }
  if (normalized.unmapped.length) {
    rows.push([]);
    rows.push(["unmapped_row", "col", "header", "value", "reason"]);
    for (const cell of normalized.unmapped) {
      rows.push([
        String(cell.row),
        cell.col != null ? String(cell.col) : "",
        cell.header ?? "",
        cell.value,
        cell.reason,
      ]);
    }
  }
  return rows;
}

export function canonicalUnitSheetRows(normalized: NormalizedRentRoll): string[][] {
  return [
    [...CANONICAL_UNIT_HEADERS],
    ...normalized.units.map((unit) => [
      unit.unitCode,
      unit.unitType,
      String(unit.beds),
      (unit.bathsTenths / 10).toFixed(1),
      String(unit.sqft),
      unit.status,
      unit.section ?? "",
      unit.residentId,
      unit.residentName,
      centsToDollars(unit.marketRentCents),
      centsToDollars(unit.inPlaceRentCents),
      centsToDollars(unit.otherChargesCents),
      centsToDollars(unit.concessionCents),
      centsToDollars(unit.residentDepositCents),
      centsToDollars(unit.otherDepositCents),
      centsToDollars(unit.balanceCents),
      ymd(unit.moveIn),
      ymd(unit.leaseExpiration),
      ymd(unit.moveOut),
      unit.charges.map((c) => c.chargeCode).join("|"),
      unit.reportedTotalCents != null ? centsToDollars(unit.reportedTotalCents) : "",
      extrasRecordToJson(unit.extras),
    ]),
  ];
}

export function canonicalChargeSheetRows(normalized: NormalizedRentRoll): string[][] {
  return [
    [...CANONICAL_CHARGE_HEADERS],
    ...normalized.charges.map((charge) => [
      charge.unitCode,
      charge.chargeCode,
      charge.chargeClass,
      centsToDollars(charge.amountCents),
      String(charge.sourceRow),
      extrasRecordToJson(charge.extras),
    ]),
  ];
}
