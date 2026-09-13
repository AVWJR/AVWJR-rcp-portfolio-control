import { classifyIntakeFile, guessClassification, removeIntakeFile, storeIntakeFile, storeIntakeFileFromBlob } from "@/lib/deals/files";
import { createIntake, getIntake, publicIntake } from "@/lib/deals/intake";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { extractEmlAttachments } from "@/lib/deals/providers";
import { INTAKE_MAX_BYTES, VERCEL_MULTIPART_SAFE_BYTES, isDealFileSource, type DealFileSource } from "@/lib/deals/types";
import { blobTokenRequiredMessage, fileTooLargeMessage, requestExceedsIntakeLimit } from "@/lib/deals/upload-client";
import { isBlobTokenConfigured, isOnVercel } from "@/lib/file-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ensureIntakeId(raw: string, source: DealFileSource) {
  if (raw) return raw;
  const draft = await createIntake({
    currentStep: 3,
    sources: [source],
    goal: "value_add",
  });
  return draft.id;
}

async function registerBlobReference(request: Request) {
  const body = (await request.json()) as {
    intakeId?: string;
    source?: string;
    filename?: string;
    mimeType?: string;
    byteSize?: number;
    blobUrl?: string;
    classification?: string;
  };
  const sourceRaw = String(body.source ?? "upload");
  const source: DealFileSource = isDealFileSource(sourceRaw) ? sourceRaw : "upload";
  const filename = String(body.filename ?? "").trim();
  const blobUrl = String(body.blobUrl ?? "").trim();
  if (!filename || !blobUrl) {
    return NextResponse.json({ error: "filename and blobUrl are required." }, { status: 400 });
  }
  const byteSize = Number(body.byteSize ?? 0);
  if (byteSize > INTAKE_MAX_BYTES) {
    return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
  }
  const intakeId = await ensureIntakeId(String(body.intakeId ?? ""), source);
  const stored = await storeIntakeFileFromBlob({
    intakeId,
    source,
    filename,
    mimeType: body.mimeType || "application/octet-stream",
    blobUrl,
    classification: body.classification,
    byteSize,
  });
  const intake = await getIntake(intakeId);
  return NextResponse.json({
    stored: [{ id: stored.id, filename: stored.filename, classification: stored.classification, storagePath: stored.storagePath }],
    intake: intake ? publicIntake(intake) : null,
  });
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await registerBlobReference(request);
    } catch (error) {
      return dealErrorResponse(error);
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 0 && requestExceedsIntakeLimit(contentLength)) {
    return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
  }
  if (
    contentLength > 0 &&
    contentLength >= VERCEL_MULTIPART_SAFE_BYTES &&
    isOnVercel()
  ) {
    return NextResponse.json(
      {
        error: isBlobTokenConfigured()
          ? "This file is too large for the serverless upload path. The Add Deal dropzone sends files over ~3.5 MB through Vercel Blob automatically — retry from the wizard."
          : blobTokenRequiredMessage({ filename: "OM.pdf", byteSize: contentLength }),
      },
      { status: 413 },
    );
  }
  try {
    const form = await request.formData();
    const sourceRaw = String(form.get("source") ?? "upload");
    const source: DealFileSource = isDealFileSource(sourceRaw) ? sourceRaw : "upload";
    const intakeId = await ensureIntakeId(String(form.get("intakeId") ?? ""), source);
    const files = form.getAll("file").filter((row): row is File => row instanceof File);
    if (!files.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
    const oversized = files.find((file) => file.size > INTAKE_MAX_BYTES);
    if (oversized) {
      return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
    }
    const tooBigForMultipart = files.find((file) => file.size >= VERCEL_MULTIPART_SAFE_BYTES);
    if (tooBigForMultipart && isOnVercel()) {
      return NextResponse.json(
        {
          error: isBlobTokenConfigured()
            ? "This file is too large for the serverless upload path. The Add Deal dropzone sends files over ~3.5 MB through Vercel Blob automatically — retry from the wizard."
            : blobTokenRequiredMessage({ filename: tooBigForMultipart.name, byteSize: tooBigForMultipart.size }),
        },
        { status: 413 },
      );
    }

    const stored = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const classification = String(form.get("classification") ?? "") || guessClassification(file.name, bytes);
      if (source === "email_attachment" && /\.eml$/i.test(file.name)) {
        const attachments = extractEmlAttachments(bytes);
        stored.push(
          await storeIntakeFile({
            intakeId,
            source,
            filename: file.name,
            mimeType: file.type || "message/rfc822",
            bytes,
            classification: "other",
          }),
        );
        for (const att of attachments) {
          stored.push(
            await storeIntakeFile({
              intakeId,
              source,
              filename: att.filename,
              mimeType: att.mimeType,
              bytes: att.bytes,
            }),
          );
        }
      } else {
        stored.push(
          await storeIntakeFile({
            intakeId,
            source,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            bytes,
            classification,
          }),
        );
      }
    }
    const intake = await getIntake(intakeId);
    return NextResponse.json({
      stored: stored.map((row) => ({ id: row.id, filename: row.filename, classification: row.classification })),
      intake: intake ? publicIntake(intake) : null,
    });
  } catch (error) {
    return dealErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json()) as { fileId?: string; classification?: string; files?: { id: string; classification: string }[] };
    if (body.files?.length) {
      for (const row of body.files) {
        await classifyIntakeFile(row.id, row.classification);
      }
    } else if (body.fileId && body.classification) {
      await classifyIntakeFile(body.fileId, body.classification);
    } else {
      return NextResponse.json({ error: "classification required" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dealErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await removeIntakeFile(id);
  return NextResponse.json({ deleted: id });
}
