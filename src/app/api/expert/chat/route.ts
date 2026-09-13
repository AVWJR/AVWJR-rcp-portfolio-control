import { runExpertChat, validateChatBody } from "@/lib/expert/chat";
import { publicErrorMessage } from "@/lib/expert/ai-enabled";
import { allowRequest, clientKey } from "@/lib/expert/rate-limit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  try {
    const result = await runExpertChat(parsed.value);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error) }, { status: 500 });
  }
}
