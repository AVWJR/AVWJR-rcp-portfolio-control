/**
 * VERIFY_PHASE_C — debt file, CIP/capex, intercompany match, period close lock.
 * Run after `npm run db:reset`.
 */
import {
  CLOSE_CHECKLIST,
  MASTER_COA,
  PeriodLockedError,
  assertCanPostToPeriod,
  buildIncomeStatement,
  formatUsd,
  reviewIntercompany,
} from "@rcp/ledger";
import { PrismaClient } from "@prisma/client";
import { computeCovenants } from "@rcp/debt";

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

function creditNet(lines: { accountCode: string; debit: bigint; credit: bigint }[], code: string) {
  return lines
    .filter((l) => l.accountCode === code)
    .reduce((acc, l) => acc + l.credit - l.debit, 0n);
}

async function main() {
  const checks: Check[] = [];
  const entities = await prisma.entity.findMany({ include: { periods: true, loans: true, capexProjects: true } });
  const byCode = Object.fromEntries(entities.map((e) => [e.code, e]));
  const spes = ["SPE-WBG", "SPE-CVC", "SPE-HCR"];

  checks.push(check("CIP 1460 is on the master CoA", MASTER_COA.some((a) => a.code === "1460" && a.reportGroup === "cip")));

  for (const code of spes) {
    const entity = byCode[code];
    checks.push(check(`${code} has exactly one loan`, entity?.loans.length === 1, `${entity?.loans.length ?? 0}`));
    if (!entity || entity.loans.length !== 1) continue;
    const loan = entity.loans[0];
    const aug = entity.periods.find((p) => p.year === 2026 && p.month === 8);
    if (!aug) {
      checks.push(check(`${code} has 2026-08`, false));
      continue;
    }
    const throughEnd = await posted(entity.id, undefined, aug.endDate);
    const inPeriod = await posted(entity.id, aug.startDate, aug.endDate);
    const glUpb = creditNet(throughEnd, "2110") + creditNet(throughEnd, "2210");
    checks.push(
      check(`${code} loan UPB = GL 2110+2210`, loan.currentUpbCents === glUpb, `${formatUsd(loan.currentUpbCents)} vs ${formatUsd(glUpb)}`),
    );
    const payment = await prisma.loanPayment.findUnique({
      where: { loanId_year_month: { loanId: loan.id, year: 2026, month: 8 } },
    });
    const glInterest = inPeriod.filter((l) => l.accountCode === "6110").reduce((acc, l) => acc + l.debit - l.credit, 0n);
    checks.push(
      check(
        `${code} August loan interest = GL 6110`,
        Boolean(payment && payment.interestCents === glInterest),
        payment ? formatUsd(payment.interestCents) : "missing payment",
      ),
    );
    const is = buildIncomeStatement({ throughEnd, inPeriod });
    const covenants = computeCovenants({
      noiCents: is.noi,
      interestCents: payment?.interestCents ?? 0n,
      principalCents: payment?.principalCents ?? 0n,
      upbCents: loan.currentUpbCents,
      dscrThresholdBps: loan.dscrThresholdBps,
      debtYieldThresholdBps: loan.debtYieldThresholdBps,
    });
    checks.push(
      check(
        `${code} DSCR computed`,
        covenants.dscrBps !== null,
        covenants.dscrBps === null ? "n/a" : `${(covenants.dscrBps / 10_000).toFixed(2)}x`,
      ),
    );
    checks.push(
      check(
        `${code} debt yield computed`,
        covenants.debtYieldBps !== null,
        covenants.debtYieldBps === null ? "n/a" : `${(covenants.debtYieldBps / 100).toFixed(2)}%`,
      ),
    );
    checks.push(
      check(`${code} AM fees still below NOI`, is.noi === is.netIncome + is.interest + is.depreciation + is.amFees - is.amIncome),
    );
  }

  const wbg = byCode["SPE-WBG"];
  if (wbg) {
    const interiors = wbg.capexProjects.find((p) => p.classification === "CAPEX" && p.cipCents > 0n);
    const rm = wbg.capexProjects.find((p) => p.classification === "REPAIRS_MAINTENANCE");
    checks.push(check("WBG has a CIP value-add project", Boolean(interiors && interiors.placedInServiceCents > 0n)));
    checks.push(check("WBG has an R&M tracker (not CIP)", Boolean(rm && rm.cipCents === 0n)));
    const jul = wbg.periods.find((p) => p.year === 2026 && p.month === 7);
    checks.push(check("WBG 2026-07 is hard locked", jul?.status === "CLOSED", jul?.status));
    if (jul) {
      let blocked = false;
      try {
        assertCanPostToPeriod(jul.status);
      } catch (error) {
        blocked = error instanceof PeriodLockedError;
      }
      checks.push(check("Posting to locked WBG July is rejected", blocked));
      const items = await prisma.closeChecklistItem.findMany({ where: { periodId: jul.id } });
      checks.push(
        check(
          "WBG July checklist complete",
          items.length === CLOSE_CHECKLIST.length && items.every((i) => i.status === "DONE" || i.status === "NA"),
        ),
      );
    }
  }

  const cvc = byCode["SPE-CVC"];
  const cvcJul = cvc?.periods.find((p) => p.year === 2026 && p.month === 7);
  checks.push(check("CVC 2026-07 is soft closed", cvcJul?.status === "SOFT_CLOSED", cvcJul?.status));

  const packed = [];
  for (const entity of entities.filter((e) => e.type === "OPCO" || e.type === "SPE")) {
    const aug = entity.periods.find((p) => p.year === 2026 && p.month === 8);
    if (!aug) continue;
    packed.push({
      code: entity.code,
      type: entity.type,
      lines: await posted(entity.id, undefined, aug.endDate),
    });
  }
  const ic = reviewIntercompany(packed);
  checks.push(check("OpCo↔SPE IC 1310/2310 matched", ic.icMatched, ic.findings.join("; ") || formatUsd(ic.speDueTo)));
  checks.push(check("AM fee 6310/7010 matched", ic.amMatched, formatUsd(ic.speAmExpense)));

  const units = await prisma.unit.count();
  checks.push(check("Rent-roll KPIs intact (540 units)", units === 264 + 192 + 84, `${units}`));

  const template = await prisma.account.count({ where: { isTemplate: true } });
  checks.push(check("Master CoA includes CIP clone", template === MASTER_COA.length, `${template}`));

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
