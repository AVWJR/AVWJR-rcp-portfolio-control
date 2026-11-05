import { permanentDemoDeleteMessage } from "@/lib/archive-copy";

/** Client-safe status sentences. No database or auth imports. */
export const BROKER_T12_WILL_POST = "The saved broker T12 will be posted into the books.";

export function ownedExitCopy(code: string, name: string): string {
  return (
    `Moving ${name} (${code}) out of Owned takes it out of the OpCo roll-up, month-end close, and the distribution ledger. ` +
    `The books and files stay. Only Owned deals are in today's numbers. ` +
    `Nothing is deleted.`
  );
}

export function ownedEntryCopy(code: string, name: string): string {
  return (
    `Marking ${name} (${code}) Owned puts it into the real OpCo books, month-end close, and the distribution ledger. ` +
    `${BROKER_T12_WILL_POST} ` +
    `Confirm that RCP has closed on this deal.`
  );
}

export function permanentDemoStatusMessage(code: string): string {
  return (
    `${permanentDemoDeleteMessage(code)} ` +
    `Tagging it Test is left for the Phase 4 purge tool, because Test would take it out of the roll-up.`
  );
}
