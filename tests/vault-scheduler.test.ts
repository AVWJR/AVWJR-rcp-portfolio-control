import {
  DEFAULT_SCHEDULED_JOBS,
  PHASE_F_SCHEDULER_TODO,
  PHASE_F_VAULT_TODO,
  SCHEDULED_PACK_IDS,
  VAULT_STATUS,
  isVaultKind,
  safeVaultFilename,
} from "@rcp/documents";
import { describe, expect, it } from "vitest";

describe("document vault", () => {
  it("replaces the Phase F vault TODO stub", () => {
    expect(PHASE_F_VAULT_TODO.includes("TODO(Phase F)")).toBe(false);
    expect(VAULT_STATUS).toBe("ready");
    expect(PHASE_F_VAULT_TODO).toMatch(/\/vault/);
  });

  it("accepts lease / loan / k1 / draw / insurance", () => {
    for (const kind of ["lease", "loan", "k1", "draw", "insurance", "other"]) {
      expect(isVaultKind(kind)).toBe(true);
    }
    expect(isVaultKind("bank_feed")).toBe(false);
  });

  it("sanitizes filenames", () => {
    expect(safeVaultFilename("a/b\\c?.txt")).toBe("a-b-c-.txt");
    expect(safeVaultFilename("   ")).toBe("document.bin");
  });
});

describe("scheduled reporting", () => {
  it("defines monthly investor and quarterly lender jobs", () => {
    expect(SCHEDULED_PACK_IDS).toEqual(["monthly_investor", "quarterly_lender"]);
    expect(DEFAULT_SCHEDULED_JOBS.map((j) => j.packId).sort()).toEqual(["monthly_investor", "quarterly_lender"].sort());
    expect(PHASE_F_SCHEDULER_TODO.includes("TODO(Phase F)")).toBe(false);
    expect(PHASE_F_SCHEDULER_TODO).toMatch(/reports:run/);
  });
});
