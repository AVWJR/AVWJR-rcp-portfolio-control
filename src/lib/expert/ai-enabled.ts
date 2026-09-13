/** Live model replies require a server-only key. The UI never crashes without one. */

import type { ExpertBannerKind, ExpertModelProvider } from "./types";

/** Current Grok language model on Vercel AI Gateway (SpaceXAI / xAI). */
export const DEFAULT_GROK_GATEWAY_MODEL = "spacexai/grok-4.6";

/** Direct xAI Chat Completions id when only XAI_API_KEY / GROK_API_KEY is set. */
export const DEFAULT_GROK_DIRECT_MODEL = "grok-4";

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

export function isGrokModelId(modelId: string): boolean {
  return /grok|xai|spacexai/i.test(modelId);
}

export function toDirectXaiModelId(modelId: string | undefined): string {
  const raw = modelId?.trim();
  if (!raw) return DEFAULT_GROK_DIRECT_MODEL;
  if (raw.startsWith("spacexai/")) {
    const slug = raw.slice("spacexai/".length);
    if (slug.startsWith("grok-4")) return DEFAULT_GROK_DIRECT_MODEL;
    return slug || DEFAULT_GROK_DIRECT_MODEL;
  }
  if (raw.startsWith("xai/")) return raw.slice("xai/".length) || DEFAULT_GROK_DIRECT_MODEL;
  return raw;
}

type EnvMap = Record<string, string | undefined>;

export function resolveExpertProvider(env: EnvMap = process.env): ExpertProviderResolution {
  const explicit = env.EXPERT_MODEL?.trim() || "";
  const gatewayKey = firstTrimmed(env.AI_GATEWAY_API_KEY, env.VERCEL_OIDC_TOKEN);
  const xaiKey = firstTrimmed(env.XAI_API_KEY, env.GROK_API_KEY);
  const openaiKey = firstTrimmed(env.OPENAI_API_KEY);
  const anthropicKey = firstTrimmed(env.ANTHROPIC_API_KEY);

  if (gatewayKey) {
    const modelId = explicit || DEFAULT_GROK_GATEWAY_MODEL;
    return {
      provider: "gateway",
      modelId,
      banner: isGrokModelId(modelId) ? "grok" : "live",
      apiKey: gatewayKey,
    };
  }

  if (xaiKey) {
    const modelId = toDirectXaiModelId(explicit || DEFAULT_GROK_DIRECT_MODEL);
    return {
      provider: "xai",
      modelId,
      banner: "grok",
      apiKey: xaiKey,
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      modelId: explicit || "openai/gpt-5.4",
      banner: isGrokModelId(explicit) ? "grok" : "live",
      apiKey: openaiKey,
    };
  }

  if (anthropicKey) {
    return {
      provider: "anthropic",
      modelId: explicit || "anthropic/claude-sonnet-4.6",
      banner: "live",
      apiKey: anthropicKey,
    };
  }

  return {
    provider: "none",
    modelId: explicit || DEFAULT_GROK_GATEWAY_MODEL,
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

export function expertBannerCopy(banner: ExpertBannerKind): string {
  if (banner === "grok") return "Grok connected";
  if (banner === "live") return "Live model connected";
  return "Offline coach — add key";
}

export function publicErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Unexpected error";
  if (/DATABASE_URL|DIRECT_URL|SEED_SECRET|postgres(ql)?:\/\/|password|connection string|api[_-]?key/i.test(raw)) {
    return "The Expert could not read live books just now. Retry, or enter the missing input on the cited screen.";
  }
  return raw;
}
