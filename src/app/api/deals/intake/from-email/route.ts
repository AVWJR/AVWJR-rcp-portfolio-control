import { storeIntakeFile } from "@/lib/deals/files";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { getIntake, publicIntake } from "@/lib/deals/intake";
import { emailAttachmentProvider, extractEmlAttachments } from "@/lib/deals/providers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!emailAttachmentProvider.isConfigured()) {
    return NextResponse.json({
      configured: false,
      files: [],
      message: emailAttachmentProvider.unconfiguredMessage(),
    });
  }
  try {
    const files = await emailAttachmentProvider.listFiles?.();
    return NextResponse.json({
      configured: true,
      files: files ?? [],
      message: "Pick a message. Attachments will be stored on this intake.",
    });
  } catch (error) {
    return dealErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json()) as { intakeId?: string; messageIds?: string[] };
    if (!body.intakeId) return NextResponse.json({ error: "intakeId required" }, { status: 400 });
    if (!emailAttachmentProvider.isConfigured() || !emailAttachmentProvider.fetchFile) {
      return NextResponse.json(
        { error: emailAttachmentProvider.unconfiguredMessage(), configured: false },
        { status: 400 },
      );
    }
    const stored = [];
    for (const id of body.messageIds ?? []) {
      const fetched = await emailAttachmentProvider.fetchFile(id);
      stored.push(
        await storeIntakeFile({
          intakeId: body.intakeId,
          source: "email_attachment",
          filename: fetched.meta.name,
          mimeType: fetched.meta.mimeType || "message/rfc822",
          bytes: fetched.bytes,
          remoteId: id,
          classification: "other",
        }),
      );
      for (const att of extractEmlAttachments(fetched.bytes)) {
        stored.push(
          await storeIntakeFile({
            intakeId: body.intakeId,
            source: "email_attachment",
            filename: att.filename,
            mimeType: att.mimeType,
            bytes: att.bytes,
            remoteId: `${id}:${att.filename}`,
          }),
        );
      }
    }
    const intake = await getIntake(body.intakeId);
    return NextResponse.json({
      stored: stored.map((row) => ({ id: row.id, filename: row.filename })),
      intake: intake ? publicIntake(intake) : null,
    });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
