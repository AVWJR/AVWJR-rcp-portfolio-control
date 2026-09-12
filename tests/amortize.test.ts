import {
  amortizePeriod,
  buildAmortizationSchedule,
  currentPortionFromSchedule,
  currentPortionRollAmount,
  monthlyInterestCents,
  splitCurrentLt,
} from "@rcp/debt";
import { dollars } from "@rcp/ledger";
import { describe, expect, it } from "vitest";

describe("amortization helpers", () => {
  it("computes monthly interest in integer cents (half-up)", () => {
    const interest = monthlyInterestCents(dollars(17_000_000), 568);
    expect(interest).toBe(8_046_667n);
  });

  it("splits a payment into interest and principal", () => {
    const step = amortizePeriod({
      upbCents: dollars(17_000_000),
      annualRateBps: 568,
      paymentCents: dollars(100_500),
    });
    expect(step.interestCents + step.principalCents).toBe(dollars(100_500));
    expect(step.endingUpbCents).toBe(dollars(17_000_000) - step.principalCents);
  });

  it("builds a current-portion schedule from the next 12 principal amounts", () => {
    const rows = buildAmortizationSchedule({
      upbCents: dollars(16_980_000),
      annualRateBps: 568,
      paymentCents: dollars(100_500),
      startYear: 2026,
      startMonth: 9,
      periods: 12,
    });
    expect(rows).toHaveLength(12);
    const current = currentPortionFromSchedule(rows);
    const split = splitCurrentLt({
      upbCents: dollars(16_980_000),
      annualRateBps: 568,
      paymentCents: dollars(100_500),
      startYear: 2026,
      startMonth: 9,
    });
    expect(split.currentPortionCents).toBe(current);
    expect(split.currentPortionCents + split.longTermPortionCents).toBe(dollars(16_980_000));
  });

  it("rolls only the shortfall from LT into current", () => {
    const roll = currentPortionRollAmount({
      glCurrentCents: dollars(225_000),
      glLtCents: dollars(16_755_000),
      targetCurrentCents: dollars(245_000),
    });
    expect(roll).toBe(dollars(20_000));
  });
});
