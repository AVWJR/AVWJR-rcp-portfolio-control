import { describe, expect, it } from "vitest";
import {
  applyPrismaEnv,
  buildPostgresqlSchema,
  deriveNeonUnpooledUrl,
  isPostgresUrl,
  isSqliteUrl,
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
});
