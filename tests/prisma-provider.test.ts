import { describe, expect, it } from "vitest";
import {
  applyPrismaEnv,
  buildPostgresqlSchema,
  deriveNeonUnpooledUrl,
  isPostgresUrl,
  isPrismaDataLossAbort,
  isSqliteUrl,
  previewSchemaPushPlan,
  resolveDatabaseUrl,
  resolveDirectUrl,
  resolvePrismaProvider,
} from "../scripts/prisma-provider.mjs";

const sqliteHeader = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Local demo: SQLite via DATABASE_URL="file:./dev.db"
// Production: change provider.
// Amounts are integer USD cents (BigInt) to keep trial-balance math exact.

model Entity {
  id String @id
}
`;

describe("prisma provider selection", () => {
  it("detects sqlite and postgres URLs", () => {
    expect(isSqliteUrl("file:./dev.db")).toBe(true);
    expect(isPostgresUrl("postgresql://u:p@localhost:5432/db")).toBe(true);
    expect(isPostgresUrl("postgres://u:p@localhost:5432/db")).toBe(true);
    expect(isPostgresUrl("file:./dev.db")).toBe(false);
  });

  it("defaults to sqlite for the Principal laptop path", () => {
    expect(resolvePrismaProvider({ DATABASE_URL: "file:./dev.db" })).toBe("sqlite");
    expect(resolvePrismaProvider({})).toBe("sqlite");
  });

  it("switches to postgresql for Neon / Vercel URLs", () => {
    expect(
      resolvePrismaProvider({
        DATABASE_URL: "postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
      }),
    ).toBe("postgresql");
    expect(resolvePrismaProvider({ VERCEL: "1" })).toBe("postgresql");
  });

  it("maps Marketplace aliases and Neon unpooled hosts", () => {
    expect(resolveDatabaseUrl({ POSTGRES_PRISMA_URL: "postgresql://from-marketplace" })).toBe(
      "postgresql://from-marketplace",
    );
    expect(
      deriveNeonUnpooledUrl("postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb"),
    ).toBe("postgresql://u:p@ep-x.us-east-1.aws.neon.tech/neondb");
    expect(
      resolveDirectUrl(
        { DATABASE_URL_UNPOOLED: "postgresql://direct" },
        "postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb",
      ),
    ).toBe("postgresql://direct");
  });

  it("rewrites the committed sqlite schema to postgresql + DIRECT_URL", () => {
    const prod = buildPostgresqlSchema(sqliteHeader);
    expect(prod).toContain('provider  = "postgresql"');
    expect(prod).toContain("directUrl = env(\"DIRECT_URL\")");
    expect(prod).not.toContain('provider = "sqlite"');
  });

  it("applies dummy postgres URLs so prisma generate does not need a live DB", () => {
    const { provider, env } = applyPrismaEnv({ VERCEL: "1" });
    expect(provider).toBe("postgresql");
    expect(isPostgresUrl(env.DATABASE_URL)).toBe(true);
    expect(isPostgresUrl(env.DIRECT_URL)).toBe(true);
  });

  it("pushes the schema on production and on a local run", () => {
    expect(previewSchemaPushPlan({ VERCEL: "1", VERCEL_ENV: "production" })).toEqual({
      push: true,
      reason: "production",
    });
    expect(previewSchemaPushPlan({})).toEqual({ push: true, reason: "local" });
    expect(previewSchemaPushPlan({ DATABASE_URL: "file:./dev.db" })).toEqual({
      push: true,
      reason: "local",
    });
  });

  it("skips prisma db push on a preview that shares the production database", () => {
    const plan = previewSchemaPushPlan({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://prod.example/neondb",
    });
    expect(plan.push).toBe(false);
    expect(plan.databaseUrl).toBeUndefined();
    expect(plan.reason).toContain("Skipping prisma db push");
  });

  it("pushes a preview only to PREVIEW_DATABASE_URL", () => {
    expect(
      previewSchemaPushPlan({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://prod.example/neondb",
        DIRECT_URL: "postgresql://prod-direct.example/neondb",
        PREVIEW_DATABASE_URL: "postgresql://preview/db",
        PREVIEW_DIRECT_URL: "postgresql://preview-direct/db",
      }),
    ).toEqual({
      push: true,
      reason: "separate preview database",
      databaseUrl: "postgresql://preview/db",
      directUrl: "postgresql://preview-direct/db",
    });
    expect(
      previewSchemaPushPlan({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://prod.example/neondb",
        PREVIEW_DATABASE_URL: "  postgresql://preview-only/db  ",
      }),
    ).toEqual({
      push: true,
      reason: "separate preview database",
      databaseUrl: "postgresql://preview-only/db",
      directUrl: "postgresql://preview-only/db",
    });
  });

  it("refuses a preview push when PREVIEW_DATABASE_URL is the production database", () => {
    const plan = previewSchemaPushPlan({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://prod.example/neondb",
      DIRECT_URL: "postgresql://prod-direct.example/neondb/",
      PREVIEW_DATABASE_URL: "postgresql://prod-direct.example/neondb",
    });
    expect(plan.push).toBe(false);
    expect(plan.databaseUrl).toBeUndefined();
    expect(plan.reason).toContain("production database");
  });

  it("skips prisma db push when VERCEL=1 and VERCEL_ENV is missing or unexpected", () => {
    for (const env of [
      { VERCEL: "1" },
      { VERCEL: "1", VERCEL_ENV: "" },
      { VERCEL: "1", VERCEL_ENV: "development" },
    ]) {
      const plan = previewSchemaPushPlan(env);
      expect(plan.push).toBe(false);
      expect(plan.databaseUrl).toBeUndefined();
      expect(plan.reason).toContain("Skipping prisma db push");
      expect(plan.reason).toContain("VERCEL_ENV");
    }
  });

  it("recognizes prisma db push CI aborts that would drop sibling-preview columns", () => {
    expect(
      isPrismaDataLossAbort(
        "⚠️  There might be data loss when applying the changes:\n\nError: Use the --accept-data-loss flag to ignore the data loss warnings like prisma db push --accept-data-loss",
      ),
    ).toBe(true);
    expect(isPrismaDataLossAbort("Error: P1001 Can't reach database server")).toBe(false);
  });
});
