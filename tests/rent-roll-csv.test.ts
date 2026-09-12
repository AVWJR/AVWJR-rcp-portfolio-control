import { dollars } from "@rcp/ledger";
import { CsvParseError, parseBudgetCsv, parseRentRollCsv, serializeRentRollCsv } from "@rcp/properties";
import { describe, expect, it } from "vitest";

const sample = `unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end,concession
101,A1,1,1.0,700,OCCUPIED,1285.00,1240.00,2025-09-01,2026-08-31,25.00
102,A1,1,1,700,VACANT,1285.00,0,,,0
103,B2,2,1.5,950,DOWN,0,0,,,0
`;

describe("rent-roll CSV import", () => {
  it("parses units into integer cents and bath tenths", () => {
    const units = parseRentRollCsv(sample);
    expect(units).toHaveLength(3);
    expect(units[0].marketRent).toBe(dollars(1285));
    expect(units[0].inPlaceRent).toBe(1285_00n - 45_00n);
    expect(units[0].concessionCents).toBe(dollars(25));
    expect(units[0].bathsTenths).toBe(10);
    expect(units[2].status).toBe("DOWN");
    expect(units[2].bathsTenths).toBe(15);
  });

  it("round-trips through serialize", () => {
    const units = parseRentRollCsv(sample);
    const again = parseRentRollCsv(serializeRentRollCsv(units));
    expect(again.map((u) => u.unitCode)).toEqual(["101", "102", "103"]);
    expect(again[0].marketRent).toBe(units[0].marketRent);
  });

  it("rejects in-place rent on vacant units", () => {
    expect(() =>
      parseRentRollCsv(`unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end
102,A,1,1,700,VACANT,1000,100,2026-01-01,2026-12-31
`),
    ).toThrow(CsvParseError);
  });

  it("rejects duplicate unit ids", () => {
    expect(() =>
      parseRentRollCsv(`unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end
101,A,1,1,700,OCCUPIED,1000,1000,2026-01-01,2026-12-31
101,A,1,1,700,VACANT,1000,0,,
`),
    ).toThrow(/duplicate unit_id/);
  });
});

describe("budget CSV import", () => {
  it("parses CoA amounts to cents", () => {
    const rows = parseBudgetCsv(`account_code,amount
4010,342000.00
4020,25000
5110,40000.50
`);
    expect(rows).toEqual([
      { accountCode: "4010", amount: dollars(342_000) },
      { accountCode: "4020", amount: dollars(25_000) },
      { accountCode: "5110", amount: 4_000_050n },
    ]);
  });
});
