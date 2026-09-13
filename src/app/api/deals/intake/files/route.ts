import { classifyIntakeFile, guessClassification, removeIntakeFile, storeIntakeFile } from "@/lib/deals/files";
import { createIntake, getIntake, publicIntake } from "@/lib/deals/intake";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { extractEmlAttachments } from "@/lib/deals/providers";
import { INTAKE_MAX_BYTES, isDealFileSource, type DealFileSource } from "@/lib/deals/types";
import { fileTooLargeMessage, requestExceedsIntakeLimit } from "@/lib/deals/upload-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 0 && requestExceedsIntakeLimit(contentLength)) {
    return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const sourceRaw = String(form.get("source") ?? "upload");
    const source: DealFileSource = isDealFileSource(sourceRaw) ? sourceRaw : "upload";
    let intakeId = String(form.get("intakeId") ?? "");
    if (!intakeId) {
      const draft = await createIntake({
        currentStep: 3,
        sources: [source],
        goal: "value_add",
      });
      intakeId = draft.id;
    }
    const files = form.getAll("file").filter((row): row is File => row instanceof File);
    if (!files.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
    const oversized = files.find((file) => file.size > INTAKE_MAX_BYTES);
    if (oversized) {
      return NextResponse.json({ error: fileTooLargeMessage() }, { status: 413 });
    }

    const stored = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const classification = String(form.get("classification") ?? "") || guessClassification(file.name);
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
