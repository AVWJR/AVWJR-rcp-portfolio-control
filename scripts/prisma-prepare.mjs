#!/usr/bin/env node
/**
 * Writes the active Prisma schema (SQLite local vs PostgreSQL on Vercel/Neon)
 * and optionally forwards the remaining args to `prisma`.
 *
 *   node scripts/prisma-prepare.mjs              # write schema only
 *   node scripts/prisma-prepare.mjs -- generate  # prisma generate
 *   node scripts/prisma-prepare.mjs -- db push   # prisma db push
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPrismaEnv, buildPostgresqlSchema, isPrismaDataLossAbort } from "./prisma-provider.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqliteSchemaPath = path.join(root, "prisma", "schema.prisma");
const prodSchemaPath = path.join(root, "prisma", "schema.prod.prisma");
const activeSchemaPath = path.join(root, "prisma", "schema.active.prisma");

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function prepare() {
  loadDotEnv();
  const { provider, env } = applyPrismaEnv(process.env);
  const sqliteSource = fs.readFileSync(sqliteSchemaPath, "utf8");
  const activeSource =
    provider === "postgresql" ? buildPostgresqlSchema(sqliteSource) : sqliteSource;

  fs.writeFileSync(activeSchemaPath, activeSource);
  if (provider === "postgresql") {
    fs.writeFileSync(prodSchemaPath, activeSource);
  }

  Object.assign(process.env, {
    DATABASE_URL: env.DATABASE_URL,
    DIRECT_URL: env.DIRECT_URL,
  });

  return { provider, env, schema: activeSchemaPath };
}

const { provider, env, schema } = prepare();
const dash = process.argv.indexOf("--");
const prismaArgs = dash >= 0 ? process.argv.slice(dash + 1) : [];

if (prismaArgs.length === 0) {
  console.log(`Prisma schema: ${provider} → ${path.relative(root, schema)}`);
  process.exit(0);
}

const tolerateDrift = process.env.PRISMA_PUSH_TOLERATE_DRIFT === "1";
const result = spawnSync(
  "npx",
  ["prisma", ...prismaArgs, "--schema", path.relative(root, schema)],
  {
    cwd: root,
    encoding: "utf8",
    stdio: tolerateDrift ? ["inherit", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...env },
  },
);

if (tolerateDrift) {
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.status && isPrismaDataLossAbort(`${stdout}\n${stderr}`)) {
    console.warn(
      "[prisma] db push skipped: preview DB has extra columns from another branch. Not dropping them. Continuing to next build.",
    );
    process.exit(0);
  }
}

process.exit(result.status === null ? 1 : result.status);
