import {
  SPE_RENT_ROLL_SPECS,
  assertDemoRentRoll,
  buildDemoRentRoll,
  rentRollConcessions,
  rentRollGpr,
  rentRollVacancyLoss,
} from "@rcp/properties";
import { describe, expect, it } from "vitest";

describe("seed rent rolls", () => {
  it("hits unit counts and GL-aligned GPR / vacancy / concessions", () => {
    for (const spec of SPE_RENT_ROLL_SPECS) {
      const units = buildDemoRentRoll(spec);
      expect(() => assertDemoRentRoll(units, spec)).not.toThrow();
      expect(units).toHaveLength(spec.unitCount);
      expect(rentRollGpr(units)).toBe(spec.gpr);
      expect(rentRollVacancyLoss(units)).toBe(spec.vacancy);
      expect(rentRollConcessions(units)).toBe(spec.concessions);
    }
  });
});
