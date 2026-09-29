/**
 * Shared SQLite vs PostgreSQL detection for local demo vs Vercel/Neon.
 * Prisma cannot use two providers in one schema file, so we pick at generate time.
 */

/**
 * @typedef {Record<string, string | undefined>} AppEnv
 */

export const SQLITE_DATABASE_URL = "file:./dev.db";
export const DUMMY_POSTGRES_URL = "postgresql://user:pass@localhost:5432/rcp_portfolio?schema=public";

export function isPostgresUrl(url = "") {
  return /^(postgres|postgresql):\/\//i.test(String(url).trim());
}

export function isSqliteUrl(url = "") {
  return /^file:/i.test(String(url).trim());
}

/**
 * @param {AppEnv} [env]
 */
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

/**
 * @param {AppEnv} [env]
 * @param {string} [databaseUrl]
 */
export function resolveDirectUrl(env = process.env, databaseUrl = resolveDatabaseUrl(env)) {
  const candidates = [env.DIRECT_URL, env.DATABASE_URL_UNPOOLED, env.POSTGRES_URL_NON_POOLING];
  for (const value of candidates) {
    if (value && String(value).trim()) return String(value).trim();
  }
  const derived = deriveNeonUnpooledUrl(databaseUrl);
  return derived || databaseUrl;
}

/**
 * @param {AppEnv} [env]
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
 * @param {AppEnv} [env]
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

/**
 * `prisma db push` in CI exits instead of dropping columns. Sibling preview
 * branches (e.g. SPE archive) can add unused columns to a shared Neon DB.
 * This branch must not `--accept-data-loss` (that would wipe those columns).
 * Extra columns are safe: this Prisma client simply does not select them.
 *
 * @param {string} output
 */
/**
 * Preview deployments share the production Neon database.
 * A preview `prisma db push` drops columns the live app still reads.
 * Push on production and on a laptop (VERCEL_ENV unset).
 * A preview pushes only when PREVIEW_DATABASE_URL is a separate database.
 * @param {AppEnv} [env]
 * @returns {{ push: boolean, reason: string, databaseUrl?: string, directUrl?: string }}
 */
export function previewSchemaPushPlan(env = process.env) {
  const vercelEnv = String(env.VERCEL_ENV ?? "").trim();
  if (vercelEnv !== "preview") {
    return { push: true, reason: vercelEnv === "production" ? "production" : "local" };
  }
  const previewUrl = String(env.PREVIEW_DATABASE_URL ?? "").trim();
  if (!previewUrl) {
    return {
      push: false,
      reason:
        "Skipping prisma db push. Preview and production share one database, so a preview build must not change the schema. Set PREVIEW_DATABASE_URL only if this preview has its own database.",
    };
  }
  const direct = String(env.PREVIEW_DIRECT_URL ?? "").trim() || previewUrl;
  return { push: true, reason: "separate preview database", databaseUrl: previewUrl, directUrl: direct };
}

export function isPrismaDataLossAbort(output = "") {
  const text = String(output);
  return (
    /accept-data-loss/i.test(text) ||
    /data loss when applying the changes/i.test(text) ||
    /there might be data loss/i.test(text)
  );
}
