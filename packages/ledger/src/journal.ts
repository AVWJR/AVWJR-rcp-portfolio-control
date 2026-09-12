import type { JournalDraftLine } from "./types";

export class UnbalancedJournalError extends Error {
  readonly debits: bigint;
  readonly credits: bigint;

  constructor(debits: bigint, credits: bigint) {
    super(
      `Journal is not in balance: debits ${debits.toString()} ≠ credits ${credits.toString()}`,
    );
    this.name = "UnbalancedJournalError";
    this.debits = debits;
    this.credits = credits;
  }
}

export type JournalValidation = {
  ok: true;
  debits: bigint;
  credits: bigint;
};

export function assertJournalBalanced(lines: JournalDraftLine[]): JournalValidation {
  if (lines.length < 2) {
    throw new Error("A journal must have at least two lines");
  }

  let debits = 0n;
  let credits = 0n;

  for (const line of lines) {
    if (line.debit < 0n || line.credit < 0n) {
      throw new Error("Debit and credit amounts must be non-negative");
    }
    if (line.debit > 0n && line.credit > 0n) {
      throw new Error(`Line ${line.accountCode} has both a debit and a credit`);
    }
    if (line.debit === 0n && line.credit === 0n) {
      throw new Error(`Line ${line.accountCode} is empty`);
    }
    debits += line.debit;
    credits += line.credit;
  }

  if (debits !== credits) {
    throw new UnbalancedJournalError(debits, credits);
  }

  return { ok: true, debits, credits };
}

export function isJournalBalanced(lines: JournalDraftLine[]): boolean {
  try {
    assertJournalBalanced(lines);
    return true;
  } catch {
    return false;
  }
}
