import { workbookToCsv } from "@/lib/deals/workbook";
import { CsvParseError, parseRentRollCsv } from "@rcp/properties";
import { describe, expect, it } from "vitest";
import {
  HARRINGTON_BROKER_CSV,
  harringtonBrokerPacketWorkbook,
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
