import { describe, expect, it } from "vitest";
import {
  isViableRentRollCandidate,
  rankVaultRentRollCandidate,
} from "@/lib/deals/rent-roll-candidates";
import { hamptonLeaseChargesWorkbook } from "./fixtures/hampton-lease-charges";
import { harringtonRediqRentRollWorkbook, unmappableWorkbook } from "./fixtures/harrington-rent-roll";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("vault rent-roll candidate ranking", () => {
  it("scores Hampton *RR* Kind Other above a T-12 operating statement Kind Other", () => {
    const rr = rankVaultRentRollCandidate({
      id: "rr",
      filename: "Hampton - RR 07.08.26.xlsx",
      kind: "other",
      mimeType: XLSX,
      bytes: hamptonLeaseChargesWorkbook(),
    });
    const os = rankVaultRentRollCandidate({
      id: "os",
      filename: "Hampton - June 2026 T-12 Operating Statement.xlsx",
      kind: "other",
      mimeType: XLSX,
      bytes: unmappableWorkbook(),
    });
    expect(rr.filenameHits).toBe(true);
    expect(rr.kindHits).toBe(false);
    expect(rr.dialect).toBe("yardi_lease_charges");
    expect(isViableRentRollCandidate(rr)).toBe(true);
    expect(isViableRentRollCandidate(os)).toBe(false);
    expect(rr.total).toBeGreaterThan(os.total);
  });

  it("treats a Kind Other title *RR* as a candidate even if the stored filename is generic", () => {
    const ranked = rankVaultRentRollCandidate({
      id: "titled",
      filename: "upload.xlsx",
      title: "Hampton - RR 07.08.26.xlsx",
      kind: "other",
      mimeType: XLSX,
      bytes: hamptonLeaseChargesWorkbook(),
    });
    expect(ranked.filenameHits).toBe(true);
    expect(ranked.kindHits).toBe(false);
    expect(isViableRentRollCandidate(ranked)).toBe(true);
  });

  it("still ranks a kind=rent_roll redIQ workbook as viable", () => {
    const ranked = rankVaultRentRollCandidate({
      id: "redi",
      filename: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      kind: "rent_roll",
      mimeType: XLSX,
      bytes: harringtonRediqRentRollWorkbook(),
    });
    expect(ranked.kindHits).toBe(true);
    expect(ranked.filenameHits).toBe(true);
    expect(ranked.dialect).toBe("redi_q_machine");
    expect(isViableRentRollCandidate(ranked)).toBe(true);
  });
});
