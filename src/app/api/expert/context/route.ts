import { currentAccessRole } from "@/lib/access-server";
import { expertAiEnabled, resolveExpertProvider } from "@/lib/expert/ai-enabled";
import { resolveContext } from "@/lib/expert/chat";
import { describePage } from "@/lib/expert/nav";
import { buildOpener } from "@/lib/expert/offline-coach";
import { runExpertTools } from "@/lib/expert/tools";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathname = url.searchParams.get("pathname") || "/";
  const page = describePage(pathname);
  const accessRole = await currentAccessRole();
  const resolved = resolveExpertProvider();
  const ctx = resolveContext({
    pathname,
    entityCode: url.searchParams.get("entity") ?? undefined,
    periodLabel: url.searchParams.get("period") ?? undefined,
    view: url.searchParams.get("view") === "combined" ? "combined" : undefined,
    pageTitle: page.title,
    uiHints: page.hints,
    accessRole,
  });

  try {
    const tools = await runExpertTools(ctx.entityCode, ctx.periodLabel);
    const opener = buildOpener(ctx, tools);
    return NextResponse.json({
      aiEnabled: expertAiEnabled(),
      provider: resolved.provider,
      modelId: resolved.modelId,
      banner: resolved.banner,
      context: ctx,
      opener,
      ...tools,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unavailable";
    if (/NO_SEED|No entities|Unknown entity/i.test(message)) {
      return NextResponse.json({
        aiEnabled: expertAiEnabled(),
        provider: resolved.provider,
        modelId: resolved.modelId,
        banner: resolved.banner,
        context: ctx,
        seeded: false,
        opener: {
          id: "exp_unseeded",
          role: "expert",
          content:
            "The ledger is empty. Load demo books on this machine with `npm run db:reset`, then reload. I will not invent balances while the database has no entities.",
          chips: [],
          createdAt: new Date().toISOString(),
        },
      });
    }
    throw error;
  }
}
