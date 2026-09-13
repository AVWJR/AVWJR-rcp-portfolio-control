import { storeIntakeFile } from "@/lib/deals/files";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { getIntake, publicIntake } from "@/lib/deals/intake";
import { dropboxProvider } from "@/lib/deals/providers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!dropboxProvider.isConfigured()) {
    return NextResponse.json({
      configured: false,
      files: [],
      message: dropboxProvider.unconfiguredMessage(),
    });
  }
  try {
    const files = await dropboxProvider.listFiles?.();
    return NextResponse.json({ configured: true, files: files ?? [], message: "Pick Dropbox files to attach to this deal." });
  } catch (error) {
    return dealErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  if (!dropboxProvider.isConfigured() || !dropboxProvider.fetchFile) {
    return NextResponse.json(
      { error: dropboxProvider.unconfiguredMessage(), configured: false },
      { status: 400 },
    );
  }
  try {
    const body = (await request.json()) as { intakeId?: string; paths?: string[] };
    if (!body.intakeId) return NextResponse.json({ error: "intakeId required" }, { status: 400 });
    const stored = [];
    for (const path of body.paths ?? []) {
      const fetched = await dropboxProvider.fetchFile(path);
      stored.push(
        await storeIntakeFile({
          intakeId: body.intakeId,
          source: "dropbox",
          filename: fetched.meta.name,
          mimeType: fetched.meta.mimeType || "application/octet-stream",
          bytes: fetched.bytes,
          remoteId: fetched.meta.id,
        }),
      );
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
