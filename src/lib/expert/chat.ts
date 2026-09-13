import { mergeSuggestedActions, rankChips, rankSuggestedActions, sanitizeSuggestedActions } from "./actions";
import {
  expertAiEnabled,
  publicErrorMessage,
  resolveExpertProvider,
  type ExpertProviderResolution,
} from "./ai-enabled";
import { DEFAULT_ENTITY, DEFAULT_PERIOD, describePage } from "./nav";
import { answerOffline, buildOpener, type OfflineBundle } from "./offline-coach";
import { buildSystemForTurn } from "./snapshot";
import { runExpertTools } from "./tools";
import type {
  ExpertChatRequest,
  ExpertChatResponse,
  ExpertClientContext,
  ExpertMessage,
  ExpertStreamEvent,
  ExpertSuggestedAction,
} from "./types";
import { completeXai, streamXai, type XaiChatMessage } from "./xai-client";

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
    if (context.accessRole !== undefined && context.accessRole !== "principal" && context.accessRole !== "viewer") {
      return { ok: false, error: "context.accessRole must be principal or viewer" };
    }
  }
  if (rec.intent !== undefined && typeof rec.intent !== "string") {
    return { ok: false, error: "intent must be a string" };
  }
  if (rec.stream !== undefined && typeof rec.stream !== "boolean") {
    return { ok: false, error: "stream must be a boolean" };
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
      stream: typeof rec.stream === "boolean" ? rec.stream : undefined,
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
    accessRole: raw?.accessRole === "viewer" || raw?.accessRole === "principal" ? raw.accessRole : undefined,
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

function historyMessages(history: { role: string; content: string }[]): { role: "user" | "assistant"; content: string }[] {
  return history
    .filter((m) => m.content.trim())
    .slice(-8)
    .map((m) => ({
      role: m.role === "expert" || m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));
}

function wrapMessage(
  text: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  sources: string[],
  proposed: ExpertSuggestedAction[] = [],
  userText = "",
): ExpertMessage {
  const fallback = answerOffline("", ctx, bundle);
  return {
    ...fallback,
    content: text,
    chips: rankChips(ctx, bundle, userText),
    actions: mergeSuggestedActions(proposed, rankSuggestedActions(ctx, bundle, userText)),
    sources,
    createdAt: new Date().toISOString(),
  };
}

function responseEnvelope(
  mode: "offline" | "ai",
  resolved: ExpertProviderResolution,
  message: ExpertMessage,
): ExpertChatResponse {
  return {
    mode,
    aiEnabled: resolved.provider !== "none",
    provider: resolved.provider,
    modelId: resolved.modelId,
    banner: resolved.banner,
    message,
  };
}

function systemForTurn(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  return buildSystemForTurn(ctx, bundle);
}

function openCoachPrompt(): string {
  return "The Principal just opened Expert. Greet them in 2–4 sentences: where they are, and one useful next click. Do not list flags, acronyms, completeness rows, or the product map unless a blocker is on this page.";
}

async function answerWithGateway(
  userText: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  history: { role: string; content: string }[],
  modelId: string,
  onDelta?: (text: string) => void,
): Promise<ExpertMessage | null> {
  const { streamText, tool, stepCountIs } = await import("ai");
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

  const proposed: ExpertSuggestedAction[] = [];
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
    proposeSuggestedActions: tool({
      description: "Propose 1-3 ranked UI action buttons tightly relevant to the last question or current page. Call before you finish.",
      inputSchema: z.object({
        actions: z
          .array(
            z.object({
              kind: z.enum(["navigate", "intent", "confirm_mutation"]),
              label: z.string(),
              href: z.string().optional(),
              intent: z.string().optional(),
              prompt: z.string().optional(),
              mutation: z.string().optional(),
            }),
          )
          .max(3),
      }),
      execute: async ({ actions }) => {
        proposed.splice(0, proposed.length, ...sanitizeSuggestedActions(actions));
        return { ok: true, count: proposed.length };
      },
    }),
  };

  const result = streamText({
    model: modelId,
    system: systemForTurn(ctx, bundle),
    messages: [
      ...historyMessages(history),
      { role: "user" as const, content: userText || openCoachPrompt() },
    ],
    tools,
    stopWhen: stepCountIs(6),
  });

  if (onDelta) {
    for await (const delta of result.textStream) {
      if (delta) onDelta(delta);
    }
  }

  const text = (await result.text)?.trim();
  if (!text) return null;
  return wrapMessage(text, ctx, bundle, ["From live Expert tools + Grok"], proposed, userText);
}

async function answerWithXai(
  userText: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  history: { role: string; content: string }[],
  resolved: ExpertProviderResolution,
  onDelta?: (text: string) => void,
): Promise<ExpertMessage | null> {
  if (!resolved.apiKey) return null;
  const messages: XaiChatMessage[] = [
    { role: "system", content: systemForTurn(ctx, bundle) },
    ...historyMessages(history),
    { role: "user", content: userText || openCoachPrompt() },
  ];

  if (onDelta) {
    let text = "";
    for await (const delta of streamXai({ apiKey: resolved.apiKey, model: resolved.modelId, messages })) {
      text += delta;
      onDelta(delta);
    }
    const trimmed = text.trim();
    if (!trimmed) return null;
    return wrapMessage(trimmed, ctx, bundle, ["From live Expert tools + Grok (xAI)"], [], userText);
  }

  const text = await completeXai({ apiKey: resolved.apiKey, model: resolved.modelId, messages });
  if (!text) return null;
  return wrapMessage(text, ctx, bundle, ["From live Expert tools + Grok (xAI)"], [], userText);
}

async function answerWithModel(
  userText: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  history: { role: string; content: string }[],
  resolved: ExpertProviderResolution,
  onDelta?: (text: string) => void,
): Promise<ExpertMessage | null> {
  if (resolved.provider === "none") return null;
  try {
    if (resolved.provider === "xai") {
      return await answerWithXai(userText, ctx, bundle, history, resolved, onDelta);
    }
    return await answerWithGateway(userText, ctx, bundle, history, resolved.modelId, onDelta);
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
  const resolved = resolveExpertProvider();
  if (resolved.provider !== "none" && (userText || req.intent === "open")) {
    const ai = await answerWithModel(userText, ctx, bundle, req.messages ?? [], resolved);
    if (ai) return responseEnvelope("ai", resolved, ai);
  }
  const message = userText ? answerOffline(userText, ctx, bundle) : buildOpener(ctx, bundle);
  return responseEnvelope("offline", resolved, message);
}

async function* iterWithDeltaQueue(
  work: (onDelta: (text: string) => void) => Promise<ExpertMessage | null>,
): AsyncGenerator<{ kind: "delta"; text: string } | { kind: "result"; message: ExpertMessage | null }> {
  const pending: string[] = [];
  let waiting: ((value: string | null) => void) | null = null;
  let finished = false;

  const onDelta = (text: string) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(text);
      return;
    }
    pending.push(text);
  };

  const workPromise = work(onDelta).finally(() => {
    finished = true;
    if (waiting) {
      waiting(null);
      waiting = null;
    }
  });

  while (true) {
    if (pending.length) {
      yield { kind: "delta", text: pending.shift() as string };
      continue;
    }
    if (finished) break;
    const next = await new Promise<string | null>((resolve) => {
      waiting = resolve;
    });
    if (next) yield { kind: "delta", text: next };
  }

  yield { kind: "result", message: await workPromise };
}

export async function* streamExpertChat(req: ExpertChatRequest): AsyncGenerator<ExpertStreamEvent> {
  const ctx = resolveContext(req.context);
  const bundle = await loadBundle(ctx);
  const userText = lastUserText(req);
  const resolved = resolveExpertProvider();
  const aiEnabled = resolved.provider !== "none";

  if (aiEnabled && (userText || req.intent === "open")) {
    yield {
      type: "start",
      aiEnabled,
      provider: resolved.provider,
      modelId: resolved.modelId,
      banner: resolved.banner,
      mode: "ai",
    };
    for await (const event of iterWithDeltaQueue((onDelta) =>
      answerWithModel(userText, ctx, bundle, req.messages ?? [], resolved, onDelta),
    )) {
      if (event.kind === "delta") yield { type: "delta", text: event.text };
      else if (event.message) {
        yield { type: "done", response: responseEnvelope("ai", resolved, event.message) };
        return;
      }
    }
  }

  const message = userText ? answerOffline(userText, ctx, bundle) : buildOpener(ctx, bundle);
  yield {
    type: "start",
    aiEnabled,
    provider: resolved.provider,
    modelId: resolved.modelId,
    banner: resolved.banner,
    mode: "offline",
  };
  yield { type: "delta", text: message.content };
  yield { type: "done", response: responseEnvelope("offline", resolved, message) };
}

export { expertAiEnabled };
