import { SuspenseOpenError } from "@rcp/ledger";
import { hardTieFailures, type TieOut } from "@rcp/properties";
import { prisma } from "@/lib/prisma";

export async function suspenseNetCents(entityId: string, through?: Date): Promise<bigint> {
  const lines = await prisma.journalLine.findMany({
    where: {
      account: { entityId, code: "1999" },
      journal: {
        entityId,
        status: "POSTED",
        ...(through ? { date: { lte: through } } : {}),
      },
    },
  });
  return lines.reduce((acc, line) => acc + line.debit - line.credit, 0n);
}

export async function assertNoOpenSuspense(entityId: string, through?: Date) {
  const net = await suspenseNetCents(entityId, through);
  if (net !== 0n) throw new SuspenseOpenError();
}

export const HARD_CLOSE_BLOCKED_PREFIX = "Hard close is blocked:";

export function assertTieOutsAllowLock(rows: TieOut[]) {
  const failed = hardTieFailures(rows);
  if (failed.length > 0) {
    throw new Error(`${HARD_CLOSE_BLOCKED_PREFIX} ${failed.map((row) => `${row.id} ${row.detail}`).join(" ")}`);
  }
}
