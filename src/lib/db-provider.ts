export function isPostgresUrl(url: string | undefined | null): boolean {
  return /^(postgres|postgresql):\/\//i.test(String(url ?? "").trim());
}

export function isSqliteUrl(url: string | undefined | null): boolean {
  return /^file:/i.test(String(url ?? "").trim());
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [env.DATABASE_URL, env.POSTGRES_PRISMA_URL, env.POSTGRES_URL];
  for (const value of candidates) {
    if (value?.trim()) return value.trim();
  }
  return "";
}
