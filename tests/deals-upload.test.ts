import { POST } from "@/app/api/deals/intake/files/route";
import { applyStructuredData } from "@/lib/deals/apply";
import { createSpeDeal } from "@/lib/deals/create-spe";
import { createIntake, updateIntake } from "@/lib/deals/intake";
import { readIntakeFileBytes, removeIntakeFile, storeIntakeFile } from "@/lib/deals/files";
import { workbookToCsv } from "@/lib/deals/workbook";
import { describeFileStore, getStoredFile, putStoredFile, resolveFileStoreBackend } from "@/lib/file-store";
import { prisma } from "@/lib/prisma";
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
});
