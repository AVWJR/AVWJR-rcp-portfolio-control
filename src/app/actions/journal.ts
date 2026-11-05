"use server";

import { assertCan } from "@/lib/auth/actor";
import { postJournal } from "@/lib/post-journal";
import type { JournalDraftLine } from "@rcp/ledger";

export async function postJournalAction(input: {
  entityId: string;
  periodId: string;
  date: string;
  memo: string;
  source?: string;
  lines: JournalDraftLine[];
  allowControllerAdjustment?: boolean;
}) {
  await assertCan(input.allowControllerAdjustment ? "close.override" : "ledger.post", input.entityId);
  return postJournal({
    ...input,
    date: new Date(input.date),
  });
}
