import { dollars } from "@rcp/ledger";
import {
  bookEconomicOccupancy,
  breakevenOccupancy,
  lossToLease,
  physicalOccupancyBps,
  rentRollConcessions,
  rentRollEconomicOccupancyBps,
  rentRollGpr,
  rentRollVacancyLoss,
  summarizeRentRoll,
  type UnitSnapshot,
} from "@rcp/properties";
import { describe, expect, it } from "vitest";

function unit(partial: Partial<UnitSnapshot> & Pick<UnitSnapshot, "unitCode" | "status">): UnitSnapshot {
  return {
    floorplan: "A",
    beds: 1,
    bathsTenths: 10,
    sqft: 700,
    marketRent: dollars(1000),
    inPlaceRent: partial.status === "OCCUPIED" ? dollars(950) : 0n,
    leaseStart: null,
    leaseEnd: null,
    concessionCents: 0n,
    ...partial,
  };
}

describe("rent-roll occupancy and loss-to-lease", () => {
  const units: UnitSnapshot[] = [
    unit({ unitCode: "101", status: "OCCUPIED", marketRent: dollars(1000), inPlaceRent: dollars(900), concessionCents: dollars(50) }),
    unit({ unitCode: "102", status: "OCCUPIED", marketRent: dollars(1000), inPlaceRent: dollars(1000) }),
    unit({ unitCode: "103", status: "VACANT", marketRent: dollars(1000) }),
    unit({ unitCode: "104", status: "DOWN", marketRent: 0n }),
  ];

  it("computes physical occupancy on rentable units only", () => {
    // 2 occupied / 3 rentable = 6667 bps
    expect(physicalOccupancyBps(units)).toBe(Math.round((2 * 10_000) / 3));
  });

  it("treats vacant market rent as vacancy loss and ignores DOWN", () => {
    expect(rentRollVacancyLoss(units)).toBe(dollars(1000));
    expect(rentRollGpr(units)).toBe(dollars(3000));
  });

  it("computes loss-to-lease only on occupied units below market", () => {
    expect(lossToLease(units)).toBe(dollars(100));
  });

  it("computes rent-roll economic occupancy analog as (in-place − concessions) / GPR", () => {
    // in-place 1900 − concession 50 = 1850; GPR 3000 → 6166 bps
    expect(rentRollConcessions(units)).toBe(dollars(50));
    expect(rentRollEconomicOccupancyBps(units)).toBe(Number((dollars(1850) * 10_000n) / dollars(3000)));
  });

  it("uses EGI/GPR for book economic occupancy", () => {
    const book = bookEconomicOccupancy(dollars(900), dollars(1000));
    expect(book.economicOccupancyBps).toBe(9000);
    expect(book.economicOccupancyBasis).toBe("egi_over_gpr");
    expect(book.source).toBe("gl");
  });

  it("computes breakeven occupancy from OpEx + DS − other income over GPR", () => {
    const be = breakevenOccupancy({
      opex: dollars(400),
      interest: dollars(200),
      principalPaydown: dollars(50),
      otherIncome: dollars(50),
      gpr: dollars(1000),
    });
    expect(be.debtService).toBe(dollars(250));
    expect(be.breakevenOccupancyBps).toBe(6000);
  });

  it("summarizes a rent roll without inventing delinquency", () => {
    const kpis = summarizeRentRoll(units);
    expect(kpis.source).toBe("rent_roll");
    expect(kpis.downCount).toBe(1);
    expect(kpis.unitCount).toBe(4);
  });
});
