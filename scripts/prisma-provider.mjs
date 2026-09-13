/**
 * Shared SQLite vs PostgreSQL detection for local demo vs Vercel/Neon.
 * Prisma cannot use two providers in one schema file, so we pick at generate time.
 */

export const SQLITE_DATABASE_URL = "file:./dev.db";
export const DUMMY_POSTGRES_URL = "postgresql://user:pass@localhost:5432/rcp_portfolio?schema=public";

export function isPostgresUrl(url = "") {
  return /^(postgres|postgresql):\/\//i.test(String(url).trim());
}

export function isSqliteUrl(url = "") {
  return /^file:/i.test(String(url).trim());
}

export function resolveDatabaseUrl(env = process.env) {
  const candidates = [env.DATABASE_URL, env.POSTGRES_PRISMA_URL, env.POSTGRES_URL];
  for (const value of candidates) {
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function deriveNeonUnpooledUrl(url = "") {
  if (!url) return "";
  return url.replace(/-pooler\./i, ".");
}

export function resolveDirectUrl(env = process.env, databaseUrl = resolveDatabaseUrl(env)) {
  const candidates = [env.DIRECT_URL, env.DATABASE_URL_UNPOOLED, env.POSTGRES_URL_NON_POOLING];
  for (const value of candidates) {
    if (value && String(value).trim()) return String(value).trim();
  }
  const derived = deriveNeonUnpooledUrl(databaseUrl);
  return derived || databaseUrl;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"sqlite" | "postgresql"}
 */
export function resolvePrismaProvider(env = process.env) {
  const url = resolveDatabaseUrl(env);
  if (isSqliteUrl(url)) return "sqlite";
  if (isPostgresUrl(url)) return "postgresql";
  if (env.PRISMA_PROVIDER === "postgresql" || env.PRISMA_PROVIDER === "sqlite") {
    return env.PRISMA_PROVIDER;
  }
  if (env.VERCEL === "1") return "postgresql";
  return "sqlite";
}

/**
 * Build a PostgreSQL Prisma schema from the committed SQLite schema.prisma.
 * Keeps models in one place so local and production cannot drift.
 * @param {string} sqliteSchema
 */
export function buildPostgresqlSchema(sqliteSchema) {
  if (!/provider\s*=\s*"sqlite"/.test(sqliteSchema)) {
    throw new Error("Expected prisma/schema.prisma to use provider = \"sqlite\" as the local source of truth");
  }
  const withDatasource = sqliteSchema.replace(
    /datasource db \{[\s\S]*?\}/,
    `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`,
  );
  const header = `// Roche Capital Partners — Phase A–F (PostgreSQL / Neon production schema)
// Generated from prisma/schema.prisma by scripts/prisma-prepare.mjs — edit models there.
// DATABASE_URL = Neon pooled (-pooler). DIRECT_URL = Neon unpooled (prisma db push).
`;
  return header + withDatasource.replace(/^\/\/.*\n(?:\/\/.*\n)*/, "");
}

/**
 * Ensure Prisma CLI sees DATABASE_URL / DIRECT_URL for the selected provider.
 * `prisma generate` does not need a live database.
 * @param {NodeJS.ProcessEnv} env
 */
export function applyPrismaEnv(env = process.env) {
  const provider = resolvePrismaProvider(env);
  const next = { ...env };
  if (provider === "postgresql") {
    const databaseUrl = resolveDatabaseUrl(next) || DUMMY_POSTGRES_URL;
    next.DATABASE_URL = databaseUrl;
    next.DIRECT_URL = resolveDirectUrl(next, databaseUrl) || DUMMY_POSTGRES_URL;
  } else if (!next.DATABASE_URL) {
    next.DATABASE_URL = SQLITE_DATABASE_URL;
  }
  return { provider, env: next };
}
