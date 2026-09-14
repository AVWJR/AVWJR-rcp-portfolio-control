import {
  DEFAULT_SCHEDULED_JOBS,
  PHASE_F_SCHEDULER_TODO,
  PHASE_F_VAULT_TODO,
  SCHEDULED_PACK_IDS,
  VAULT_STATUS,
  guessVaultKind,
  isVaultKind,
  looksLikeOmCimFilename,
  looksLikeRentRollFilename,
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

  it("prefers om_cim when the filename contains _OM_ or an offering memo", () => {
    expect(looksLikeOmCimFilename("Life_at_Harrington_Park_OM_Offering.pdf")).toBe(true);
    expect(looksLikeOmCimFilename("Life_at_Harrington_Park_OM.pdf")).toBe(true);
    expect(looksLikeOmCimFilename("Harrington_Park_offering_memorandum.pdf")).toBe(true);
    expect(looksLikeOmCimFilename("RR_-_Harrington_-_12.31.19_-_Resi.xlsx")).toBe(false);
    expect(guessVaultKind("Life_at_Harrington_Park_OM_….pdf", "other")).toBe("om_cim");
    expect(guessVaultKind("lease-abstract.pdf", "lease")).toBe("lease");
    expect(guessVaultKind("notes.txt", "other")).toBe("other");
  });

  it("treats *RR* / lease-charges filenames as rent rolls even when Kind is Other", () => {
    expect(looksLikeRentRollFilename("Hampton - RR 07.08.26.xlsx")).toBe(true);
    expect(looksLikeRentRollFilename("Hampton – RR 07.08.26.xlsx")).toBe(true);
    expect(looksLikeRentRollFilename("RR_-_Harrington_-_12.31.19_-_Resi.xlsx")).toBe(true);
    expect(looksLikeRentRollFilename("willow-rent-roll.csv")).toBe(true);
    expect(looksLikeRentRollFilename("Hampton_Gardens_Lease_Charges.xlsx")).toBe(true);
    expect(looksLikeRentRollFilename("Hampton - June 2026 T-12 Operating Statement.xlsx")).toBe(false);
    expect(looksLikeRentRollFilename("Harrington_Park_notes.xlsx")).toBe(false);
    expect(guessVaultKind("Hampton - RR 07.08.26.xlsx", "other")).toBe("rent_roll");
    expect(guessVaultKind("Hampton - June 2026 T-12 Operating Statement.xlsx", "other")).toBe("other");
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
