import { centsToDollarsInput, dollarFieldOnBlur, dollarFieldOnChange, dollarsInputToOptionalCents, typeDollarKeys } from "@/lib/waterfall-inputs";
import { describe, expect, it } from "vitest";

/** The old controlled input wrote cents back into the box on every key, so a trailing dot disappeared. */
function typeWithRoundTrip(keys: string): string {
  let text = "";
  for (const key of keys) {
    text = centsToDollarsInput(dollarsInputToOptionalCents(text + key));
  }
  return text;
}

describe("dollar inputs keep the decimal while typing", () => {
  it("keeps 1234.56 and 0.5 key by key", () => {
    const full = typeDollarKeys("1234.56");
    expect(full.text).toBe("1234.56");
    expect(full.cents).toBe(123_456n);
    const half = typeDollarKeys("0.5");
    expect(half.text).toBe("0.5");
    expect(half.cents).toBe(50n);
    expect(dollarFieldOnChange("1234.").text).toBe("1234.");
    expect(dollarFieldOnBlur("1234.56")).toEqual({ text: "1234.56", cents: 123_456n });
    expect(dollarFieldOnBlur("0.5")).toEqual({ text: "0.5", cents: 50n });
  });

  it("treats a blank box as null and keeps a typed zero", () => {
    expect(dollarFieldOnBlur("").cents).toBeNull();
    expect(dollarFieldOnBlur("").text).toBe("");
    expect(dollarFieldOnBlur("0")).toEqual({ text: "0", cents: 0n });
    expect(dollarFieldOnBlur("0.00")).toEqual({ text: "0", cents: 0n });
    expect(dollarFieldOnBlur("", { nullable: false })).toEqual({ text: "0", cents: 0n });
    expect(dollarsInputToOptionalCents("")).toBeNull();
    expect(dollarsInputToOptionalCents("0")).toBe(0n);
  });

  it("documents the old round-trip that dropped the decimal", () => {
    expect(typeWithRoundTrip("1234.56")).toBe("123456");
    expect(typeWithRoundTrip("0.5")).toBe("5");
  });
});
