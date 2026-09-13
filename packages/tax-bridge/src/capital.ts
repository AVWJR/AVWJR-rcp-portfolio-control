import {
  K1_EXPORT_LIMITATIONS,
  TAX_FILING_DISCLAIMER,
  type CapitalActivityInput,
  type CapitalRollforward,
  type CapitalRollforwardRow,
  type PartnerInput,
} from "./types";

export function endingCapital(opts: {
  beginningCents: bigint;
  contributionsCents: bigint;
  distributionsCents: bigint;
  bookNiAllocCents: bigint;
}): bigint {
  return opts.beginningCents + opts.contributionsCents - opts.distributionsCents + opts.bookNiAllocCents;
}

export function allocateByBps(total: bigint, partners: PartnerInput[]): Map<string, bigint> {
  const ordered = [...partners].sort((a, b) => a.code.localeCompare(b.code));
  const map = new Map<string, bigint>();
  let remaining = total;
  for (let i = 0; i < ordered.length; i++) {
    const partner = ordered[i]!;
    if (i === ordered.length - 1) {
      map.set(partner.code, remaining);
    } else {
      const share = (total * BigInt(partner.ownershipBps)) / 10_000n;
      remaining -= share;
      map.set(partner.code, share);
    }
  }
  return map;
}

export function buildCapitalRollforward(opts: {
  entityCode: string;
  entityName: string;
  period: string;
  partners: PartnerInput[];
  activities: CapitalActivityInput[];
}): CapitalRollforward {
  const byCode = new Map(opts.partners.map((p) => [p.code, p]));
  const rows: CapitalRollforwardRow[] = opts.activities.map((act) => {
    const partner = byCode.get(act.partnerCode);
    if (!partner) throw new Error(`Unknown partner ${act.partnerCode}`);
    const endingCents = endingCapital(act);
    return {
      partnerCode: partner.code,
      partnerName: partner.name,
      role: partner.role,
      ownershipBps: partner.ownershipBps,
      tinLast4: partner.tinLast4 ?? null,
      beginningCents: act.beginningCents,
      contributionsCents: act.contributionsCents,
      distributionsCents: act.distributionsCents,
      bookNiAllocCents: act.bookNiAllocCents,
      endingCents,
      identityHolds: endingCents === endingCapital(act),
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      beginningCents: acc.beginningCents + r.beginningCents,
      contributionsCents: acc.contributionsCents + r.contributionsCents,
      distributionsCents: acc.distributionsCents + r.distributionsCents,
      bookNiAllocCents: acc.bookNiAllocCents + r.bookNiAllocCents,
      endingCents: acc.endingCents + r.endingCents,
      identityHolds: acc.identityHolds && r.identityHolds,
    }),
    {
      beginningCents: 0n,
      contributionsCents: 0n,
      distributionsCents: 0n,
      bookNiAllocCents: 0n,
      endingCents: 0n,
      identityHolds: true,
    },
  );
  totals.identityHolds =
    totals.identityHolds &&
    totals.endingCents ===
      endingCapital({
        beginningCents: totals.beginningCents,
        contributionsCents: totals.contributionsCents,
        distributionsCents: totals.distributionsCents,
        bookNiAllocCents: totals.bookNiAllocCents,
      });

  return {
    entityCode: opts.entityCode,
    entityName: opts.entityName,
    period: opts.period,
    rows,
    totals,
    limitations: K1_EXPORT_LIMITATIONS,
    disclaimer: TAX_FILING_DISCLAIMER,
  };
}
