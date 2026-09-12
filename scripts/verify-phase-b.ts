/**
 * VERIFY_PHASE_B — rent roll, occupancy / LTL, budget variance, NOI bridge.
 * Run after `npm run db:reset`.
 */
import {
  buildIncomeStatement,
  buildTrialBalance,
  formatUsd,
  MASTER_COA,
} from "@rcp/ledger";
import {
  SPE_BUDGETS_2026_08,
  SPE_RENT_ROLL_SPECS,
  bookEconomicOccupancy,
  breakevenOccupancy,
  summarizeRentRoll,
} from "@rcp/properties";
import { operatingStatementFromReports } from "@rcp/reporting";
import { PrismaClient } from "@prisma/client";
import { principalPaydownFromLines } from "@rcp/ledger";

const prisma = new PrismaClient();

type Check = { name: string; ok: boolean; detail?: string };

function check(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

async function posted(entityId: string, from?: Date, to?: Date) {
  const lines = await prisma.journalLine.findMany({
    where: {
      journal: {
        status: "POSTED",
        entityId,
        ...(from && to ? { date: { gte: from, lte: to } } : to ? { date: { lte: to } } : {}),
      },
    },
    include: { account: true },
  });
  return lines.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit }));
}

async function main() {
  const checks: Check[] = [];
  const entities = await prisma.entity.findMany({ include: { periods: true, units: true } });
  const byCode = Object.fromEntries(entities.map((e) => [e.code, e]));

  for (const spec of SPE_RENT_ROLL_SPECS) {
    const entity = byCode[spec.speCode];
    checks.push(check(`${spec.speCode} exists`, Boolean(entity)));
    if (!entity) continue;
    checks.push(
      check(
        `${spec.speCode} rent-roll unit count`,
        entity.units.length === spec.unitCount && entity.unitCount === spec.unitCount,
        `${entity.units.length} units`,
      ),
    );
    const snap = entity.units.map((u) => ({
      unitCode: u.unitCode,
      floorplan: u.floorplan,
      beds: u.beds,
      bathsTenths: u.bathsTenths,
      sqft: u.sqft,
      status: u.status,
      marketRent: u.marketRent,
      inPlaceRent: u.inPlaceRent,
      leaseStart: u.leaseStart,
      leaseEnd: u.leaseEnd,
      concessionCents: u.concessionCents,
    }));
    const kpis = summarizeRentRoll(snap);
    checks.push(check(`${spec.speCode} rent-roll GPR = seed target`, kpis.gpr === spec.gpr, formatUsd(kpis.gpr)));
    checks.push(
      check(`${spec.speCode} rent-roll vacancy = seed target`, kpis.vacancyLoss === spec.vacancy, formatUsd(kpis.vacancyLoss)),
    );
    checks.push(
      check(
        `${spec.speCode} rent-roll concessions = seed target`,
        kpis.concessions === spec.concessions,
        formatUsd(kpis.concessions),
      ),
    );
    checks.push(
      check(
        `${spec.speCode} physical occupancy in (0,100%]`,
        kpis.physicalOccupancyBps !== null && kpis.physicalOccupancyBps > 0 && kpis.physicalOccupancyBps <= 10_000,
        kpis.physicalOccupancyBps === null ? "null" : `${(kpis.physicalOccupancyBps / 100).toFixed(2)}%`,
      ),
    );
    checks.push(check(`${spec.speCode} loss-to-lease is non-negative`, kpis.lossToLease >= 0n, formatUsd(kpis.lossToLease)));

    const aug = entity.periods.find((p) => p.year === 2026 && p.month === 8);
    if (!aug) {
      checks.push(check(`${spec.speCode} has 2026-08`, false));
      continue;
    }
    const inPeriod = await posted(entity.id, aug.startDate, aug.endDate);
    const throughEnd = await posted(entity.id, undefined, aug.endDate);
    const throughStart = await posted(entity.id, undefined, new Date(aug.startDate.getTime() - 1));
    const is = buildIncomeStatement({ throughEnd, inPeriod });
    checks.push(check(`${spec.speCode} GL GPR = rent-roll GPR`, is.gpr === kpis.gpr, formatUsd(is.gpr)));
    checks.push(check(`${spec.speCode} GL vacancy = rent-roll vacancy`, is.vacancy === kpis.vacancyLoss, formatUsd(is.vacancy)));
    checks.push(
      check(`${spec.speCode} GL concessions = rent-roll concessions`, is.concessions === kpis.concessions, formatUsd(is.concessions)),
    );
    checks.push(
      check(
        `${spec.speCode} AM fees below NOI`,
        is.noi === is.netIncome + is.interest + is.depreciation + is.amFees - is.amIncome,
        `NOI ${formatUsd(is.noi)} · AM ${formatUsd(is.amFees)}`,
      ),
    );

    const budgetRows = SPE_BUDGETS_2026_08[spec.speCode] ?? [];
    const budgetCount = await prisma.budgetLine.count({
      where: { entityId: entity.id, year: 2026, month: 8 },
    });
    checks.push(
      check(`${spec.speCode} 2026-08 budget seeded`, budgetCount === budgetRows.length, `${budgetCount} lines`),
    );

    const budget = new Map(budgetRows.map((r) => [r.accountCode, r.amount]));
    const os = operatingStatementFromReports({
      actualInput: { throughEnd, inPeriod },
      budget,
      priorInput: { throughEnd: throughStart, inPeriod: throughStart },
    });
    const gprLine = os.rows.find((r) => r.key === "gpr");
    checks.push(
      check(
        `${spec.speCode} OS GPR variance is actual − budget`,
        gprLine?.variance === is.gpr - (budget.get("4010") ?? 0n),
        gprLine ? formatUsd(gprLine.variance ?? 0n) : "missing",
      ),
    );
    const book = bookEconomicOccupancy(is.egi, is.gpr);
    checks.push(
      check(
        `${spec.speCode} book economic occupancy = EGI/GPR`,
        book.economicOccupancyBps === Number((is.egi * 10_000n) / is.gpr),
        `${((book.economicOccupancyBps ?? 0) / 100).toFixed(2)}%`,
      ),
    );
    const principal = principalPaydownFromLines(throughStart, throughEnd);
    const be = breakevenOccupancy({
      opex: is.opex,
      interest: is.interest,
      principalPaydown: principal,
      otherIncome: is.otherIncome,
      gpr: is.gpr,
    });
    checks.push(
      check(`${spec.speCode} breakeven occupancy computed`, be.breakevenOccupancyBps !== null, `${((be.breakevenOccupancyBps ?? 0) / 100).toFixed(2)}%`),
    );
  }

  const template = await prisma.account.count({ where: { isTemplate: true } });
  checks.push(check("Master CoA unchanged", template === MASTER_COA.length, `${template}`));

  const opco = byCode["RCP-OPCO"];
  if (opco) {
    const kids = entities.filter((e) => e.parentId === opco.id && e.type === "SPE");
    const aug = opco.periods.find((p) => p.year === 2026 && p.month === 8);
    if (aug) {
      const ids = [opco.id, ...kids.map((k) => k.id)];
      const lines = await prisma.journalLine.findMany({
        where: { journal: { status: "POSTED", entityId: { in: ids }, date: { lte: aug.endDate } } },
        include: { account: true },
      });
      const throughEnd = lines.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit }));
      const tb = buildTrialBalance({ throughEnd, eliminate: true });
      checks.push(check("OpCo combined roll-up TB in balance", tb.balanced));
    }
    const opcoBudget = await prisma.budgetLine.count({
      where: { entityId: opco.id, year: 2026, month: 8 },
    });
    checks.push(check("OpCo 2026-08 budget seeded", opcoBudget === SPE_BUDGETS_2026_08["RCP-OPCO"].length));
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  console.log("");
  console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
