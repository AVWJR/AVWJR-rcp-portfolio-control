import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { FileStoreError, isBlobTokenConfigured, isOnVercel } from "@/lib/file-store";
import { listVaultDocuments, resolveVaultKind, storeVaultDocument, storeVaultDocumentFromBlob } from "@/lib/vault";
import { isVaultKind } from "@rcp/documents";
import { VERCEL_MULTIPART_SAFE_BYTES, INTAKE_MAX_BYTES } from "@/lib/deals/types";
import { blobTokenRequiredMessage, fileTooLargeMessage, requestExceedsIntakeLimit } from "@/lib/deals/upload-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function oversizedMultipartResponse(filename: string, byteSize: number) {
  return NextResponse.json(
    {
      error: isBlobTokenConfigured()
        ? "This file is too large for the serverless upload path. The vault form sends files over ~3.5 MB through Vercel Blob automatically — retry from /vault."
        : blobTokenRequiredMessage({ filename, byteSize }),
    },
    { status: 413 },
  );
}

async function registerBlobReference(request: Request) {
  const body = (await request.json()) as {
    entity?: string;
    kind?: string;
    title?: string;
    notes?: string;
    filename?: string;
    mimeType?: string;
    byteSize?: number;
    blobUrl?: string;
  };
  const code = String(body.entity ?? "").trim();
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const filename = String(body.filename ?? "").trim();
  const blobUrl = String(body.blobUrl ?? "").trim();
  if (!filename || !blobUrl) {
    return NextResponse.json({ error: "filename and blobUrl are required." }, { status: 400 });
  }
  const byteSize = Number(body.byteSize ?? 0);
  if (byteSize > INTAKE_MAX_BYTES) {
    return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
  }
  const kind = resolveVaultKind(filename, body.kind);
  const doc = await storeVaultDocumentFromBlob({
    entityId: entity.id,
    kind,
    title: String(body.title ?? filename),
    filename,
    mimeType: body.mimeType || "application/octet-stream",
    blobUrl,
    byteSize,
    notes: String(body.notes ?? ""),
  });
  return NextResponse.json(
    serialize({ id: doc.id, title: doc.title, filename: doc.filename, kind: doc.kind, storagePath: doc.storagePath }),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity");
  let entityId: string | undefined;
  if (code) {
    const entity = await prisma.entity.findUnique({ where: { code } });
    if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
    entityId = entity.id;
  }
  const docs = await listVaultDocuments(entityId);
  return NextResponse.json(
    serialize({
      documents: docs,
      blobConfigured: isBlobTokenConfigured(),
      onVercel: isOnVercel(),
      clientUploadThresholdBytes: VERCEL_MULTIPART_SAFE_BYTES,
    }),
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await registerBlobReference(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      const status = error instanceof FileStoreError ? 503 : /too large/i.test(message) ? 413 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 0 && requestExceedsIntakeLimit(contentLength)) {
    return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
  }
  if (contentLength > 0 && contentLength >= VERCEL_MULTIPART_SAFE_BYTES && isOnVercel()) {
    return oversizedMultipartResponse("OM.pdf", contentLength);
  }

  try {
    const form = await request.formData();
    const code = String(form.get("entity") ?? "");
    const entity = await prisma.entity.findUnique({ where: { code } });
    if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
    const kindRaw = String(form.get("kind") ?? "other");
    if (!isVaultKind(kindRaw)) return NextResponse.json({ error: "Unknown document kind" }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (file.size > INTAKE_MAX_BYTES) {
      return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
    }
    if (file.size >= VERCEL_MULTIPART_SAFE_BYTES && isOnVercel()) {
      return oversizedMultipartResponse(file.name, file.size);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const doc = await storeVaultDocument({
      entityId: entity.id,
      kind: resolveVaultKind(file.name, kindRaw),
      title: String(form.get("title") ?? file.name),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
      notes: String(form.get("notes") ?? ""),
    });
    return NextResponse.json(serialize({ id: doc.id, title: doc.title, filename: doc.filename, kind: doc.kind }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = error instanceof FileStoreError ? 503 : /too large/i.test(message) ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
