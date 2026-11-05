import { prisma } from "@/lib/prisma";

export type LedgerCapitalRow = {
  hasEvents: boolean;
  unreturnedCapitalCents: bigint;
  unpaidPrefCents: bigint;
  prefPaidCents: bigint;
  cumulativeRcpCents: bigint;
  cumulativeLpCents: bigint;
  cumulativeCoGpCents: bigint;
};

function missingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|no such table|no such column|P2021|P2022|unknown field/i.test(message);
}

/** Latest running totals per SPE. Empty map when the ledger tables are not on this database yet. */
export async function ledgerCapitalByEntity(entityIds: string[]): Promise<Map<string, LedgerCapitalRow>> {
  const out = new Map<string, LedgerCapitalRow>();
  if (entityIds.length === 0) return out;
  try {
    const rows = await prisma.distributionEvent.findMany({
      where: { entityId: { in: entityIds } },
      orderBy: [{ sequence: "asc" }, { periodLabel: "asc" }],
      select: {
        id: true,
        entityId: true,
        reversesEventId: true,
        unreturnedCapitalCents: true,
        prefUnpaidCents: true,
        prefPaidCents: true,
        cumulativeRcpCents: true,
        cumulativeLpCents: true,
        cumulativeCoGpCents: true,
      },
    });
    const reversed = new Set(rows.map((row) => row.reversesEventId).filter((id): id is string => Boolean(id)));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) latest.set(row.entityId, row);
    for (const [entityId, row] of latest) {
      const economic = rows.filter((item) => item.entityId === entityId && !item.reversesEventId && !reversed.has(item.id));
      out.set(entityId, {
        hasEvents: economic.length > 0,
        unreturnedCapitalCents: row.unreturnedCapitalCents,
        unpaidPrefCents: row.prefUnpaidCents,
        prefPaidCents: row.prefPaidCents,
        cumulativeRcpCents: row.cumulativeRcpCents,
        cumulativeLpCents: row.cumulativeLpCents,
        cumulativeCoGpCents: row.cumulativeCoGpCents,
      });
    }
  } catch (error) {
    if (missingTable(error)) return out;
    throw error;
  }
  return out;
}

export function isMissingDistributionTable(error: unknown): boolean {
  return missingTable(error);
}
