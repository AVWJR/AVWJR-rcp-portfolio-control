import type { JournalDraftLine } from "@rcp/ledger";
import type { DebtServiceDraft } from "./types";

export function debtServiceJournalLines(draft: DebtServiceDraft): JournalDraftLine[] {
  if (draft.interestCents <= 0n && draft.principalCents <= 0n && draft.reserveCents <= 0n) {
    throw new Error("Debt service draft is empty");
  }
  const cash = draft.interestCents + draft.principalCents + draft.reserveCents;
  const lines: JournalDraftLine[] = [];
  if (draft.interestCents > 0n) {
    lines.push({
      accountCode: "6110",
      debit: draft.interestCents,
      credit: 0n,
      memo: "Contractual interest",
    });
  }
  if (draft.principalCents > 0n) {
    lines.push({
      accountCode: "2110",
      debit: draft.principalCents,
      credit: 0n,
      memo: "Current-portion principal",
    });
  }
  if (draft.reserveCents > 0n) {
    lines.push({
      accountCode: draft.reserveAccountCode,
      debit: draft.reserveCents,
      credit: 0n,
      memo: "Replacement reserve funding",
    });
  }
  lines.push({
    accountCode: draft.cashAccountCode,
    debit: 0n,
    credit: cash,
    memo: "Debt service / reserve cash",
  });
  return lines;
}

/** Reclass next-12-month principal from long-term to current. */
export function currentPortionRollLines(rollFromLtCents: bigint): JournalDraftLine[] {
  if (rollFromLtCents <= 0n) {
    throw new Error("Current-portion roll must be a positive amount");
  }
  return [
    { accountCode: "2210", debit: rollFromLtCents, credit: 0n, memo: "LT → current mortgage roll" },
    { accountCode: "2110", debit: 0n, credit: rollFromLtCents, memo: "LT → current mortgage roll" },
  ];
}

export function cipSpendLines(opts: {
  amountCents: bigint;
  cashCents: bigint;
  apCents: bigint;
  cipAccountCode?: string;
}): JournalDraftLine[] {
  if (opts.amountCents !== opts.cashCents + opts.apCents) {
    throw new Error("CIP spend cash + AP must equal the capitalized amount");
  }
  if (opts.amountCents <= 0n) throw new Error("CIP spend must be positive");
  const lines: JournalDraftLine[] = [
    {
      accountCode: opts.cipAccountCode ?? "1460",
      debit: opts.amountCents,
      credit: 0n,
      memo: "Capitalize to CIP",
    },
  ];
  if (opts.cashCents > 0n) {
    lines.push({ accountCode: "1010", debit: 0n, credit: opts.cashCents, memo: "CIP cash" });
  }
  if (opts.apCents > 0n) {
    lines.push({ accountCode: "2010", debit: 0n, credit: opts.apCents, memo: "CIP payable" });
  }
  return lines;
}

export function placeInServiceLines(opts: {
  amountCents: bigint;
  fixedAssetAccountCode: string;
  cipAccountCode?: string;
}): JournalDraftLine[] {
  if (opts.amountCents <= 0n) throw new Error("Place-in-service amount must be positive");
  return [
    {
      accountCode: opts.fixedAssetAccountCode,
      debit: opts.amountCents,
      credit: 0n,
      memo: "Place CIP in service",
    },
    {
      accountCode: opts.cipAccountCode ?? "1460",
      debit: 0n,
      credit: opts.amountCents,
      memo: "Place CIP in service",
    },
  ];
}
