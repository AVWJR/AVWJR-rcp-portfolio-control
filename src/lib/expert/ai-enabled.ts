/** Live model replies require a server-only key. The UI never crashes without one. */

import type { ExpertBannerKind, ExpertModelProvider } from "./types";

/** Primary go-live: Vercel AI Gateway Grok slug. */
export const DEFAULT_GROK_GATEWAY_MODEL = "xai/grok-4.5";

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
      modelId: explicit || DEFAULT_GROK_GATEWAY_MODEL,
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
  if (banner === "offline") return "Offline coach — add key";
  return "Grok connected";
}

export function publicErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Unexpected error";
  if (/DATABASE_URL|DIRECT_URL|SEED_SECRET|postgres(ql)?:\/\/|password|connection string|api[_-]?key/i.test(raw)) {
    return "The Expert could not read live books just now. Retry, or enter the missing input on the cited screen.";
  }
  return raw;
}
