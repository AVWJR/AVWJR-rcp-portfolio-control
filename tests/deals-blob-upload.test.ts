import { POST as blobHandlePost } from "@/app/api/deals/intake/blob/route";
import { POST as filesPost } from "@/app/api/deals/intake/files/route";
import { GET as providersGet } from "@/app/api/deals/providers/route";
import { createIntake } from "@/lib/deals/intake";
import { removeIntakeFile, storeIntakeFileFromBlob } from "@/lib/deals/files";
import { VERCEL_MULTIPART_SAFE_BYTES } from "@/lib/deals/types";
import { blobTokenRequiredMessage, shouldUseClientBlobUpload } from "@/lib/deals/upload-client";
import { isTrustedBlobUrl, blobStoragePath } from "@/lib/file-store";
import { prisma } from "@/lib/prisma";
import { afterAll, describe, expect, it, vi } from "vitest";

const MINI_PDF = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const BLOB_URL = "https://abc123.blob.vercel-storage.com/rcp-intake/demo/Life_at_Harrington_Park_OM.pdf";

vi.mock("@/lib/file-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-store")>();
  return {
    ...actual,
    getStoredFile: vi.fn(async (storagePath: string) => {
      if (String(storagePath).startsWith("blob:")) {
        return Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
      }
      return actual.getStoredFile(storagePath);
    }),
  };
});

const intakeIds: string[] = [];

afterAll(async () => {
  if (intakeIds.length) {
    const files = await prisma.dealIntakeFile.findMany({ where: { intakeId: { in: intakeIds } } });
    for (const file of files) {
      await removeIntakeFile(file.id).catch(() => undefined);
    }
    await prisma.dealIntake.deleteMany({ where: { id: { in: intakeIds } } });
  }
  await prisma.$disconnect();
});

describe("Vercel Blob client-upload routing", () => {
  it("trusts Vercel Blob hosts and prefixes storage paths", () => {
    expect(isTrustedBlobUrl(BLOB_URL)).toBe(true);
    expect(isTrustedBlobUrl("https://store.public.blob.vercel-storage.com/om.pdf")).toBe(true);
    expect(isTrustedBlobUrl("https://evil.example/om.pdf")).toBe(false);
    expect(isTrustedBlobUrl("http://abc123.blob.vercel-storage.com/om.pdf")).toBe(false);
    expect(blobStoragePath(BLOB_URL)).toBe(`blob:${BLOB_URL}`);
  });

  it("GET /api/deals/providers reports Blob + threshold flags", async () => {
    const res = await providersGet();
    const json = (await res.json()) as {
      blobConfigured: boolean;
      onVercel: boolean;
      clientUploadThresholdBytes: number;
      vercelBodyLimitBytes: number;
    };
    expect(json.blobConfigured).toBe(Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()));
    expect(json.clientUploadThresholdBytes).toBe(VERCEL_MULTIPART_SAFE_BYTES);
    expect(json.vercelBodyLimitBytes).toBe(Math.round(4.5 * 1024 * 1024));
    expect(typeof json.onVercel).toBe("boolean");
  });

  it("POST /api/deals/intake/blob without a token returns the Principal copy", async () => {
    const previous = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const res = await blobHandlePost(
        new Request("http://localhost/api/deals/intake/blob", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: {
              pathname: "rcp-intake/x/om.pdf",
              clientPayload: JSON.stringify({
                filename: "Life_at_Harrington_Park_OM.pdf",
                byteSize: 5_605 * 1024,
              }),
              multipart: true,
            },
          }),
        }),
      );
      expect(res.status).toBe(503);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe(
        blobTokenRequiredMessage({ filename: "Life_at_Harrington_Park_OM.pdf", byteSize: 5_605 * 1024 }),
      );
    } finally {
      if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = previous;
    }
  });

  it("stores a blob URL reference without putting bytes through multipart", async () => {
    const intake = await createIntake({ sources: ["upload"] });
    intakeIds.push(intake.id);
    const file = await storeIntakeFileFromBlob({
      intakeId: intake.id,
      source: "upload",
      filename: "Life_at_Harrington_Park_OM_Offering.pdf",
      mimeType: "application/pdf",
      blobUrl: BLOB_URL,
      bytes: MINI_PDF,
      classification: "om_cim",
    });
    expect(file.classification).toBe("om_cim");
    expect(file.storagePath).toBe(`blob:${BLOB_URL}`);
    expect(file.remoteId).toBe(BLOB_URL);
    expect(file.status).toBe("stored");
  });

  it("POST /api/deals/intake/files JSON path registers a mocked blob URL", async () => {
    const res = await filesPost(
      new Request("http://localhost/api/deals/intake/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "upload",
          filename: "Life_at_Harrington_Park_OM_Offering.pdf",
          mimeType: "application/pdf",
          byteSize: MINI_PDF.length,
          blobUrl: BLOB_URL,
        }),
      }),
    );
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      stored: { filename: string; classification: string; storagePath?: string }[];
      intake: { id: string };
    };
    intakeIds.push(json.intake.id);
    expect(json.stored).toHaveLength(1);
    expect(json.stored[0]?.filename).toBe("Life_at_Harrington_Park_OM_Offering.pdf");
    expect(json.stored[0]?.classification).toBe("om_cim");
    expect(json.stored[0]?.storagePath).toBe(`blob:${BLOB_URL}`);
    expect(shouldUseClientBlobUpload(5.5 * 1024 * 1024, { onVercel: true })).toBe(true);
  });

  it("rejects a 5.5 MB multipart on Vercel without a token using Principal copy", async () => {
    const previousVercel = process.env.VERCEL;
    const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.VERCEL = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const res = await filesPost(
        new Request("http://localhost/api/deals/intake/files", {
          method: "POST",
          headers: { "content-length": String(5_605 * 1024) },
          body: new FormData(),
        }),
      );
      expect(res.status).toBe(413);
      const json = (await res.json()) as { error: string };
      expect(json.error).toMatch(/OM is 5\.5 MB — add BLOB_READ_WRITE_TOKEN/);
      expect(json.error).not.toMatch(/^HTTP 413/);
    } finally {
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
      if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
    }
  });
});
