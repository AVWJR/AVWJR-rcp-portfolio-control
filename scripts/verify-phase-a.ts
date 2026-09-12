/**
 * VERIFY_PHASE_A — programmatic checks for the Phase A done-when list.
 * Run after `npm run db:reset` (or db:push + db:seed).
 */
import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
  formatUsd,
  isJournalBalanced,
  MASTER_COA,
} from "@rcp/ledger";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Check = { name: string; ok: boolean; detail?: string };

function check(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

async function main() {
  const checks: Check[] = [];

  const entities = await prisma.entity.findMany({
    include: { parent: true, accounts: true, periods: true },
    orderBy: { code: "asc" },
  });
  const names = entities.map((e) => e.name);

  checks.push(
    check(
      "Seed entities exist",
      [
        "Roche Capital Partners HoldCo",
        "RCP Operating Company LLC",
        "Willow Bend Gardens LLC",
        "Crestview Commons LLC",
        "Harbor Court Residences LLC",
      ].every((n) => names.includes(n)),
      names.join(" | "),
    ),
  );

  const hold = entities.find((e) => e.code === "RCP-HOLD");
  const opco = entities.find((e) => e.code === "RCP-OPCO");
  const wbg = entities.find((e) => e.code === "SPE-WBG");
  const cvc = entities.find((e) => e.code === "SPE-CVC");
  const hcr = entities.find((e) => e.code === "SPE-HCR");

  checks.push(check("HoldCo → OpCo → SPE tree", Boolean(hold && opco?.parentId === hold?.id && wbg?.parentId === opco?.id && cvc?.parentId === opco?.id && hcr?.parentId === opco?.id)));
  checks.push(check("SPEs are 100% owned", [wbg, cvc, hcr].every((e) => e?.ownershipBps === 10_000)));
  checks.push(
    check(
      "SPE unit counts",
      wbg?.unitCount === 264 && cvc?.unitCount === 192 && hcr?.unitCount === 84,
      `WBG ${wbg?.unitCount} / CVC ${cvc?.unitCount} / HCR ${hcr?.unitCount}`,
    ),
  );
  checks.push(
    check(
      "SPE strategies",
      wbg?.strategy === "VALUE_ADD_GARDEN" &&
        cvc?.strategy === "STABILIZED" &&
        hcr?.strategy === "LIGHT_REHAB",
    ),
  );

  const template = await prisma.account.count({ where: { isTemplate: true } });
  checks.push(check("Master CoA template cloned", template === MASTER_COA.length && entities.every((e) => e.accounts.length === MASTER_COA.length), `template ${template} / entity CoA ${entities[0]?.accounts.length}`));

  const am = MASTER_COA.find((a) => a.code === "6310");
  checks.push(check("AM fee account is below NOI", Boolean(am?.isBelowNoi && am.name.includes("Asset Management"))));

  const journals = await prisma.journal.findMany({
    include: { lines: { include: { account: true } } },
  });
  const posted = journals.filter((j) => j.status === "POSTED");
  checks.push(check("Journals are posted", posted.length === journals.length && journals.length > 0, `${posted.length} posted`));

  let allBalanced = true;
  for (const journal of journals) {
    const lines = journal.lines.map((l) => ({
      accountCode: l.account.code,
      debit: l.debit,
      credit: l.credit,
    }));
    if (!isJournalBalanced(lines)) {
      allBalanced = false;
      checks.push(check(`Journal ${journal.id} balanced`, false, journal.memo));
    }
  }
  checks.push(check("Every posted journal is in balance", allBalanced));

  const reportEntities = [opco, wbg, cvc, hcr].filter(Boolean);
  for (const entity of reportEntities) {
    const period = entity!.periods.find((p) => p.year === 2026 && p.month === 8);
    if (!period) {
      checks.push(check(`${entity!.code} has 2026-08`, false));
      continue;
    }
    const kids = await prisma.entity.findMany({ where: { parentId: entity!.id, type: "SPE" } });
    const ids = [entity!.id, ...kids.map((k) => k.id)];
    const end = period.endDate;
    const start = period.startDate;
    const lines = await prisma.journalLine.findMany({
      where: { journal: { status: "POSTED", entityId: { in: [entity!.id] }, date: { lte: end } } },
      include: { account: true },
    });
    const throughEnd = lines.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit }));
    const startLines = await prisma.journalLine.findMany({
      where: {
        journal: { status: "POSTED", entityId: { in: [entity!.id] }, date: { lte: new Date(start.getTime() - 1) } },
      },
      include: { account: true },
    });
    const throughStart = startLines.map((l) => ({
      accountCode: l.account.code,
      debit: l.debit,
      credit: l.credit,
    }));
    const periodLines = await prisma.journalLine.findMany({
      where: {
        journal: { status: "POSTED", entityId: { in: [entity!.id] }, date: { gte: start, lte: end } },
      },
      include: { account: true },
    });
    const inPeriod = periodLines.map((l) => ({
      accountCode: l.account.code,
      debit: l.debit,
      credit: l.credit,
    }));

    const input = { throughEnd, throughStart, inPeriod };
    const tb = buildTrialBalance(input);
    const is = buildIncomeStatement(input);
    const bs = buildBalanceSheet(input);
    const cf = buildCashFlow(input);

    checks.push(check(`${entity!.code} TB in balance`, tb.balanced, `${formatUsd(tb.totalDebit)} / ${formatUsd(tb.totalCredit)}`));
    checks.push(check(`${entity!.code} BS A = L + E`, bs.balanced, `A ${formatUsd(bs.totalAssets)}`));
    checks.push(check(`${entity!.code} CF ties to cash`, cf.tiesToBalanceSheet, `end ${formatUsd(cf.endingCash)}`));
    checks.push(
      check(
        `${entity!.code} AM fee below NOI`,
        entity!.type === "SPE" ? is.noi === is.netIncome + is.interest + is.depreciation + is.amFees : true,
        `NOI ${formatUsd(is.noi)} · AM ${formatUsd(is.amFees)} · NI ${formatUsd(is.netIncome)}`,
      ),
    );

    if (entity!.code === "RCP-OPCO") {
      const consolLines = await prisma.journalLine.findMany({
        where: { journal: { status: "POSTED", entityId: { in: ids }, date: { lte: end } } },
        include: { account: true },
      });
      const consolStart = await prisma.journalLine.findMany({
        where: {
          journal: { status: "POSTED", entityId: { in: ids }, date: { lte: new Date(start.getTime() - 1) } },
        },
        include: { account: true },
      });
      const consolPeriod = await prisma.journalLine.findMany({
        where: {
          journal: { status: "POSTED", entityId: { in: ids }, date: { gte: start, lte: end } },
        },
        include: { account: true },
      });
      const consolInput = {
        throughEnd: consolLines.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit })),
        throughStart: consolStart.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit })),
        inPeriod: consolPeriod.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit })),
        eliminate: true,
      };
      const cbs = buildBalanceSheet(consolInput);
      const ccf = buildCashFlow(consolInput);
      const ctb = buildTrialBalance(consolInput);
      checks.push(check("OpCo consolidated TB", ctb.balanced));
      checks.push(check("OpCo consolidated BS", cbs.balanced, `A ${formatUsd(cbs.totalAssets)}`));
      checks.push(check("OpCo consolidated CF", ccf.tiesToBalanceSheet));
    }
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    console.log(`${mark}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  console.log("");
  console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
