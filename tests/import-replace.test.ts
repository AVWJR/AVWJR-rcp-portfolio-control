import { ReplaceRequiresConfirmError, assertReplaceConfirmed } from "../src/lib/import-guard";
import { describe, expect, it } from "vitest";

describe("CSV full-replace guard", () => {
  it("blocks a silent replace when rows already exist", () => {
    expect(() =>
      assertReplaceConfirmed({ existingCount: 264, kind: "rent-roll" }),
    ).toThrow(ReplaceRequiresConfirmError);
  });

  it("allows the first import and an explicit confirm", () => {
    expect(() =>
      assertReplaceConfirmed({ existingCount: 0, kind: "budget" }),
    ).not.toThrow();
    expect(() =>
      assertReplaceConfirmed({ existingCount: 12, kind: "budget", confirmReplace: true }),
    ).not.toThrow();
  });
});
