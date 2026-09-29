#!/usr/bin/env node
/**
 * Vercel build schema step.
 * Production pushes. Preview does not, unless PREVIEW_DATABASE_URL is set.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { previewSchemaPushPlan } from "./prisma-provider.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = previewSchemaPushPlan(process.env);

if (!plan.push) {
  console.log(plan.reason);
  process.exit(0);
}

const env = { ...process.env, PRISMA_PUSH_TOLERATE_DRIFT: "1" };
if (plan.databaseUrl) {
  env.DATABASE_URL = plan.databaseUrl;
  env.DIRECT_URL = plan.directUrl || plan.databaseUrl;
}

console.log(`prisma db push (${plan.reason})`);
const result = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "prisma-prepare.mjs"), "--", "db", "push", "--skip-generate"],
  { cwd: root, stdio: "inherit", env },
);
process.exit(result.status === null ? 1 : result.status);
