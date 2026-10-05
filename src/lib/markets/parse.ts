export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

export function csvRecords(text: string, skipHashComments = false): Record<string, string>[] {
  const body = skipHashComments
    ? text
        .split(/\r?\n/)
        .filter((line) => !line.startsWith("#"))
        .join("\n")
    : text;
  const rows = parseCsv(body);
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((cols) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (cols[index] ?? "").trim();
    });
    return record;
  });
}

/** One-decimal viability and confidence. 91.9 → 919. */
export function decimalToTenths(raw: string): number {
  if (!/^\d+\.\d+$/.test(raw) && !/^\d+$/.test(raw)) {
    throw new Error(`Score is not a plain number: ${raw}`);
  }
  const [whole, frac = ""] = raw.split(".");
  const hundredths = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Math.round(hundredths / 10);
}

/** Rank interval. 1.000000 → 1000. */
export function decimalToMilli(raw: string): number {
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Rank interval is not a plain number: ${raw}`);
  }
  const [whole, frac = ""] = raw.split(".");
  const scaled = Number(whole) * 10000 + Number((frac + "0000").slice(0, 4));
  return Math.round(scaled / 10);
}

export function formatTenths(tenths: number): string {
  const abs = Math.abs(tenths);
  return `${tenths < 0 ? "-" : ""}${Math.floor(abs / 10)}.${abs % 10}`;
}

export function formatMilli(milli: number): string {
  const whole = Math.trunc(milli / 1000);
  const frac = Math.abs(milli % 1000);
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(3, "0").replace(/0+$/, "")}`;
}

export function formatWeight(numerator: number, denominator: number): string {
  if (denominator === 0) return "data needed";
  if (numerator === 0) return "0%";
  if (numerator === 1 && denominator === 5) return "20%";
  if (numerator === denominator) return "100%";
  return `${numerator} of ${denominator}`;
}
