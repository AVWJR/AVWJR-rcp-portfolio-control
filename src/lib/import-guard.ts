export class ReplaceRequiresConfirmError extends Error {
  readonly existingCount: number;

  constructor(existingCount: number, kind: "rent-roll" | "budget") {
    super(
      `Import replaces ${existingCount} existing ${kind} row(s). Confirm the full replace (UI checkbox, API confirmReplace, or CLI --replace).`,
    );
    this.name = "ReplaceRequiresConfirmError";
    this.existingCount = existingCount;
  }
}

export function assertReplaceConfirmed(opts: {
  existingCount: number;
  confirmReplace?: boolean;
  kind: "rent-roll" | "budget";
}) {
  if (opts.existingCount > 0 && !opts.confirmReplace) {
    throw new ReplaceRequiresConfirmError(opts.existingCount, opts.kind);
  }
}
