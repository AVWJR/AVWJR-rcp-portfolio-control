import { NextResponse } from "next/server";
import { isDemoSeeded, runSeed } from "@/lib/seed-demo";
import { authorizeSeedRequest } from "@/lib/seed-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * One-time (default) production demo seed.
 * Requires SEED_SECRET (16+ chars) via Authorization: Bearer … or x-seed-secret.
 * Body `{ "force": true }` wipes and reseeds — demo data only, not a tax filing.
 */
export async function POST(request: Request) {
  const auth = authorizeSeedRequest(request);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  let force = false;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { force?: unknown } | null;
    force = body?.force === true;
  } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    force = form?.get("force") === "true" || form?.get("force") === "on";
  }

  const alreadySeeded = await isDemoSeeded();
  if (alreadySeeded && !force) {
    return NextResponse.json({
      ok: true,
      seeded: false,
      reason: "already_seeded",
      message: "Demo data is already present. Pass { \"force\": true } with SEED_SECRET to wipe and reseed.",
    });
  }

  const summary = await runSeed({ wipe: true });
  return NextResponse.json({
    ok: true,
    seeded: true,
    reason: alreadySeeded ? "reseeded" : "seeded",
    disclaimer: "Demo data only. This system does not file taxes.",
    summary,
  });
}

export async function GET() {
  return jsonError(405, "Method not allowed");
}
