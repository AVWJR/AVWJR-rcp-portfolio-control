import { preferHowToChrome, sanitizeSuggestedActions } from "./actions";
import {
  expertAiEnabled,
  enrichGatewayError,
  gatewayModelCandidates,
  isUnknownGatewayModelError,
  liveFallbackReason,
  publicErrorMessage,
  resolveExpertProvider,
  resolveGatewayModel,
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

function newExpertId(): string {
  return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function wrapMessage(
  text: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  sources: string[],
  proposed: ExpertSuggestedAction[] = [],
  userText = "",
): ExpertMessage {
  const chrome = preferHowToChrome(ctx, bundle, userText, proposed);
  return {
    id: newExpertId(),
    role: "expert",
    content: text,
    ...chrome,
    sources,
    mode: "ai",
    createdAt: new Date().toISOString(),
  };
}

function responseEnvelope(
  mode: "offline" | "ai",
  resolved: ExpertProviderResolution,
  message: ExpertMessage,
  fallbackReason?: string,
): ExpertChatResponse {
  const keyPresent = resolved.provider !== "none";
  return {
    mode,
    aiEnabled: keyPresent,
    keyPresent,
    provider: resolved.provider,
    modelId: resolved.modelId,
    banner: mode === "ai" ? "grok" : "offline",
    message: {
      ...message,
      mode,
      ...(fallbackReason ? { fallbackReason } : {}),
    },
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

function attachFallbackSource(message: ExpertMessage, reason?: string): ExpertMessage {
  if (!reason) return message;
  const sources = message.sources ?? [];
  if (sources.some((source) => /offline coach|last resort/i.test(source))) return { ...message, sources };
  return { ...message, sources: [...sources, "Offline last resort after live Grok failed"] };
}

function systemForTurn(ctx: ExpertClientContext, bundle: OfflineBundle, userText = ""): string {
  return buildSystemForTurn(ctx, bundle, userText);
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
  apiKey: string | null,
  onDelta?: (text: string) => void,
): Promise<ExpertMessage | null> {
  const { streamText, generateText, tool, stepCountIs } = await import("ai");
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
  const { howToAnswerForQuery, lookupHowToPlaybook, matchHowTo } = await import("./how-to-playbook");

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
    getHowToPlaybook: tool({
      description:
        "Exact RCP click paths for how-to questions (reupload T12, re-apply rent roll, delete deal, vault vs deals, downloads). Call this when the user asks how to do something. Do not answer from the current pack page.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => ({
        topic: matchHowTo(query),
        answer: howToAnswerForQuery(query, ctx),
        catalog: lookupHowToPlaybook(query),
      }),
    }),
    proposeSuggestedActions: tool({
      description:
        "Propose 1-3 ranked UI action buttons tightly relevant to the last user question. For T12/rent-roll/delete how-tos, deep-link Vault, Properties, Add Deal, Deals, or Deal Archive — never pack PDF or LP narrative chips.",
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

  const candidates = gatewayModelCandidates(modelId);
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      const model = await resolveGatewayModel(candidate, apiKey);
      const result = streamText({
        model: model as never,
        system: systemForTurn(ctx, bundle, userText),
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

      let text = (await result.text)?.trim();
      if (!text) {
        const plain = await generateText({
          model: (await resolveGatewayModel(candidate, apiKey)) as never,
          system: systemForTurn(ctx, bundle, userText),
          messages: [
            ...historyMessages(history),
            { role: "user" as const, content: userText || openCoachPrompt() },
          ],
        });
        text = plain.text?.trim() ?? "";
      }
      if (!text) throw new Error("No output generated. Check the stream for errors.");
      return wrapMessage(text, ctx, bundle, ["From live Expert tools + Grok"], proposed, userText);
    } catch (error) {
      lastError = enrichGatewayError(error);
      try {
        const plain = await generateText({
          model: (await resolveGatewayModel(candidate, apiKey)) as never,
          system: systemForTurn(ctx, bundle, userText),
          messages: [
            ...historyMessages(history),
            { role: "user" as const, content: userText || openCoachPrompt() },
          ],
        });
        const text = plain.text?.trim() ?? "";
        if (text) {
          console.warn("[expert] gateway tools failed; plain generateText succeeded", candidate, publicErrorMessage(error));
          return wrapMessage(text, ctx, bundle, ["From live Expert tools + Grok"], proposed, userText);
        }
      } catch (plainError) {
        lastError = enrichGatewayError(plainError);
      }
      const next = candidates[i + 1];
      if (!next || !isUnknownGatewayModelError(error)) throw lastError;
      console.warn("[expert] gateway model retry", candidate, "→", next, publicErrorMessage(error));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Live Grok failed");
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
    { role: "system", content: systemForTurn(ctx, bundle, userText) },
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

type ModelAttempt = { message: ExpertMessage | null; error: string | null };

async function answerWithModel(
  userText: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  history: { role: string; content: string }[],
  resolved: ExpertProviderResolution,
  onDelta?: (text: string) => void,
): Promise<ModelAttempt> {
  if (resolved.provider === "none") return { message: null, error: null };
  try {
    const message =
      resolved.provider === "xai"
        ? await answerWithXai(userText, ctx, bundle, history, resolved, onDelta)
        : await answerWithGateway(userText, ctx, bundle, history, resolved.modelId, resolved.apiKey, onDelta);
    if (message) return { message, error: null };
    return {
      message: null,
      error: liveFallbackReason(new Error("Live Grok returned no text"), resolved.modelId),
    };
  } catch (error) {
    const reason = liveFallbackReason(error, resolved.modelId);
    console.warn("[expert] model fallback", reason);
    return { message: null, error: reason };
  }
}

export async function runExpertChat(req: ExpertChatRequest): Promise<ExpertChatResponse> {
  const ctx = resolveContext(req.context);
  const bundle = await loadBundle(ctx);
  const userText = lastUserText(req);
  const resolved = resolveExpertProvider();
  if (resolved.provider !== "none" && (userText || req.intent === "open")) {
    const ai = await answerWithModel(userText, ctx, bundle, req.messages ?? [], resolved);
    if (ai.message) return responseEnvelope("ai", resolved, ai.message);
    const message = attachFallbackSource(
      userText ? answerOffline(userText, ctx, bundle) : buildOpener(ctx, bundle),
      ai.error ?? undefined,
    );
    return responseEnvelope("offline", resolved, message, ai.error ?? undefined);
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
  const keyPresent = resolved.provider !== "none";

  let fallbackReason: string | undefined;
  if (keyPresent && (userText || req.intent === "open")) {
    yield {
      type: "start",
      aiEnabled: keyPresent,
      keyPresent,
      provider: resolved.provider,
      modelId: resolved.modelId,
      banner: "offline",
      mode: "ai",
    };
    for await (const event of iterWithDeltaQueue(async (onDelta) => {
      const attempt = await answerWithModel(userText, ctx, bundle, req.messages ?? [], resolved, onDelta);
      fallbackReason = attempt.error ?? undefined;
      return attempt.message;
    })) {
      if (event.kind === "delta") yield { type: "delta", text: event.text };
      else if (event.message) {
        yield { type: "done", response: responseEnvelope("ai", resolved, event.message) };
        return;
      }
    }
    if (fallbackReason) yield { type: "error", message: fallbackReason };
  }

  const message = attachFallbackSource(
    userText ? answerOffline(userText, ctx, bundle) : buildOpener(ctx, bundle),
    fallbackReason,
  );
  yield {
    type: "start",
    aiEnabled: keyPresent,
    keyPresent,
    provider: resolved.provider,
    modelId: resolved.modelId,
    banner: "offline",
    mode: "offline",
  };
  yield { type: "delta", text: message.content };
  yield { type: "done", response: responseEnvelope("offline", resolved, message, fallbackReason) };
}

export { expertAiEnabled };
