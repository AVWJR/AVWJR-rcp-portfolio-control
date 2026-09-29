import { canSeeEntity, enforce, resolveActor } from "@/lib/auth/actor";
import { runExpertChat, resolveContext, streamExpertChat, validateChatBody } from "@/lib/expert/chat";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/expert/ai-enabled";
import { allowRequest, clientKey } from "@/lib/expert/rate-limit";
import { encodeExpertStream, EXPERT_STREAM_CONTENT_TYPE } from "@/lib/expert/stream";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await enforce("read");
  if (denied) return denied;
  if (!allowRequest(`expert:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Too many Expert requests. Wait a minute and retry." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = validateChatBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const actor = await resolveActor();
  const ctx = resolveContext(parsed.value.context);
  const subject = await prisma.entity.findUnique({ where: { code: ctx.entityCode } });
  if (subject && !canSeeEntity(actor, subject.id)) {
    return NextResponse.json({ error: "This account is not allowed to open that deal." }, { status: 403 });
  }

  try {
    if (parsed.value.stream) {
      const stream = encodeExpertStream(streamExpertChat(parsed.value));
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": EXPERT_STREAM_CONTENT_TYPE,
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }
    const result = await runExpertChat(parsed.value);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error) }, { status: 500 });
  }
}
