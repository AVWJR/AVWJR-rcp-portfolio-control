import { expertAiEnabled, expertModelId, publicErrorMessage } from "./ai-enabled";
import { DEFAULT_ENTITY, DEFAULT_PERIOD, describePage } from "./nav";
import { answerOffline, buildOpener, type OfflineBundle } from "./offline-coach";
import { EXPERT_SYSTEM_PROMPT } from "./system-prompt";
import { runExpertTools } from "./tools";
import type { ExpertChatRequest, ExpertChatResponse, ExpertClientContext, ExpertMessage } from "./types";

export function validateChatBody(body: unknown): { ok: true; value: ExpertChatRequest } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "JSON body required" };
  }
  const rec = body as Record<string, unknown>;
  if (rec.messages !== undefined && !Array.isArray(rec.messages)) {
    return { ok: false, error: "messages must be an array" };
  }
  if (rec.context !== undefined && (rec.context === null || typeof rec.context !== "object")) {
    return { ok: false, error: "context must be an object" };
  }
  const context = rec.context as Record<string, unknown> | undefined;
  if (context) {
    if (context.entityCode !== undefined && typeof context.entityCode !== "string") {
      return { ok: false, error: "context.entityCode must be a string" };
    }
    if (context.periodLabel !== undefined && typeof context.periodLabel !== "string") {
      return { ok: false, error: "context.periodLabel must be a string" };
    }
    if (context.pathname !== undefined && typeof context.pathname !== "string") {
      return { ok: false, error: "context.pathname must be a string" };
    }
  }
  if (rec.intent !== undefined && typeof rec.intent !== "string") {
    return { ok: false, error: "intent must be a string" };
  }
  const messages = Array.isArray(rec.messages)
    ? rec.messages.map((row) => {
        const m = row as { role?: unknown; content?: unknown };
        return { role: String(m.role ?? ""), content: String(m.content ?? "") };
      })
    : undefined;
  return {
    ok: true,
    value: {
      messages,
      context: context as ExpertChatRequest["context"],
      intent: typeof rec.intent === "string" ? rec.intent : undefined,
    },
  };
}

export function resolveContext(raw?: ExpertChatRequest["context"]): ExpertClientContext {
  const pathname = raw?.pathname?.trim() || "/";
  const page = describePage(pathname);
  return {
    pathname,
    entityCode: raw?.entityCode?.trim() || DEFAULT_ENTITY,
    periodLabel: raw?.periodLabel?.trim() || DEFAULT_PERIOD,
    view: raw?.view === "combined" ? "combined" : undefined,
    pageTitle: raw?.pageTitle?.trim() || page.title,
    uiHints: raw?.uiHints?.length ? raw.uiHints : page.hints,
  };
}

export async function loadBundle(ctx: ExpertClientContext): Promise<OfflineBundle> {
  return runExpertTools(ctx.entityCode, ctx.periodLabel);
}

function lastUserText(req: ExpertChatRequest): string {
  if (req.intent === "open" || req.intent === "hello") return "";
  const msgs = req.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    if (msgs[i].role === "user" && msgs[i].content.trim()) return msgs[i].content;
  }
  return "";
}

async function answerWithModel(
  userText: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  history: { role: string; content: string }[],
): Promise<ExpertMessage | null> {
  if (!expertAiEnabled()) return null;
  try {
    const { generateText, tool, stepCountIs } = await import("ai");
    const { z } = await import("zod");
    const {
      getAnomalies,
      getDataCompleteness,
      getDealIntakeStatus,
      getEntitySummary,
      getKpiSnapshot,
      getPeriodStatus,
      listNavTargets,
    } = await import("./tools");

    const tools = {
      getEntitySummary: tool({
        description: "Read entity identity, parent, children, units, strategy. Never invent codes.",
        inputSchema: z.object({ entityCode: z.string() }),
        execute: async ({ entityCode }) => getEntitySummary(entityCode),
      }),
      getPeriodStatus: tool({
        description: "Period close status and open checklist items.",
        inputSchema: z.object({ entityCode: z.string(), period: z.string() }),
        execute: async ({ entityCode, period }) => getPeriodStatus(entityCode, period),
      }),
      getKpiSnapshot: tool({
        description: "Dashboard KPI tiles already computed by the product. Do not recompute differently.",
        inputSchema: z.object({ entityCode: z.string(), period: z.string() }),
        execute: async ({ entityCode, period }) => getKpiSnapshot(entityCode, period),
      }),
      getDataCompleteness: tool({
        description: "Missing rent roll, budget, loans, tax rows, vault docs, checklist.",
        inputSchema: z.object({ entityCode: z.string(), period: z.string() }),
        execute: async ({ entityCode, period }) => getDataCompleteness(entityCode, period),
      }),
      getAnomalies: tool({
        description: "Rule-based flags from live books and loan-file thresholds.",
        inputSchema: z.object({ entityCode: z.string(), period: z.string() }),
        execute: async ({ entityCode, period }) => getAnomalies(entityCode, period),
      }),
      listNavTargets: tool({
        description: "Allowed in-app routes for linkification.",
        inputSchema: z.object({}),
        execute: async () => listNavTargets(),
      }),
      getDealIntakeStatus: tool({
        description: "Read an Add Deal wizard draft (status, SPE code, files, apply errors). Never invent an intake.",
        inputSchema: z.object({ intakeId: z.string() }),
        execute: async ({ intakeId }) => getDealIntakeStatus(intakeId),
      }),
    };

    const result = await generateText({
      model: expertModelId(),
      system: `${EXPERT_SYSTEM_PROMPT}

Current UI context (authoritative for where they are):
${JSON.stringify(ctx)}

Preloaded tool snapshot (you may call tools again if this is stale):
${JSON.stringify(bundle)}`,
      messages: [
        ...history
          .filter((m) => m.content.trim())
          .slice(-8)
          .map((m) => ({
            role: m.role === "expert" || m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          })),
        { role: "user" as const, content: userText || "Open the coach for this page. Speak first with ranked next moves." },
      ],
      tools,
      stopWhen: stepCountIs(6),
    });

    const text = result.text?.trim();
    if (!text) return null;
    const fallback = answerOffline(userText, ctx, bundle);
    return {
      ...fallback,
      content: text,
      sources: ["From live Expert tools + model"],
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[expert] model fallback", publicErrorMessage(error));
    }
    return null;
  }
}

export async function runExpertChat(req: ExpertChatRequest): Promise<ExpertChatResponse> {
  const ctx = resolveContext(req.context);
  const bundle = await loadBundle(ctx);
  const userText = lastUserText(req);
  const aiEnabled = expertAiEnabled();
  if (aiEnabled && (userText || req.intent === "open")) {
    const ai = await answerWithModel(userText, ctx, bundle, req.messages ?? []);
    if (ai) return { mode: "ai", aiEnabled, message: ai };
  }
  const message = userText ? answerOffline(userText, ctx, bundle) : buildOpener(ctx, bundle);
  return { mode: "offline", aiEnabled, message };
}
