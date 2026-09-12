import { PeriodStatus } from "@prisma/client";
import { assertJournalBalanced, type JournalDraftLine } from "@rcp/ledger";
import { prisma } from "./prisma";

export async function postJournal(input: {
  entityId: string;
  periodId: string;
  date: Date;
  memo: string;
  source?: string;
  lines: JournalDraftLine[];
}) {
  assertJournalBalanced(input.lines);

  const period = await prisma.period.findUnique({ where: { id: input.periodId } });
  if (!period || period.entityId !== input.entityId) {
    throw new Error("Period does not belong to entity");
  }
  if (period.status === PeriodStatus.CLOSED) {
    throw new Error("Cannot post to a closed period");
  }

  const accounts = await prisma.account.findMany({
    where: { entityId: input.entityId, code: { in: input.lines.map((l) => l.accountCode) } },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  for (const line of input.lines) {
    if (!byCode.has(line.accountCode)) {
      throw new Error(`Account ${line.accountCode} is not on this entity CoA`);
    }
  }

  return prisma.journal.create({
    data: {
      entityId: input.entityId,
      periodId: input.periodId,
      date: input.date,
      memo: input.memo,
      source: input.source ?? "manual",
      status: "POSTED",
      postedAt: new Date(),
      lines: {
        create: input.lines.map((line) => ({
          accountId: byCode.get(line.accountCode)!.id,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo,
        })),
      },
    },
    include: { lines: true },
  });
}
