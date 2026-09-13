import { looksLikeOmCimFilename } from "@rcp/documents";
import { looksLikeRentRollHeaders, parseCsvRows, resolveRentRollHeader } from "@rcp/properties";
import { read, utils } from "xlsx";
import { suggestSpeCode } from "./codes";
import { isDealFileClass, type DealFileClass } from "./types";
import { cleanFilenameForIdentity, isUntitledDealName, suggestIdentityFromFilenames } from "./upload-client";
import { isSpreadsheetFilename } from "./workbook";

export type InferredFileRole = DealFileClass;

export type InferredDealIdentity = {
  speName: string | null;
  speCodeStem: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  asOfDate: string | null;
  targetPeriod: string | null;
  files: { filename: string; classification: DealFileClass; asOfDate: string | null }[];
  notes: string[];
};

const ROLE_PREFIX: { re: RegExp; role: DealFileClass }[] = [
  { re: /^(rr|rent[\s_-]*roll)[-_\s.]/i, role: "rent_roll_csv" },
  { re: /^(om|cim|offering)[-_\s.]/i, role: "om_cim" },
  { re: /^(t12|t-12|t12_noi|noi)[-_\s.]/i, role: "t12_pl" },
  { re: /^(pl|p&l|pnl|profit)[-_\s.]/i, role: "t12_pl" },
  { re: /^(budget|proforma)[-_\s.]/i, role: "budget_csv" },
];

export function classifyFromFilename(filename: string): DealFileClass {
  const lower = filename.toLowerCase();
  const tabular = lower.endsWith(".csv") || isSpreadsheetFilename(filename);
  for (const row of ROLE_PREFIX) {
    if (row.re.test(filename) || row.re.test(filename.replace(/[()]/g, ""))) {
      return row.role;
    }
  }
  if (tabular && /rent|unit|roll/.test(lower)) return "rent_roll_csv";
  if (tabular && /budget/.test(lower)) return "budget_csv";
  if (/loan|note|mortgage|deed/.test(lower)) return "loan_doc";
  if (/lease/.test(lower)) return "lease";
  if (looksLikeOmCimFilename(filename) || /\bom\b|cim|offering/.test(lower)) return "om_cim";
  if (/insur|binder|policy/.test(lower)) return "insurance";
  if (tabular && /\b(t12|t-12|noi|p&l|p\/l|profit[_\s-]*loss)\b/.test(lower)) return "t12_pl";
  if (tabular) return "other";
  return "other";
}

export function sniffWorkbookRole(bytes: Buffer, filename: string): DealFileClass | null {
  try {
    const workbook = read(bytes, { type: "buffer", raw: false });
    const names = workbook.SheetNames.join(" ");
    const preferred =
      workbook.SheetNames.find((name) => /rent|roll|unit/i.test(name)) ??
      workbook.SheetNames.find((name) => /budget/i.test(name)) ??
      workbook.SheetNames[0];
    const sheet = preferred ? workbook.Sheets[preferred] : undefined;
    const csv = sheet ? utils.sheet_to_csv(sheet, { blankrows: false }).slice(0, 8000) : "";
    const headerLine = csv.split(/\r?\n/).find((line) => line.trim()) ?? "";
    const headers = headerLine.split(",").map((h) => h.trim());
    const hay = `${filename} ${names} ${csv}`.toLowerCase();
    if (
      looksLikeRentRollHeaders(headers) ||
      (/unit/.test(hay) && /rent/.test(hay) && /status|occ|leased/.test(hay))
    ) {
      return "rent_roll_csv";
    }
    if (/account_code/.test(hay) && /amount/.test(hay)) return "budget_csv";
    if (/\b(t12|t-12|noi|p&l|profit[_\s-]*loss|trailing)\b/.test(hay)) return "t12_pl";
  } catch {
    return null;
  }
  return null;
}

export function inferFileRole(filename: string, bytes?: Buffer): DealFileClass {
  const fromName = classifyFromFilename(filename);
  // Filename prefixes win. A Resi RR workbook often also has T12 / Unit Mix tabs —
  // sniffing those sheets must not reclassify RR_-_Harrington_-_….xlsx as t12_pl.
  if (fromName === "rent_roll_csv") return fromName;
  if (bytes && (isSpreadsheetFilename(filename) || filename.toLowerCase().endsWith(".csv"))) {
    const sniffed = sniffWorkbookRole(bytes, filename);
    if (fromName === "t12_pl" || fromName === "om_cim" || fromName === "budget_csv") {
      return fromName;
    }
    if (sniffed === "rent_roll_csv") return sniffed;
    if (sniffed) return sniffed;
  }
  return fromName;
}

export function looksMappableRentRoll(csv: string): boolean {
  return resolveRentRollHeader(parseCsvRows(csv)) != null;
}

export function looksMappableBudget(csv: string): boolean {
  const header = csv.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  return header.includes("account_code") && header.includes("amount");
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function inferAsOfDate(filename: string): string | null {
  const text = filename.replace(/_/g, " ");
  const dotted = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (dotted) {
    const month = Number(dotted[1]);
    const day = Number(dotted[2]);
    let year = Number(dotted[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const monthYear = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase()];
    const year = Number(monthYear[2]);
    if (month) return `${year}-${String(month).padStart(2, "0")}-01`;
  }
  const my = text.match(/\b(\d{1,2})[./-](\d{4})\b/);
  if (my) {
    const month = Number(my[1]);
    const year = Number(my[2]);
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}-01`;
  }
  return null;
}

export function dealNameToStem(name: string): string {
  const words = cleanFilenameForIdentity(name)
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && !["life", "at", "the", "llc", "lp", "of", "and"].includes(w.toLowerCase()));
  if (!words.length) return "NEW";
  if (words.length === 1) return words[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "NEW";
  const first = words[0];
  const rest = words.slice(1).map((w) => w[0]).join("");
  const consonants = first.slice(1).replace(/[aeiou]/gi, "");
  const stem = `${first[0]}${consonants[0] || first[1] || ""}${rest}`.replace(/[^A-Za-z0-9]/g, "");
  return stem.toUpperCase().slice(0, 6) || "NEW";
}

export function suggestDealSpeCode(name: string, existingCodes: string[] = []): string {
  const stem = dealNameToStem(name);
  return suggestSpeCode(stem, existingCodes);
}

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);

export function inferAddressFromFilename(filename: string): { address: string | null; city: string | null; state: string | null } {
  const text = filename.replace(/[_]+/g, " ");
  const us = text.match(/\b([A-Z][a-z]+(?:[.\s]+[A-Z][a-z]+)*)[,\s]+([A-Z]{2})\b/);
  if (us && US_STATES.has(us[2])) return { address: null, city: us[1], state: us[2] };
  const street = text.match(/\b(\d{1,5}\s+[A-Za-z0-9.\s]+(?:st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|ct|court|way|pkwy))\b/i);
  if (street) return { address: street[1].replace(/\s+/g, " ").trim(), city: null, state: null };
  return { address: null, city: null, state: null };
}

export function inferDealIdentity(filenames: string[]): InferredDealIdentity {
  const notes: string[] = [];
  const files = filenames.map((filename) => ({
    filename,
    classification: classifyFromFilename(filename),
    asOfDate: inferAsOfDate(filename),
  }));
  const speName = suggestIdentityFromFilenames(filenames);
  const dates = files.map((f) => f.asOfDate).filter((d): d is string => Boolean(d)).sort();
  const asOfDate = dates.at(-1) ?? null;
  const targetPeriod = asOfDate ? asOfDate.slice(0, 7) : null;
  let address: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  for (const filename of filenames) {
    const found = inferAddressFromFilename(filename);
    address = address ?? found.address;
    city = city ?? found.city;
    state = state ?? found.state;
  }
  if (!address && !city) {
    notes.push("No street address in the filenames — left blank (not invented).");
  }
  if (!speName || isUntitledDealName(speName)) {
    notes.push("Could not infer a deal name from the filenames.");
  }
  return {
    speName: speName && !isUntitledDealName(speName) ? speName : null,
    speCodeStem: speName ? dealNameToStem(speName) : null,
    address,
    city,
    state,
    asOfDate,
    targetPeriod,
    files,
    notes,
  };
}

export function isInferredFileClass(value: string): value is DealFileClass {
  return isDealFileClass(value);
}
