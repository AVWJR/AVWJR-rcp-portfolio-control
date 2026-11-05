import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, type Prisma } from "@prisma/client";
import ws from "ws";
import { isPostgresUrl, resolveDatabaseUrl } from "./db-provider";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const log: Array<"error" | "warn"> =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
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

/** Global client or the client bound to an interactive transaction. */
export type Db = Prisma.TransactionClient | PrismaClient;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
