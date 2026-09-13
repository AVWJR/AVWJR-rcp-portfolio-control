/** Live model replies require a server-only key. The UI never crashes without one. */

export function expertAiEnabled(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim(),
  );
}

export function expertModelId(): string {
  return process.env.EXPERT_MODEL?.trim() || "openai/gpt-5.4";
}

export function publicErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Unexpected error";
  if (/DATABASE_URL|DIRECT_URL|SEED_SECRET|postgres(ql)?:\/\/|password|connection string|api[_-]?key/i.test(raw)) {
    return "The Expert could not read live books just now. Retry, or enter the missing input on the cited screen.";
  }
  return raw;
}
