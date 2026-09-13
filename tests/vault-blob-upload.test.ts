import { POST as vaultBlobHandlePost } from "@/app/api/vault/blob/route";
import { GET as vaultGet, POST as vaultPost } from "@/app/api/vault/route";
import { createSpeDeal } from "@/lib/deals/create-spe";
import { VERCEL_MULTIPART_SAFE_BYTES } from "@/lib/deals/types";
import { blobTokenRequiredMessage, shouldUseClientBlobUpload } from "@/lib/deals/upload-client";
import { blobStoragePath, isTrustedBlobUrl } from "@/lib/file-store";
import { prisma } from "@/lib/prisma";
import { storeVaultDocumentFromBlob } from "@/lib/vault";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

const BLOB_URL = "https://abc123.blob.vercel-storage.com/rcp-vault/SPE-HRP3/Life_at_Harrington_Park_OM.pdf";
const OM_NAME = "Life_at_Harrington_Park_OM_Offering.pdf";
const entityIds: string[] = [];
const vaultIds: string[] = [];

afterAll(async () => {
  if (vaultIds.length) {
    await prisma.vaultDocument.deleteMany({ where: { id: { in: vaultIds } } });
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

describe("document vault Blob client-upload", () => {
  it("reuses the same Blob host trust + path prefix as Add Deal", () => {
    expect(isTrustedBlobUrl(BLOB_URL)).toBe(true);
    expect(blobStoragePath(BLOB_URL)).toBe(`blob:${BLOB_URL}`);
    expect(shouldUseClientBlobUpload(5.5 * 1024 * 1024, { onVercel: true })).toBe(true);
    expect(shouldUseClientBlobUpload(180 * 1024, { onVercel: true })).toBe(false);
  });

  it("POST /api/vault/blob without a token returns the Principal copy", async () => {
    const previous = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const res = await vaultBlobHandlePost(
        new Request("http://localhost/api/vault/blob", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: {
              pathname: "rcp-vault/SPE-HRP3/om.pdf",
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

  it("rejects a 5.5 MB vault multipart on Vercel without a token using Principal copy", async () => {
    const previousVercel = process.env.VERCEL;
    const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.VERCEL = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const res = await vaultPost(
        new Request("http://localhost/api/vault", {
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

  it("registers a blob URL as om_cim and lists it for the entity", async () => {
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    const { entity } = await createSpeDeal({
      name: "Harrington Park Vault Test LLC",
      code: `SPE-V${suffix}`,
      goal: "value_add",
    });
    entityIds.push(entity.id);

    const stored = await storeVaultDocumentFromBlob({
      entityId: entity.id,
      kind: "other",
      title: OM_NAME,
      filename: OM_NAME,
      mimeType: "application/pdf",
      blobUrl: BLOB_URL,
      byteSize: 5_605 * 1024,
    });
    vaultIds.push(stored.id);
    expect(stored.kind).toBe("om_cim");
    expect(stored.storagePath).toBe(`blob:${BLOB_URL}`);

    const res = await vaultPost(
      new Request("http://localhost/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: entity.code,
          kind: "other",
          filename: "Life_at_Harrington_Park_OM.pdf",
          mimeType: "application/pdf",
          byteSize: 5_605 * 1024,
          blobUrl: BLOB_URL,
        }),
      }),
    );
    expect(res.ok).toBe(true);
    const json = (await res.json()) as { id: string; filename: string; kind: string; storagePath?: string };
    vaultIds.push(json.id);
    expect(json.filename).toBe("Life_at_Harrington_Park_OM.pdf");
    expect(json.kind).toBe("om_cim");
    expect(json.storagePath).toBe(`blob:${BLOB_URL}`);

    const listed = await vaultGet(new Request(`http://localhost/api/vault?entity=${entity.code}`));
    const listJson = (await listed.json()) as {
      documents: { filename: string; kind: string }[];
      blobConfigured: boolean;
      clientUploadThresholdBytes: number;
    };
    expect(listJson.clientUploadThresholdBytes).toBe(VERCEL_MULTIPART_SAFE_BYTES);
    expect(listJson.documents.some((doc) => doc.filename === "Life_at_Harrington_Park_OM.pdf" && doc.kind === "om_cim")).toBe(
      true,
    );
    expect(listJson.documents.some((doc) => doc.filename === OM_NAME && doc.kind === "om_cim")).toBe(true);
  });

  it("README notes Vault + Add Deal both use Blob for large files", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toMatch(/Add Deal and the document vault/i);
    expect(readme).toMatch(/\/api\/vault\/blob/);
    expect(readme).toMatch(/Add Deal and `\/vault`/);
  });
});
