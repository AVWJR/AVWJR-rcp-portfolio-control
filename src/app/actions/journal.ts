"use server";

import { postJournal } from "@/lib/post-journal";
import type { JournalDraftLine } from "@rcp/ledger";

export async function postJournalAction(input: {
  entityId: string;
  periodId: string;
  date: string;
  memo: string;
  source?: string;
  lines: JournalDraftLine[];
}) {
  return postJournal({
    ...input,
    date: new Date(input.date),
  });
}
