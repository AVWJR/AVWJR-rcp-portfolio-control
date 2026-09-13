const SKIP_WORDS = new Set(["llc", "lp", "llp", "inc", "the", "of", "and", "residences", "residence"]);

export function suggestSpeCode(name: string, existingCodes: string[] = []): string {
  const words = name
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w && !SKIP_WORDS.has(w.toLowerCase()));

  let stem = words.map((w) => w[0]).join("").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (stem.length < 2) {
    stem = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  }
  if (stem.length < 2) stem = "NEW";
  stem = stem.slice(0, 6);

  const taken = new Set(existingCodes.map((c) => c.toUpperCase()));
  let code = `SPE-${stem}`;
  let n = 2;
  while (taken.has(code)) {
    const suffix = String(n);
    code = `SPE-${stem.slice(0, Math.max(2, 6 - suffix.length))}${suffix}`;
    n += 1;
    if (n > 99) {
      code = `SPE-X${Date.now().toString(36).toUpperCase().slice(-4)}`;
      break;
    }
  }
  return code;
}

export function normalizeSpeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidSpeCode(code: string): boolean {
  return /^SPE-[A-Z0-9]{2,8}$/.test(normalizeSpeCode(code));
}
