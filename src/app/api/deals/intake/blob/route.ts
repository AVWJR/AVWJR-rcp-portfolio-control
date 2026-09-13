import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { INTAKE_MAX_BYTES } from "@/lib/deals/types";
import { blobTokenRequiredMessage, fileTooLargeMessage } from "@/lib/deals/upload-client";
import { isBlobTokenConfigured } from "@/lib/file-store";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function payloadHint(body: HandleUploadBody): { filename?: string; byteSize?: number } {
  const raw =
    body.type === "blob.generate-client-token"
      ? body.payload.clientPayload
      : body.type === "blob.upload-completed"
        ? body.payload.tokenPayload
        : null;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { filename?: string; byteSize?: number };
    return { filename: parsed.filename, byteSize: parsed.byteSize };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  if (!isBlobTokenConfigured()) {
    const hint = await request
      .clone()
      .json()
      .then((body) => payloadHint(body as HandleUploadBody))
      .catch(() => ({}));
    return NextResponse.json({ error: blobTokenRequiredMessage(hint) }, { status: 503 });
  }
  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let hint: { filename?: string; byteSize?: number } = {};
        if (clientPayload) {
          try {
            hint = JSON.parse(clientPayload) as { filename?: string; byteSize?: number };
          } catch {
            hint = {};
          }
        }
        if (hint.byteSize && hint.byteSize > INTAKE_MAX_BYTES) {
          throw new Error(fileTooLargeMessage());
        }
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: INTAKE_MAX_BYTES,
          allowOverwrite: false,
          tokenPayload: clientPayload ?? JSON.stringify({}),
        };
      },
      onUploadCompleted: async () => {
        // Client registers the blob URL + metadata on POST /api/deals/intake/files.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return dealErrorResponse(error);
  }
}
