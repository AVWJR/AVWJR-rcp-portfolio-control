import { INTAKE_MAX_BYTES, INTAKE_MAX_BYTES_LABEL, TYPICAL_OM_BYTES, VERCEL_MULTIPART_SAFE_BYTES } from "@/lib/deals/types";
import {
  blobTokenRequiredMessage,
  fileTooLargeMessage,
  formatFileMb,
  formatUploadFailure,
  initialUploadRows,
  isUntitledDealName,
  parseApiErrorText,
  requestExceedsIntakeLimit,
  shouldUseClientBlobUpload,
  suggestIdentityFromFilenames,
  workingTitle,
} from "@/lib/deals/upload-client";
import { describe, expect, it } from "vitest";

describe("Add Deal upload client helpers", () => {
  it("formats oversized files with the required product copy", () => {
    expect(fileTooLargeMessage()).toBe(`File too large (max ${INTAKE_MAX_BYTES_LABEL.replace(" MB", "")} MB)`);
    expect(fileTooLargeMessage()).toMatch(/File too large \(max 32 MB\)/);
    const rows = initialUploadRows([
      { name: "ok.pdf", size: 1024 },
      { name: "huge-om.pdf", size: INTAKE_MAX_BYTES + 1 },
      { name: "empty.xlsx", size: 0 },
    ]);
    expect(rows[0]?.progress).toBe("queued");
    expect(rows[1]?.progress).toBe("error");
    expect(rows[1]?.error).toBe("File too large (max 32 MB)");
    expect(rows[2]?.error).toMatch(/empty/i);
  });

  it("surfaces HTTP status and converts Failed to fetch into a stored-row message", () => {
    expect(formatUploadFailure({ status: 413, serverMessage: "File too large (max 32 MB)" })).toBe(
      "HTTP 413: File too large (max 32 MB)",
    );
    expect(formatUploadFailure({ status: 500, serverMessage: "Intake draft not found." })).toBe(
      "HTTP 500: Intake draft not found.",
    );
    expect(formatUploadFailure({ networkMessage: "Failed to fetch" })).toMatch(/HTTP request failed \(Failed to fetch\)/);
    expect(parseApiErrorText(413, "<html>Request Entity Too Large</html>")).toBe(
      blobTokenRequiredMessage({ filename: "Life_at_Harrington_Park_OM.pdf", byteSize: TYPICAL_OM_BYTES }),
    );
    expect(parseApiErrorText(413, "<html>Request Entity Too Large</html>")).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(parseApiErrorText(413, "<html>Request Entity Too Large</html>")).not.toMatch(/^HTTP 413/);
    expect(parseApiErrorText(404, JSON.stringify({ error: "Intake draft not found." }))).toBe(
      "HTTP 404: Intake draft not found.",
    );
  });

  it("treats anonymous drafts as Untitled deal until identity is entered", () => {
    expect(isUntitledDealName(null)).toBe(true);
    expect(isUntitledDealName("")).toBe(true);
    expect(isUntitledDealName("Untitled deal")).toBe(true);
    expect(workingTitle("")).toBe("Untitled deal");
    expect(workingTitle("Harrington Park LLC")).toBe("Harrington Park LLC");
  });

  it("prefills identity from Harrington-style filenames", () => {
    const name = suggestIdentityFromFilenames([
      "Life_at_Harrington_Park_OM_Offering.pdf",
      "PL_-_The_Life_at_Harrington_Park_-_Dec_2018_to_Nov_2019.xlsx",
      "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx",
    ]);
    expect(name).toMatch(/Harrington Park/i);
    expect(name).not.toMatch(/offering|xlsx|om/i);
    expect(name?.length).toBeGreaterThan(10);
  });

  it("flags a multipart body that exceeds the per-file cap plus overhead", () => {
    expect(requestExceedsIntakeLimit(INTAKE_MAX_BYTES)).toBe(false);
    expect(requestExceedsIntakeLimit(INTAKE_MAX_BYTES + 2 * 1024 * 1024)).toBe(true);
  });

  it("does not treat a 5.5 MB file or a 6 MB four-file drop as over the 32 MB per-file cap", () => {
    const om = 5.5 * 1024 * 1024;
    const xlsx = 180 * 1024;
    const rows = initialUploadRows([
      { name: "Life_at_Harrington_Park_OM.pdf", size: om },
      { name: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx", size: xlsx },
      { name: "T12_NOI.xlsx", size: xlsx },
      { name: "PL.xlsx", size: xlsx },
    ]);
    expect(rows.every((row) => row.progress === "queued")).toBe(true);
    expect(om + xlsx * 3).toBeLessThan(10 * 1024 * 1024);
    expect(requestExceedsIntakeLimit(om)).toBe(false);
  });

  it("routes files over ~3.5 MB to client Blob upload on Vercel or when Blob is configured", () => {
    const om = 5_605 * 1024;
    expect(formatFileMb(om)).toBe("5.5");
    expect(om).toBeGreaterThan(VERCEL_MULTIPART_SAFE_BYTES);
    expect(shouldUseClientBlobUpload(180 * 1024, { onVercel: true })).toBe(false);
    expect(shouldUseClientBlobUpload(om, { onVercel: false, blobConfigured: false })).toBe(false);
    expect(shouldUseClientBlobUpload(om, { onVercel: true })).toBe(true);
    expect(shouldUseClientBlobUpload(om, { blobConfigured: true })).toBe(true);
    expect(shouldUseClientBlobUpload(INTAKE_MAX_BYTES + 1, { onVercel: true })).toBe(false);
    expect(blobTokenRequiredMessage({ filename: "Life_at_Harrington_Park_OM.pdf", byteSize: om })).toBe(
      "OM is 5.5 MB — add BLOB_READ_WRITE_TOKEN in Vercel (Storage → Blob) or upload Excel first and add OM after Blob is connected",
    );
    expect(
      parseApiErrorText(413, "<html>Request Entity Too Large</html>", "Upload failed", {
        filename: "Life_at_Harrington_Park_OM.pdf",
        byteSize: om,
        blobConfigured: false,
      }),
    ).toMatch(/OM is 5\.5 MB — add BLOB_READ_WRITE_TOKEN/);
  });
});
