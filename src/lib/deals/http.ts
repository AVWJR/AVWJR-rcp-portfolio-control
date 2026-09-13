import { DealValidationError } from "./create-spe";
import { FileStoreError } from "@/lib/file-store";
import { ReplaceRequiresConfirmError } from "@/lib/import-guard";
import { allowRequest, clientKey } from "@/lib/expert/rate-limit";
import { NextResponse } from "next/server";

export function rateLimitDeals(request: Request) {
  if (!allowRequest(`deals:${clientKey(request)}`, 40, 60_000)) {
    return NextResponse.json(
      { error: "Too many Add Deal requests. Wait a minute and retry." },
      { status: 429 },
    );
  }
  return null;
}

export function dealErrorResponse(error: unknown) {
  if (error instanceof ReplaceRequiresConfirmError) {
    return NextResponse.json(
      {
        error: error.message,
        needsConfirmReplace: true,
        existingCount: error.existingCount,
      },
      { status: 409 },
    );
  }
  if (error instanceof FileStoreError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  if (/file too large/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 413 });
  }
  const status = error instanceof DealValidationError ? 400 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
