import { selectRentRollSheet, workbookToCsv } from "@/lib/deals/workbook";
import { CsvParseError, findRentRollHeader, parseRentRollCsv } from "@rcp/properties";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { read } from "xlsx";
import {
  HARRINGTON_BROKER_CSV,
  HARRINGTON_REDIQ_UNIT_COUNT,
  buildHarringtonRediqUnits,
  harringtonRediqRentRollWorkbook,
  harringtonRentRollWorkbook,
  harringtonYardiResiWorkbook,
  unmappableWorkbook,
} from "./fixtures/harrington-rent-roll";

describe("broker rent-roll mapping", () => {
  it("maps Harrington-style headers under title rows", () => {
    const units = parseRentRollCsv(HARRINGTON_BROKER_CSV);
    expect(units).toHaveLength(3);
    expect(units[0]?.unitCode).toBe("1101");
    expect(units[0]?.floorplan).toBe("A1");
    expect(units[0]?.status).toBe("OCCUPIED");
    expect(units[0]?.marketRent).toBe(1185_00n);
    expect(units[0]?.inPlaceRent).toBe(1150_00n);
    expect(units[1]?.status).toBe("VACANT");
    expect(units[2]?.status).toBe("OCCUPIED");
    expect(units[2]?.marketRent).toBe(1375_00n);
  });

  it("extracts the Resi RR sheet from a Harrington workbook", () => {
    const csv = workbookToCsv(harringtonRentRollWorkbook(), "RR_-_Harrington_-_12.31.19_-_Resi.xlsx");
    expect(csv).toMatch(/Unit/);
    expect(csv).toMatch(/Market Rent/);
    const units = parseRentRollCsv(csv);
    expect(units).toHaveLength(5);
    expect(units.map((u) => u.status)).toEqual(["OCCUPIED", "VACANT", "OCCUPIED", "OCCUPIED", "DOWN"]);
    expect(units[3]?.bathsTenths).toBe(25);
    expect(units[1]?.inPlaceRent).toBe(0n);
  });

  it("maps a Yardi/MRI Resi workbook (two-row headers, Charges, comma SF, duplicate charge rows)", () => {
    const csv = workbookToCsv(harringtonYardiResiWorkbook(), "RR_-_Harrington_-_12.31.19_-_Resi.xlsx");
    const units = parseRentRollCsv(csv);
    expect(units).toHaveLength(5);
    expect(units.map((u) => u.unitCode)).toEqual(["1-101", "1-102", "1-201", "1-202", "1-301"]);
    expect(units[0]?.inPlaceRent).toBe(1225_00n);
    expect(units[0]?.sqft).toBe(750);
    expect(units[2]?.sqft).toBe(1050);
    expect(units[2]?.inPlaceRent).toBe(1465_00n);
    expect(units[2]?.bathsTenths).toBe(20);
    expect(units[3]?.bathsTenths).toBe(25);
    expect(units[4]?.status).toBe("DOWN");
  });

  it("prefers redIQ machine headers (R9 UnitID/MktRent/InPlaceRent/OccStatus) over human R8", () => {
    const units = buildHarringtonRediqUnits();
    expect(units).toHaveLength(HARRINGTON_REDIQ_UNIT_COUNT);
    const csv = workbookToCsv(harringtonRediqRentRollWorkbook(), "RR_-_Harrington_-_12.31.19_-_Resi.xlsx");
    expect(csv.split(/\r?\n/)[0]).toMatch(/UnitID/);
    expect(csv.split(/\r?\n/)[0]).toMatch(/MktRent/);
    expect(csv.split(/\r?\n/)[0]).not.toMatch(/Unit No/);
    const parsed = parseRentRollCsv(csv);
    expect(parsed).toHaveLength(175);
    expect(parsed[0]?.unitCode).toBe("A-01");
    expect(parsed.find((u) => u.bathsTenths === 15)).toBeTruthy();
    expect(parsed.find((u) => u.bathsTenths === 25)).toBeTruthy();
    expect(parsed.some((u) => u.status === "OCCUPIED")).toBe(true);
    expect(parsed.some((u) => u.status === "VACANT")).toBe(true);
    const wb = read(harringtonRediqRentRollWorkbook(), { type: "buffer", raw: false });
    const selected = selectRentRollSheet(wb);
    expect(selected?.name).toBe("Rent Roll");
    const found = findRentRollHeader(selected!.rows);
    expect(found?.headers).toContain("UnitID");
    expect(found?.headers).toContain("OccStatus");
    const onDisk = readFileSync(resolve("data/samples/harrington/RR_-_Harrington_-_12.31.19_-_Resi.xlsx"));
    expect(parseRentRollCsv(workbookToCsv(onDisk, "RR_-_Harrington_-_12.31.19_-_Resi.xlsx"))).toHaveLength(175);
  });

  it("surfaces detected headers when the sheet is not a rent roll", () => {
    expect(() => workbookToCsv(unmappableWorkbook(), "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx")).toThrow(
      /could not map columns/i,
    );
    expect(() => parseRentRollCsv("Property,Address,Notes\nHarrington,Dallas,OM only\n")).toThrow(CsvParseError);
    expect(() => parseRentRollCsv("Property,Address,Notes\nHarrington,Dallas,OM only\n")).toThrow(
      /could not map columns: unit\. Detected headers: Property, Address, Notes/i,
    );
  });
});
