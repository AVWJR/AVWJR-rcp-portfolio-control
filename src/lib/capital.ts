import {
  allocateByBps,
  buildCapitalRollforward,
  endingCapital,
  type CapitalActivityInput,
  type CapitalRollforward,
  type PartnerInput,
} from "@rcp/tax-bridge";
import { buildIncomeStatement, netByCode, rollupBalances } from "@rcp/ledger";
import { prisma } from "./prisma";
import { resolveReportScope } from "./reports-server";

export async function loadCapitalRollforward(opts: {
  entityId: string;
  year: number;
  month: number;
}): Promise<CapitalRollforward> {
  const scope = await resolveReportScope({ ...opts, consolidated: false });
  const is = buildIncomeStatement({
    throughEnd: scope.throughEnd,
    inPeriod: scope.inPeriod,
    eliminate: false,
  });
  const startBalances = rollupBalances(scope.throughStart);
  const periodBalances = rollupBalances(scope.inPeriod);

  // 3010 credit-normal contributions; 3020 debit-normal distributions.
  const beginning = -netByCode(startBalances, "3010") - netByCode(startBalances, "3020");
  const periodContrib = -netByCode(periodBalances, "3010");
  const periodDist = netByCode(periodBalances, "3020");

  const partners = await prisma.partner.findMany({
    where: { entityId: scope.entity.id },
    orderBy: { code: "asc" },
  });
  const partnerInputs: PartnerInput[] =
    partners.length > 0
      ? partners.map((p) => ({
          code: p.code,
          name: p.name,
          role: p.role === "GP" || p.role === "LP" ? p.role : "MEMBER",
          ownershipBps: p.ownershipBps,
          tinLast4: p.tinLast4,
        }))
      : [
          {
            code: "UNASSIGNED",
            name: `${scope.entity.name} (no partner master)`,
            role: "MEMBER",
            ownershipBps: 10_000,
          },
        ];

  const begAlloc = allocateByBps(beginning, partnerInputs);
  const contribAlloc = allocateByBps(periodContrib, partnerInputs);
  const distAlloc = allocateByBps(periodDist, partnerInputs);
  const niAlloc = allocateByBps(is.netIncome, partnerInputs);

  const activities: CapitalActivityInput[] = partnerInputs.map((p) => ({
    partnerCode: p.code,
    beginningCents: begAlloc.get(p.code) ?? 0n,
    contributionsCents: contribAlloc.get(p.code) ?? 0n,
    distributionsCents: distAlloc.get(p.code) ?? 0n,
    bookNiAllocCents: niAlloc.get(p.code) ?? 0n,
  }));

  const roll = buildCapitalRollforward({
    entityCode: scope.entity.code,
    entityName: scope.entity.name,
    period: `${opts.year}-${String(opts.month).padStart(2, "0")}`,
    partners: partnerInputs,
    activities,
  });

  for (const row of roll.rows) {
    if (!row.identityHolds) {
      throw new Error(`Capital identity failed for ${row.partnerCode}`);
    }
    const expected = endingCapital(row);
    if (expected !== row.endingCents) throw new Error("Capital ending mismatch");
  }
  return roll;
}
