import { selectRentRollSheet, workbookToCsv } from "@/lib/deals/workbook";
import { CsvParseError, parseRentRollCsv, resolveRentRollHeader } from "@rcp/properties";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { read } from "xlsx";
import {
  HARRINGTON_BROKER_CSV,
  HARRINGTON_REDIQ_UNIT_COUNT,
  buildHarringtonRediqUnits,
  harringtonBrokerPacketWorkbook,
  harringtonRediqRentRollWorkbook,
  harringtonRentRollWorkbook,
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

  it("prefers redIQ Rent Roll R9 UnitID/MktRent/InPlaceRent/OccStatus over human R8", () => {
    const units = buildHarringtonRediqUnits();
    expect(units).toHaveLength(HARRINGTON_REDIQ_UNIT_COUNT);
    expect(units[0]?.unitId).toBe("A-01");
    expect(units[0]?.occStatus).toBe("Occupied");
    expect(units.some((u) => u.occStatus === "Vacant")).toBe(true);

    const csv = workbookToCsv(harringtonRediqRentRollWorkbook(), "RR_-_Harrington_-_12.31.19_-_Resi.xlsx");
    const headerLine = csv.split(/\r?\n/)[0] ?? "";
    expect(headerLine).toMatch(/UnitID/);
    expect(headerLine).toMatch(/MktRent/);
    expect(headerLine).toMatch(/InPlaceRent/);
    expect(headerLine).toMatch(/OccStatus/);
    expect(headerLine).not.toMatch(/Unit No/);

    const parsed = parseRentRollCsv(csv);
    expect(parsed).toHaveLength(175);
    expect(parsed[0]?.unitCode).toBe("A-01");
    expect(parsed[0]?.floorplan).toBe("A1");
    expect(parsed[0]?.status).toBe("OCCUPIED");
    expect(parsed.find((u) => u.bathsTenths === 15)).toBeTruthy();
    expect(parsed.find((u) => u.bathsTenths === 25)).toBeTruthy();
    expect(parsed.some((u) => u.status === "OCCUPIED")).toBe(true);
    expect(parsed.some((u) => u.status === "VACANT")).toBe(true);

    const wb = read(harringtonRediqRentRollWorkbook(), { type: "buffer", raw: false });
    const selected = selectRentRollSheet(wb);
    expect(selected?.name).toBe("Rent Roll");
    const found = resolveRentRollHeader(selected!.rows);
    expect(found?.headers).toContain("UnitID");
    expect(found?.headers).toContain("OccStatus");
    expect(found?.headers).toContain("MktRent");
    expect(found?.headers).toContain("InPlaceRent");

    const onDiskPath = resolve("data/samples/harrington/RR_-_Harrington_-_12.31.19_-_Resi.xlsx");
    if (existsSync(onDiskPath)) {
      const onDisk = readFileSync(onDiskPath);
      expect(parseRentRollCsv(workbookToCsv(onDisk, "RR_-_Harrington_-_12.31.19_-_Resi.xlsx"))).toHaveLength(175);
    }
  });

  it("maps the broker packet: two-row headers, Bldg/Unit, Occupied Y/N, T12 decoy tab", () => {
    const csv = workbookToCsv(harringtonBrokerPacketWorkbook(), "RR_-_Harrington_-_12.31.19_-_Resi.xlsx");
    expect(csv).toMatch(/Bldg/i);
    expect(csv).toMatch(/Market Rent/i);
    const units = parseRentRollCsv(csv);
    expect(units).toHaveLength(18);
    expect(units[0]?.unitCode).toBe("101");
    expect(units[0]?.floorplan).toBe("A1");
    expect(units[0]?.beds).toBe(1);
    expect(units[0]?.status).toBe("OCCUPIED");
    expect(units[4]?.status).toBe("VACANT");
    expect(units.filter((u) => u.status === "OCCUPIED")).toHaveLength(15);
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
