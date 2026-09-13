/** Live model replies require a server-only key. The UI never crashes without one. */

import type { ExpertBannerKind, ExpertModelProvider } from "./types";

/**
 * Primary go-live: current Vercel AI Gateway Grok text slug.
 * Public catalog (https://ai-gateway.vercel.sh/v1/models) lists `spacexai/grok-4.6`.
 * Older docs use `xai/grok-*`; those aliases are rewritten on the Gateway path.
 */
export const DEFAULT_GROK_GATEWAY_MODEL = "spacexai/grok-4.6";

/** Optional direct xAI Chat Completions fallback (https://api.x.ai/v1). */
export const DEFAULT_GROK_DIRECT_MODEL = "grok-4.6";

export const XAI_API_BASE = "https://api.x.ai/v1";

export type ExpertProviderResolution = {
  provider: ExpertModelProvider;
  modelId: string;
  banner: ExpertBannerKind;
  apiKey: string | null;
};

function firstTrimmed(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function toDirectXaiModelId(modelId: string | undefined): string {
  const raw = modelId?.trim();
  if (!raw) return DEFAULT_GROK_DIRECT_MODEL;
  if (raw.startsWith("spacexai/") || raw.startsWith("xai/")) {
    const slug = raw.replace(/^(spacexai|xai)\//, "");
    return slug || DEFAULT_GROK_DIRECT_MODEL;
  }
  return raw;
}

/** Rewrite docs-era `xai/` and bare Grok slugs to the current Gateway catalog id. */
export function toGatewayModelId(modelId: string | undefined): string {
  const raw = modelId?.trim() || "";
  if (!raw) return DEFAULT_GROK_GATEWAY_MODEL;
  if (raw.startsWith("xai/")) {
    const slug = raw.slice("xai/".length).trim();
    return slug ? `spacexai/${slug}` : DEFAULT_GROK_GATEWAY_MODEL;
  }
  if (!raw.includes("/")) return `spacexai/${raw}`;
  return raw;
}

export function alternateGatewaySlug(modelId: string): string | null {
  if (modelId.startsWith("spacexai/")) {
    const slug = modelId.slice("spacexai/".length);
    return slug ? `xai/${slug}` : null;
  }
  if (modelId.startsWith("xai/")) {
    const slug = modelId.slice("xai/".length);
    return slug ? `spacexai/${slug}` : null;
  }
  return null;
}

export function gatewayModelCandidates(modelId: string | undefined): string[] {
  const primary = toGatewayModelId(modelId);
  const alt = alternateGatewaySlug(primary);
  return alt && alt !== primary ? [primary, alt] : [primary];
}

export function isUnknownGatewayModelError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return /unknown model|model[^\n]{0,80}not found|does not exist|invalid model|not a valid model|unsupported model/i.test(
    raw,
  );
}

type EnvMap = Record<string, string | undefined>;

export function resolveExpertProvider(env: EnvMap = process.env): ExpertProviderResolution {
  const explicit = env.EXPERT_MODEL?.trim() || "";
  const gatewayKey = firstTrimmed(env.AI_GATEWAY_API_KEY);
  const xaiKey = firstTrimmed(env.XAI_API_KEY, env.GROK_API_KEY);
  const openaiKey = firstTrimmed(env.OPENAI_API_KEY);
  const anthropicKey = firstTrimmed(env.ANTHROPIC_API_KEY);

  if (gatewayKey) {
    return {
      provider: "gateway",
      modelId: toGatewayModelId(explicit),
      banner: "grok",
      apiKey: gatewayKey,
    };
  }

  if (xaiKey) {
    return {
      provider: "xai",
      modelId: toDirectXaiModelId(explicit || DEFAULT_GROK_DIRECT_MODEL),
      banner: "grok",
      apiKey: xaiKey,
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      modelId: explicit || DEFAULT_GROK_GATEWAY_MODEL,
      banner: "grok",
      apiKey: openaiKey,
    };
  }

  if (anthropicKey) {
    return {
      provider: "anthropic",
      modelId: explicit || DEFAULT_GROK_GATEWAY_MODEL,
      banner: "grok",
      apiKey: anthropicKey,
    };
  }

  return {
    provider: "none",
    modelId: toGatewayModelId(explicit),
    banner: "offline",
    apiKey: null,
  };
}

export function expertAiEnabled(env: EnvMap = process.env): boolean {
  return resolveExpertProvider(env).provider !== "none";
}

export function expertModelId(env: EnvMap = process.env): string {
  return resolveExpertProvider(env).modelId;
}

export function expertBannerCopy(
  banner: ExpertBannerKind,
  opts?: { degraded?: boolean; connecting?: boolean },
): string {
  if (opts?.degraded) return "Live Grok failed — using offline coach";
  if (opts?.connecting) return "Connecting to Grok";
  if (banner === "offline") return "Offline coach — add key";
  return "Grok connected";
}

export function publicErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Unexpected error";
  if (/DATABASE_URL|DIRECT_URL|SEED_SECRET|postgres(ql)?:\/\/|password|connection string|api[_-]?key/i.test(raw)) {
    return "The Expert could not read live books just now. Retry, or enter the missing input on the cited screen.";
  }
  if (/\b402\b|payment required|credit|budget/i.test(raw)) {
    return "AI Gateway is out of credit. Add credits on the Vercel AI Gateway card.";
  }
  if (/\b401\b|\b403\b|unauthorized|forbidden|invalid key/i.test(raw)) {
    return "AI Gateway rejected the key. Check AI_GATEWAY_API_KEY on Production.";
  }
  if (/\b429\b|rate limit|too many requests/i.test(raw)) {
    return "Live Grok is rate-limited. Wait a minute and retry.";
  }
  if (isUnknownGatewayModelError(err)) {
    return `Gateway model was not found. Set EXPERT_MODEL=${DEFAULT_GROK_GATEWAY_MODEL} (xai/ aliases are rewritten).`;
  }
  if (/no output generated|returned no text|empty (response|text)/i.test(raw)) {
    return `Gateway returned no text. Confirm EXPERT_MODEL=${DEFAULT_GROK_GATEWAY_MODEL} and AI Gateway credits.`;
  }
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}

export function liveFallbackReason(err: unknown, modelId: string): string {
  const line = `Live Grok (${modelId}) failed — using offline coach. ${publicErrorMessage(err)}`;
  return line.length > 240 ? `${line.slice(0, 237)}…` : line;
}
