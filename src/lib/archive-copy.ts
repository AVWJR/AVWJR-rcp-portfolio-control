/** Seeded property SPEs that stay on the live Deals list. No database import — safe for client UI. */
export const PERMANENT_DEMO_SPE_CODES = ["SPE-WBG", "SPE-CVC", "SPE-HCR"] as const;

export function isPermanentDemoSpe(code: string): boolean {
  return (PERMANENT_DEMO_SPE_CODES as readonly string[]).includes(code.trim().toUpperCase());
}

export function permanentDemoDeleteMessage(code: string): string {
  const spe = code.trim().toUpperCase();
  return `${spe} is a permanent demo SPE. It cannot be deleted. It stays on the live Deals list and in the OpCo roll-up.`;
}

export function deleteImpactCopy(opts: { code: string; name: string }): string {
  return (
    `Deleting ${opts.name} (${opts.code}) takes it off the live Deals list and out of the OpCo combined roll-up. ` +
    `It stays studyable under gold nav Deal Archive. Books, ledgers, and vault documents remain. ` +
    `This is not a hard wipe. Restore later only from Deal Archive — not from Deals.`
  );
}
