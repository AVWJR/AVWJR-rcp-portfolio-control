export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type NormalBalance = "DEBIT" | "CREDIT";
export type CashFlowClass = "OPERATING" | "INVESTING" | "FINANCING" | "NONE";

export type AccountDef = {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  isContra: boolean;
  isBelowNoi: boolean;
  isCash: boolean;
  reportGroup: string;
  sortOrder: number;
  cashFlowClass: CashFlowClass;
};

export type PostedLine = {
  accountCode: string;
  debit: bigint;
  credit: bigint;
};

export type AccountBalance = AccountDef & {
  debit: bigint;
  credit: bigint;
  /** Debit minus credit. Contra assets naturally go negative. */
  net: bigint;
};

export type TrialBalanceRow = {
  code: string;
  name: string;
  type: AccountType;
  debit: bigint;
  credit: bigint;
};

export type StatementRow = {
  key: string;
  label: string;
  amount: bigint | null;
  indent: number;
  emphasis?: "section" | "subtotal" | "total" | "rule";
  code?: string;
};

export type IncomeStatement = {
  rows: StatementRow[];
  gpr: bigint;
  vacancy: bigint;
  concessions: bigint;
  otherIncome: bigint;
  egi: bigint;
  opex: bigint;
  noi: bigint;
  interest: bigint;
  depreciation: bigint;
  amFees: bigint;
  netIncome: bigint;
};

export type BalanceSheet = {
  rows: StatementRow[];
  totalAssets: bigint;
  totalLiabilities: bigint;
  totalEquity: bigint;
  balanced: boolean;
};

export type CashFlowStatement = {
  rows: StatementRow[];
  cfo: bigint;
  cfi: bigint;
  cff: bigint;
  netChange: bigint;
  beginningCash: bigint;
  endingCash: bigint;
  tiesToBalanceSheet: boolean;
};

export type JournalDraftLine = {
  accountCode: string;
  debit: bigint;
  credit: bigint;
  memo?: string;
};

export const CENTS_PER_DOLLAR = 100n;
export const ELIMINATION_CODES = ["1310", "2310", "6310", "7010"] as const;
