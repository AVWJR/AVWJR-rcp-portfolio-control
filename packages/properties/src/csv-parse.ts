export class CsvParseError extends Error {
  readonly line: number;
  constructor(line: number, message: string) {
    super(`CSV line ${line}: ${message}`);
    this.name = "CsvParseError";
    this.line = line;
  }
}

/** Split a single CSV line; supports quoted fields with commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Dollars in CSV (1285, $1,285.00, (1,250.00), 1250.000) → integer cents. */
export function parseUsdToCents(raw: string, line: number, field: string): bigint {
  let text = raw.replace(/[$,\s]/g, "").replace(/[—–−]/g, "-");
  if (text === "" || text === "-" || /^n\/?a$/i.test(text)) return 0n;
  let sign = 1n;
  if (/^\(.*\)$/.test(text)) {
    sign = -1n;
    text = text.slice(1, -1).replace(/[$,\s]/g, "");
  }
  const match = text.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new CsvParseError(line, `${field} is not a USD amount: "${raw}"`);
  }
  if (match[1] === "-") sign = -sign;
  const whole = BigInt(match[2]);
  const frac = (match[3] ?? "00").padEnd(2, "0").slice(0, 2);
  return sign * (whole * 100n + BigInt(frac));
}

export function parseCsvLines(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) {
    throw new CsvParseError(0, "file is empty");
  }
  return lines.map(splitCsvLine);
}
