import { read } from "xlsx";
import { describe, expect, it } from "vitest";
import {
  looksLikeNonUnitLabel,
  looksLikeUnitCode,
  canonicalUnitSheetRows,
  detectRentRollDialect,
  metaSheetRows,
  normalizeRentRollTable,
  parseRentRollCsv,
} from "@rcp/properties";
import { parseRentRollSource, selectRentRollSheet } from "@/lib/deals/workbook";
import { buildCanonicalRentRollWorkbook } from "@/lib/rent-roll-workbook";
import {
  HAMPTON_LEASE_CHARGES_CHARGE_TOTAL_CENTS,
  HAMPTON_LEASE_CHARGES_OCCUPIED,
  HAMPTON_LEASE_CHARGES_UNIT_COUNT,
  hamptonLeaseChargesRows,
  hamptonLeaseChargesWorkbook,
} from "./fixtures/hampton-lease-charges";
import {
  HARRINGTON_BROKER_CSV,
  harringtonRediqRentRollWorkbook,
  harringtonYardiResiWorkbook,
} from "./fixtures/harrington-rent-roll";

describe("rent-roll dialects", () => {
  it("detects Hampton/Yardi Lease Charges and keeps labels, charges, and extras", () => {
    const rows = hamptonLeaseChargesRows();
    const hit = detectRentRollDialect(rows);
    expect(hit?.dialect).toBe("yardi_lease_charges");
    const normalized = normalizeRentRollTable(rows, { sourceFilename: "Hampton-RR.xlsx" });
    expect(normalized.meta.dialect).toBe("yardi_lease_charges");
    expect(normalized.meta.reportTitle).toMatch(/Rent Roll with Lease Charges/i);
    expect(normalized.meta.propertyName).toBe("Hampton Gardens");
    expect(normalized.meta.asOfDate).toBe("2026-03-30");
    expect(normalized.meta.transactionDate).toBe("2026-03-30");
    expect(normalized.meta.monthYear).toMatch(/March 2026/i);
    expect(normalized.meta.extras["source_row_6"]).toMatch(/Site Manager/i);
    expect(normalized.units).toHaveLength(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    expect(normalized.units.filter((u) => u.status === "OCCUPIED")).toHaveLength(HAMPTON_LEASE_CHARGES_OCCUPIED);
    const first = normalized.units[0]!;
    expect(first.unitCode).toBe("171L725-1");
    expect(first.unitType).toBe("1P/V");
    expect(first.sqft).toBe(540);
    expect(first.residentId).toBe("16902550");
    expect(first.residentName).toBe("Evan Media");
    expect(first.marketRentCents).toBe(1220_00n);
    expect(first.inPlaceRentCents).toBe(975_00n);
    expect(first.otherChargesCents).toBe(9_95n + 25_25n);
    expect(first.residentDepositCents).toBe(95_00n);
    expect(first.charges.map((c) => c.chargeCode).sort()).toEqual(["r-cable", "r-laundr", "r-rent"]);
    expect(first.section).toMatch(/Current/i);
    expect(first.reportedTotalCents).toBe(1010_20n);
    const fyl = normalized.units.find((u) => u.unitCode === "FYL725-1");
    expect(fyl?.unitType).toBe("1PW");
    expect(fyl?.inPlaceRentCents).toBe(975_00n);
    expect(fyl?.section).toMatch(/Current\/Notice\/Vacant Residents/i);
    const vacant = normalized.units.find((u) => u.unitCode === "171L730-1");
    expect(vacant?.status).toBe("VACANT");
    expect(vacant?.inPlaceRentCents).toBe(0n);
    expect(vacant?.marketRentCents).toBe(1220_00n);
    const chargeSum = normalized.charges.reduce((acc, c) => acc + c.amountCents, 0n);
    expect(chargeSum).toBe(HAMPTON_LEASE_CHARGES_CHARGE_TOTAL_CENTS);
    const retained = [
      JSON.stringify(normalized.meta),
      ...normalized.units.map((u) =>
        [
          u.unitCode,
          u.unitType,
          u.residentId,
          u.residentName,
          u.section,
          u.extras["Make Ready"],
          ...u.charges.map((c) => c.chargeCode),
        ].join(" "),
      ),
      ...normalized.unmapped.map((u) => u.value),
      Object.values(normalized.meta.extras).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    for (const token of [
      "171L725-1",
      "Evan Media",
      "Hampton Gardens",
      "r-rent",
      "r-laundr",
      "r-park",
      "Paint",
      "Site Manager",
      "Phallise Taylor",
      "171L730-1",
    ]) {
      expect(retained).toContain(token.toLowerCase());
    }
  });

  it("does not promote Charge Code or Current/Notice/Vacant Residents into units", () => {
    expect(looksLikeNonUnitLabel("Charge Code")).toBe(true);
    expect(looksLikeNonUnitLabel("Current/Notice/Vacant Residents")).toBe(true);
    expect(looksLikeNonUnitLabel("Notice Residents")).toBe(true);
    expect(looksLikeNonUnitLabel("Vacant Residents")).toBe(true);
    expect(looksLikeNonUnitLabel("Grand Total")).toBe(true);
    expect(looksLikeUnitCode("Charge Code")).toBe(false);
    expect(looksLikeUnitCode("Current/Notice/Vacant Residents")).toBe(false);
    expect(looksLikeUnitCode("171L725-1")).toBe(true);
    expect(looksLikeUnitCode("FYL725-1")).toBe(true);

    const normalized = normalizeRentRollTable(hamptonLeaseChargesRows(), { sourceFilename: "Hampton-RR.xlsx" });
    const codes = normalized.units.map((u) => u.unitCode);
    expect(codes).not.toContain("Charge Code");
    expect(codes).not.toContain("Current/Notice/Vacant Residents");
    expect(codes).not.toContain("Notice Residents");
    expect(codes).not.toContain("Vacant Residents");
    expect(codes).not.toContain("Total");
    expect(codes).toEqual(expect.arrayContaining(["171L725-1", "171L725-2", "FYL725-1", "171L730-1"]));
    expect(normalized.units).toHaveLength(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    expect(normalized.units[0]?.section).toBe("Current/Notice/Vacant Residents");
    expect(normalized.unmapped.some((row) => row.reason === "header_label_row" && row.value === "Charge Code")).toBe(
      true,
    );
  });

  it("rebuilds Canonical / Charge Detail / Original / Meta without dropping the source title", () => {
    const source = parseRentRollSource({
      filename: "RR_-_Hampton_Gardens_-_Lease_Charges.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: hamptonLeaseChargesWorkbook(),
    });
    expect(source.normalized.meta.dialect).toBe("yardi_lease_charges");
    expect(source.selectedSheet).toMatch(/lease charges/i);
    const xlsx = buildCanonicalRentRollWorkbook({
      normalized: source.normalized,
      originalSheets: source.originalSheets,
      selectedSheet: source.selectedSheet,
    });
    const wb = read(xlsx, { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["Canonical", "Charge Detail", "Meta", "Original"]));
    const meta = metaSheetRows(source.normalized);
    expect(meta.some((row) => row[0] === "property_name" && row[1] === "Hampton Gardens")).toBe(true);
    const unitSheet = canonicalUnitSheetRows(source.normalized);
    expect(unitSheet[0]).toContain("extras");
    expect(unitSheet.some((row) => row.some((cell) => cell.includes("Paint")))).toBe(true);
  });

  it("still parses redIQ and Yardi/MRI flat dialects to the same unit counts", () => {
    const rediq = parseRentRollSource({
      filename: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      bytes: harringtonRediqRentRollWorkbook(),
    });
    expect(rediq.normalized.meta.dialect).toBe("redi_q_machine");
    expect(rediq.normalized.units).toHaveLength(175);

    const yardi = parseRentRollSource({
      filename: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      bytes: harringtonYardiResiWorkbook(),
    });
    expect(yardi.normalized.meta.dialect).toBe("broker_flat");
    expect(yardi.normalized.units).toHaveLength(5);
    expect(yardi.normalized.units[0]?.inPlaceRentCents).toBe(1225_00n);

    const broker = parseRentRollCsv(HARRINGTON_BROKER_CSV);
    expect(broker).toHaveLength(3);
    expect(selectRentRollSheet(read(harringtonRediqRentRollWorkbook(), { type: "buffer" }))?.name).toBe("Rent Roll");
  });
});
