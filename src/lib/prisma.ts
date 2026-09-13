import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";
import { isPostgresUrl, resolveDatabaseUrl } from "./db-provider";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const log = process.env.NODE_ENV === "development" ? (["error", "warn"] as const) : (["error"] as const);
  const databaseUrl = resolveDatabaseUrl();

  if (isPostgresUrl(databaseUrl)) {
    neonConfig.webSocketConstructor = ws;
    return new PrismaClient({
      adapter: new PrismaNeon({ connectionString: databaseUrl }),
      log,
    });
  }

  return new PrismaClient({ log });
}

export { createPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
