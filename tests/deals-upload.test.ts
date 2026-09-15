import { POST } from "@/app/api/deals/intake/files/route";
import { applyStructuredData } from "@/lib/deals/apply";
import { autoIngestIntake } from "@/lib/deals/auto-ingest";
import { createSpeDeal } from "@/lib/deals/create-spe";
import { createIntake, getIntake, updateIntake } from "@/lib/deals/intake";
import { readIntakeFileBytes, removeIntakeFile, storeIntakeFile } from "@/lib/deals/files";
import { INTAKE_MAX_BYTES } from "@/lib/deals/types";
import { fileTooLargeMessage, UNTITLED_DEAL_NAME } from "@/lib/deals/upload-client";
import { assertReadableWorkbook, workbookToCsv } from "@/lib/deals/workbook";
import { describeFileStore, getStoredFile, putStoredFile, resolveFileStoreBackend } from "@/lib/file-store";
import { prisma } from "@/lib/prisma";
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDashboardForEntity } from "@/lib/dashboards";
import {
  HARRINGTON_REDIQ_UNIT_COUNT,
  harringtonRediqRentRollWorkbook,
  harringtonRentRollWorkbook,
  harringtonT12Workbook,
  harringtonYardiPlReport1Workbook,
  harringtonYardiResiWorkbook,
  harringtonYardiT12ExtWorkbook,
  unmappableWorkbook,
} from "./fixtures/harrington-rent-roll";
import {
  HAMPTON_LEASE_CHARGES_OCCUPIED,
  HAMPTON_LEASE_CHARGES_UNIT_COUNT,
  hamptonLeaseChargesWorkbook,
} from "./fixtures/hampton-lease-charges";
import { CANONICAL_WORKBOOK_FILENAME } from "@/lib/rent-roll-workbook";
import { resolveReportScope } from "@/lib/reports-server";

const intakeIds: string[] = [];
const blobIds: string[] = [];
const entityIds: string[] = [];

const MINI_PDF = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

afterAll(async () => {
  if (intakeIds.length) {
    const files = await prisma.dealIntakeFile.findMany({ where: { intakeId: { in: intakeIds } } });
    for (const file of files) {
      await removeIntakeFile(file.id).catch(() => undefined);
    }
    await prisma.dealIntake.deleteMany({ where: { id: { in: intakeIds } } });
  }
  if (blobIds.length) {
    await prisma.storedBlob.deleteMany({ where: { id: { in: blobIds } } });
  }
  if (entityIds.length) {
    await prisma.dealIntake.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.vaultDocument.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.unit.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: { in: entityIds } } } });
    await prisma.period.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.account.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
  }
  await prisma.$disconnect();
});

describe("durable file store", () => {
  it("defaults to local FS off Vercel and db on Vercel", () => {
    expect(resolveFileStoreBackend({} as NodeJS.ProcessEnv)).toBe("fs");
    expect(resolveFileStoreBackend({ VERCEL: "1" } as NodeJS.ProcessEnv)).toBe("db");
    expect(resolveFileStoreBackend({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" } as NodeJS.ProcessEnv)).toBe("blob");
    expect(resolveFileStoreBackend({ RCP_FILE_STORE: "db", VERCEL: "1" } as NodeJS.ProcessEnv)).toBe("db");
    expect(describeFileStore({})).toMatch(/Local filesystem/);
    expect(describeFileStore({ VERCEL: "1" })).toMatch(/StoredBlob/);
  });

  it("round-trips bytes on the default backend", async () => {
    const key = `_test/file-store-${Date.now()}.txt`;
    const path = await putStoredFile(key, Buffer.from("hello-vault"), "text/plain");
    const bytes = await getStoredFile(path);
    expect(bytes.toString("utf8")).toBe("hello-vault");
    if (path.startsWith("db:")) blobIds.push(path.slice(3));
  });
});

describe("Add Deal intake upload", () => {
  it("stores a rent-roll CSV and a PDF through storeIntakeFile and reads them back", async () => {
    const csv = readFileSync(resolve("data/samples/rent-roll.csv"));
    const intake = await createIntake({
      goal: "value_add",
      targetPeriod: "2026-08",
      speName: "Upload Regression LLC",
      speCode: `SPE-U${Date.now().toString(36).toUpperCase().slice(-4)}`.slice(0, 12),
      unitCount: 8,
      parentOpCoCode: "RCP-OPCO",
      sources: ["upload"],
    });
    intakeIds.push(intake.id);

    const rentRoll = await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "willow-rent-roll.csv",
      mimeType: "text/csv",
      bytes: csv,
    });
    const pdf = await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "first-mortgage-note.pdf",
      mimeType: "application/pdf",
      bytes: MINI_PDF,
      classification: "loan_doc",
    });

    expect(rentRoll.classification).toBe("rent_roll_csv");
    expect(rentRoll.status).toBe("stored");
    expect(rentRoll.storagePath).not.toBe("pending");
    expect(pdf.classification).toBe("loan_doc");

    const csvRead = await readIntakeFileBytes(rentRoll.id);
    const pdfRead = await readIntakeFileBytes(pdf.id);
    expect(csvRead?.bytes.equals(csv)).toBe(true);
    expect(pdfRead?.bytes.equals(MINI_PDF)).toBe(true);
    expect(csvRead?.bytes.toString("utf8")).toMatch(/unit_id/);
    expect(pdfRead?.bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("POST /api/deals/intake/files accepts CSV + PDF and returns stored rows", async () => {
    const csv = readFileSync(resolve("data/samples/rent-roll.csv"));
    const intake = await createIntake({
      goal: "stabilize",
      targetPeriod: "2026-08",
      speName: "Http Upload LLC",
      speCode: `SPE-H${Date.now().toString(36).toUpperCase().slice(-4)}`.slice(0, 12),
      unitCount: 4,
      parentOpCoCode: "RCP-OPCO",
      sources: ["upload"],
    });
    intakeIds.push(intake.id);

    const body = new FormData();
    body.set("intakeId", intake.id);
    body.set("source", "upload");
    body.append("file", new File([new Uint8Array(csv)], "willow-rent-roll.csv", { type: "text/csv" }));
    body.append("file", new File([new Uint8Array(MINI_PDF)], "loan-note.pdf", { type: "application/pdf" }));

    const res = await POST(new Request("http://localhost/api/deals/intake/files", { method: "POST", body }));
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      stored: { id: string; filename: string; classification: string }[];
      intake: { files: { filename: string; classification: string }[] };
    };
    expect(json.stored).toHaveLength(2);
    expect(json.stored.map((s) => s.filename).sort()).toEqual(["loan-note.pdf", "willow-rent-roll.csv"]);
    expect(json.stored.find((s) => s.filename.endsWith(".csv"))?.classification).toBe("rent_roll_csv");
    expect(json.intake.files).toHaveLength(2);

    const csvRow = json.stored.find((s) => s.filename.endsWith(".csv"));
    const loaded = csvRow ? await readIntakeFileBytes(csvRow.id) : null;
    expect(loaded?.bytes.equals(csv)).toBe(true);
  });

  it("stores intake bytes in the database when RCP_FILE_STORE=db", async () => {
    const previous = process.env.RCP_FILE_STORE;
    process.env.RCP_FILE_STORE = "db";
    try {
      const intake = await createIntake({
        goal: "stabilize",
        targetPeriod: "2026-08",
        speName: "Db Store LLC",
        speCode: `SPE-D${Date.now().toString(36).toUpperCase().slice(-4)}`.slice(0, 12),
        sources: ["upload"],
      });
      intakeIds.push(intake.id);
      const file = await storeIntakeFile({
        intakeId: intake.id,
        source: "upload",
        filename: "db-rent-roll.csv",
        mimeType: "text/csv",
        bytes: Buffer.from("unit_id,status\n101,OCCUPIED\n"),
        classification: "rent_roll_csv",
      });
      expect(file.storagePath.startsWith("db:")).toBe(true);
      blobIds.push(file.storagePath.slice(3));
      const loaded = await readIntakeFileBytes(file.id);
      expect(loaded?.bytes.toString("utf8")).toMatch(/unit_id/);
    } finally {
      if (previous === undefined) delete process.env.RCP_FILE_STORE;
      else process.env.RCP_FILE_STORE = previous;
    }
  });

  it("rejects an empty file with a visible error", async () => {
    const intake = await createIntake({
      goal: "stabilize",
      targetPeriod: "2026-08",
      speName: "Empty Upload LLC",
      speCode: `SPE-E${Date.now().toString(36).toUpperCase().slice(-4)}`.slice(0, 12),
      sources: ["upload"],
    });
    intakeIds.push(intake.id);
    await expect(
      storeIntakeFile({
        intakeId: intake.id,
        source: "upload",
        filename: "blank.csv",
        mimeType: "text/csv",
        bytes: Buffer.alloc(0),
      }),
    ).rejects.toThrow(/empty/i);
  });

  it("parses the sample rent-roll xlsx and imports it on apply", async () => {
    const xlsx = readFileSync(resolve("data/samples/rent-roll.xlsx"));
    expect(workbookToCsv(xlsx, "rent-roll.xlsx")).toMatch(/unit_id/);
    expect(workbookToCsv(readFileSync(resolve("data/samples/budget.xlsx")), "budget.xlsx")).toMatch(/account_code/);

    const suffix = Date.now().toString(36).toUpperCase().slice(-3);
    const { entity } = await createSpeDeal({
      name: `Xlsx Court ${suffix} LLC`,
      code: `SPE-X${suffix}`,
      unitCount: 4,
      goal: "stabilize",
      targetPeriod: "2026-08",
    });
    entityIds.push(entity.id);

    const intake = await createIntake({
      goal: "stabilize",
      targetPeriod: "2026-08",
      speName: entity.name,
      speCode: entity.code,
      sources: ["upload"],
    });
    intakeIds.push(intake.id);
    await updateIntake(intake.id, { entityId: entity.id });
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "willow-rent-roll.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: xlsx,
      classification: "rent_roll_csv",
    });

    const applied = await applyStructuredData({
      intakeId: intake.id,
      confirmReplace: true,
      importRentRoll: true,
      importBudget: false,
      saveLoan: false,
    });
    expect(applied.results.some((row) => row.kind === "rent_roll" && (row.imported ?? 0) >= 1)).toBe(true);
    const units = await prisma.unit.count({ where: { entityId: entity.id } });
    expect(units).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/deals/intake/files accepts the sample rent-roll xlsx", async () => {
    const xlsx = readFileSync(resolve("data/samples/rent-roll.xlsx"));
    const intake = await createIntake({
      goal: "stabilize",
      targetPeriod: "2026-08",
      speName: "Http Xlsx LLC",
      speCode: `SPE-Y${Date.now().toString(36).toUpperCase().slice(-4)}`.slice(0, 12),
      sources: ["upload"],
    });
    intakeIds.push(intake.id);

    const body = new FormData();
    body.set("intakeId", intake.id);
    body.set("source", "upload");
    body.append(
      "file",
      new File([new Uint8Array(xlsx)], "willow-rent-roll.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    const res = await POST(new Request("http://localhost/api/deals/intake/files", { method: "POST", body }));
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      stored: { filename: string; classification: string }[];
    };
    expect(json.stored).toHaveLength(1);
    expect(json.stored[0]?.filename).toBe("willow-rent-roll.xlsx");
    expect(json.stored[0]?.classification).toBe("rent_roll_csv");
  });

  it("rejects corrupt and password-protected workbooks with a visible error", async () => {
    expect(() => assertReadableWorkbook(Buffer.from("not-an-excel-file"), "broken.xlsx")).toThrow(/not a readable Excel workbook/i);
    expect(() =>
      assertReadableWorkbook(Buffer.from("PK\u0003\u0004EncryptedPackage"), "secret.xlsx"),
    ).toThrow(/password-protected/i);

    const intake = await createIntake({
      goal: "stabilize",
      targetPeriod: "2026-08",
      speName: "Bad Workbook LLC",
      speCode: `SPE-Z${Date.now().toString(36).toUpperCase().slice(-4)}`.slice(0, 12),
      sources: ["upload"],
    });
    intakeIds.push(intake.id);
    await expect(
      storeIntakeFile({
        intakeId: intake.id,
        source: "upload",
        filename: "corrupt.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: Buffer.from("PK this is not a workbook"),
      }),
    ).rejects.toThrow(/not a readable Excel workbook|password-protected/i);
  });

  it("stores a file on a draft that has no SPE name or code", async () => {
    const intake = await createIntake({
      goal: "value_add",
      targetPeriod: "2026-08",
      sources: ["upload"],
    });
    intakeIds.push(intake.id);
    expect(intake.speName).toBe(UNTITLED_DEAL_NAME);
    expect(intake.speCode).toBeNull();

    const file = await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "harrington-rent-roll.csv",
      mimeType: "text/csv",
      bytes: Buffer.from("unit_id,status\n101,OCCUPIED\n"),
    });
    expect(file.status).toBe("stored");
    expect(file.filename).toBe("harrington-rent-roll.csv");
  });

  it("POST /api/deals/intake/files creates an Untitled deal when intakeId is omitted", async () => {
    const csv = readFileSync(resolve("data/samples/rent-roll.csv"));
    const body = new FormData();
    body.set("source", "upload");
    body.append("file", new File([new Uint8Array(csv)], "willow-rent-roll.csv", { type: "text/csv" }));

    const res = await POST(new Request("http://localhost/api/deals/intake/files", { method: "POST", body }));
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      stored: { filename: string }[];
      intake: { id: string; speName: string | null; speCode: string | null };
    };
    intakeIds.push(json.intake.id);
    expect(json.stored).toHaveLength(1);
    expect(json.intake.speName).toBe(UNTITLED_DEAL_NAME);
    expect(json.intake.speCode).toBeNull();
  });

  it("POST accepts sequential single-file uploads onto one unnamed intake", async () => {
    const intake = await createIntake({ sources: ["upload"] });
    intakeIds.push(intake.id);
    const payloads = [
      { name: "a-rent-roll.csv", bytes: Buffer.from("unit_id,status\n1,OCCUPIED\n"), type: "text/csv" },
      { name: "b-budget.csv", bytes: Buffer.from("account_code,amount\n4010,100\n"), type: "text/csv" },
      { name: "c-om.pdf", bytes: MINI_PDF, type: "application/pdf" },
    ];
    for (const file of payloads) {
      const body = new FormData();
      body.set("intakeId", intake.id);
      body.set("source", "upload");
      body.append("file", new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
      const res = await POST(new Request("http://localhost/api/deals/intake/files", { method: "POST", body }));
      expect(res.ok).toBe(true);
      const json = (await res.json()) as { stored: { filename: string }[] };
      expect(json.stored).toHaveLength(1);
      expect(json.stored[0]?.filename).toBe(file.name);
    }
    const latest = await getIntake(intake.id);
    expect(latest?.speName).toBe(UNTITLED_DEAL_NAME);
    expect(latest?.files).toHaveLength(3);
  });

  it("rejects an oversized file with File too large (max X MB)", async () => {
    const intake = await createIntake({ sources: ["upload"] });
    intakeIds.push(intake.id);
    await expect(
      storeIntakeFile({
        intakeId: intake.id,
        source: "upload",
        filename: "huge-om.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.alloc(INTAKE_MAX_BYTES + 1),
      }),
    ).rejects.toThrow(/File too large \(max 32 MB\)/);

    const res = await POST(
      new Request("http://localhost/api/deals/intake/files", {
        method: "POST",
        headers: { "content-length": String(INTAKE_MAX_BYTES + 2 * 1024 * 1024) },
        body: new FormData(),
      }),
    );
    expect(res.status).toBe(413);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe(fileTooLargeMessage());
  });

  it("auto-ingests Harrington-named files without a typed SPE name", async () => {
    const intake = await createIntake({ sources: ["upload"], goal: "value_add" });
    intakeIds.push(intake.id);
    expect(intake.speName).toBe(UNTITLED_DEAL_NAME);

    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "Life_at_Harrington_Park_OM_Offering.pdf",
      mimeType: "application/pdf",
      bytes: MINI_PDF,
    });
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: harringtonRentRollWorkbook(),
    });
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: harringtonT12Workbook(),
    });

    const report = await autoIngestIntake(intake.id);
    if (report.created.entityId) entityIds.push(report.created.entityId);
    expect(report.inferred.speName).toMatch(/Harrington Park/i);
    expect(report.created.entityCode).toMatch(/^SPE-/);
    expect(report.created.entityName).toMatch(/Harrington/i);
    expect(report.results.some((row) => row.kind === "rent_roll" && (row.imported ?? 0) >= 5)).toBe(true);
    expect(report.results.some((row) => row.kind === "t12_overlay" && (row.imported ?? 0) >= 1)).toBe(true);
    expect(report.gaps.some((gap) => /Rent roll wrote 5 Unit rows/i.test(gap))).toBe(true);
    expect(report.gaps.some((gap) => /T12|overlay|P&L/i.test(gap))).toBe(true);
    expect(report.gaps.some((gap) => /0 units/i.test(gap))).toBe(false);

    const latest = await getIntake(intake.id);
    expect(latest?.targetPeriod).toBe("2026-08");
    expect(latest?.entityId).toBeTruthy();
    const units = await prisma.unit.count({ where: { entityId: latest!.entityId! } });
    expect(units).toBe(5);
    const spe = await prisma.entity.findUnique({ where: { id: latest!.entityId! } });
    expect(spe?.unitCount).toBe(5);
    const vaulted = await prisma.vaultDocument.count({ where: { entityId: latest!.entityId! } });
    expect(vaulted).toBeGreaterThanOrEqual(1);
  });

  it("surfaces could not map columns with detected headers instead of silent vault-only success", async () => {
    const suffix = Date.now().toString(36).toUpperCase().slice(-3);
    const { entity } = await createSpeDeal({
      name: `Unmapped Court ${suffix} LLC`,
      code: `SPE-M${suffix}`,
      goal: "stabilize",
      targetPeriod: "2026-08",
    });
    entityIds.push(entity.id);
    const intake = await createIntake({
      goal: "stabilize",
      targetPeriod: "2026-08",
      speName: entity.name,
      speCode: entity.code,
      sources: ["upload"],
    });
    intakeIds.push(intake.id);
    await updateIntake(intake.id, { entityId: entity.id });
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "RR_-_Mystery_-_notes.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: unmappableWorkbook(),
      classification: "rent_roll_csv",
    });
    const applied = await applyStructuredData({
      intakeId: intake.id,
      confirmReplace: true,
      importRentRoll: true,
      importBudget: false,
      saveLoan: false,
      lenient: true,
    });
    const skipped = applied.results.find((row) => row.kind === "rent_roll")?.skipped ?? "";
    expect(skipped).toMatch(/could not map columns/i);
    expect(skipped).toMatch(/Detected headers/i);
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(0);
  });

  it("auto-ingests a Yardi/MRI Resi workbook into Unit rows", async () => {
    const intake = await createIntake({ sources: ["upload"], goal: "value_add" });
    intakeIds.push(intake.id);
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: harringtonYardiResiWorkbook(),
    });
    const report = await autoIngestIntake(intake.id);
    if (report.created.entityId) entityIds.push(report.created.entityId);
    expect(report.results.some((row) => row.kind === "rent_roll" && (row.imported ?? 0) >= 5)).toBe(true);
    const units = await prisma.unit.count({ where: { entityId: report.created.entityId! } });
    expect(units).toBe(5);
  });

  it("auto-ingests the redIQ Harrington RR (175 units) and Yardi T12 overlay", async () => {
    const intake = await createIntake({ sources: ["upload"], goal: "value_add" });
    intakeIds.push(intake.id);
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: harringtonRediqRentRollWorkbook(),
    });
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: harringtonYardiT12ExtWorkbook(),
    });
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "PL_-_The_Life_at_Harrington_Park_-_Dec_2018_to_Nov_2019.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: harringtonYardiPlReport1Workbook(),
    });

    const report = await autoIngestIntake(intake.id);
    if (report.created.entityId) entityIds.push(report.created.entityId);
    expect(report.results.some((row) => row.kind === "rent_roll" && row.imported === HARRINGTON_REDIQ_UNIT_COUNT)).toBe(
      true,
    );
    expect(report.results.some((row) => row.kind === "t12_overlay" && (row.imported ?? 0) >= 1)).toBe(true);

    const entityId = report.created.entityId!;
    expect(await prisma.unit.count({ where: { entityId } })).toBe(175);
    const spe = await prisma.entity.findUnique({ where: { id: entityId } });
    expect(spe?.unitCount).toBe(175);

    const overlayJournals = await prisma.journal.count({
      where: { entityId, source: "broker_t12_overlay" },
    });
    expect(overlayJournals).toBeGreaterThanOrEqual(1);

    const dash = await buildDashboardForEntity({
      entityId,
      entityType: "SPE",
      year: 2026,
      month: 8,
    });
    if (dash.kind !== "property") throw new Error("expected property dashboard");
    expect(dash.unitCount).toBe(175);
    expect(dash.brokerOverlay?.egi ?? 0n).toBeGreaterThan(0n);
    expect(dash.brokerOverlay?.noi ?? 0n).toBeGreaterThan(0n);
    const noiTile = dash.tiles.find((tile) => tile.id === "noi_period");
    const egiTile = dash.tiles.find((tile) => tile.id === "egi");
    expect(noiTile?.display).not.toMatch(/^\$0(\.00)?$/);
    expect(egiTile?.display).not.toMatch(/^\$0(\.00)?$/);
  });

  it("fails auto-ingest when a classified rent roll maps 0 units", async () => {
    const intake = await createIntake({ sources: ["upload"], goal: "value_add" });
    intakeIds.push(intake.id);
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "RR_-_Mystery_-_notes.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: unmappableWorkbook(),
    });
    await expect(autoIngestIntake(intake.id)).rejects.toThrow(/could not map columns/i);
    const latest = await getIntake(intake.id);
    if (latest?.entityId) entityIds.push(latest.entityId);
    expect(latest?.status).toBe("FAILED");
    expect(latest?.lastError ?? "").toMatch(/Detected headers/i);
    if (latest?.entityId) {
      expect(await prisma.unit.count({ where: { entityId: latest.entityId } })).toBe(0);
    }
  });

  it("opens a missing header period instead of throwing Period not found", async () => {
    const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
    if (!wbg) return;
    const scope = await resolveReportScope({
      entityId: wbg.id,
      year: 2019,
      month: 11,
      consolidated: false,
    });
    expect(scope.period.label).toBe("2019-11");
    expect(scope.period.status).toBe("OPEN");
  });

  it("auto-ingests a Hampton/Yardi Lease Charges workbook into canonical Units + vault template", async () => {
    const intake = await createIntake({ sources: ["upload"], goal: "value_add" });
    intakeIds.push(intake.id);
    await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "RR_-_Hampton_Gardens_-_Lease_Charges.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: hamptonLeaseChargesWorkbook(),
    });
    const report = await autoIngestIntake(intake.id);
    if (report.created.entityId) entityIds.push(report.created.entityId);
    const rr = report.results.find((row) => row.kind === "rent_roll");
    expect(rr?.imported).toBe(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    expect(rr?.dialect).toBe("yardi_lease_charges");
    expect(report.gaps.some((gap) => /Lease Charges/i.test(gap))).toBe(true);
    const units = await prisma.unit.findMany({ where: { entityId: report.created.entityId! } });
    expect(units).toHaveLength(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    expect(units.filter((u) => u.status === "OCCUPIED")).toHaveLength(HAMPTON_LEASE_CHARGES_OCCUPIED);
    const first = units.find((u) => u.unitCode === "171L725-1");
    expect(first?.inPlaceRent).toBe(975_00n);
    expect(first?.marketRent).toBe(1220_00n);
    expect(first?.sqft).toBe(540);
    expect(units.some((u) => u.unitCode === "FYL725-1")).toBe(true);
    expect(units.some((u) => /charge code|current\/notice\/vacant|summary of charges/i.test(u.unitCode))).toBe(false);
    expect(units.some((u) => /^r-[a-z]+$/i.test(u.unitCode))).toBe(false);
    const canonical = await prisma.vaultDocument.findFirst({
      where: { entityId: report.created.entityId!, filename: CANONICAL_WORKBOOK_FILENAME },
    });
    expect(canonical).toBeTruthy();
    const original = await prisma.vaultDocument.findFirst({
      where: {
        entityId: report.created.entityId!,
        kind: "rent_roll",
        NOT: { filename: CANONICAL_WORKBOOK_FILENAME },
      },
    });
    expect(original?.byteSize).toBeGreaterThan(0);
    expect(original?.filename).toMatch(/Hampton/i);
  });
});
