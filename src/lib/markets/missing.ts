import { Prisma } from "@prisma/client";

export function isMissingMarketTable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return /no such (table|column)|does not exist/i.test(message) && /mkt/i.test(message);
}
