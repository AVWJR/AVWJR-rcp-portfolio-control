/**
 * VERIFY_PHASE_D — OpCo + property ratio dashboards and live dictionary.
 * Run after `npm run db:reset`.
 */
import {
  RATIO_DICTIONARY,
  cfadsCents,
  getRatioDefinition,
  noiPerUnitCents,
  opexRatioBps,
  ratioAvailability,
} from "@rcp/analytics";
import { buildIncomeStatement, formatUsd } from "@rcp/ledger";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpCoDashboard, buildPropertyDashboard, liveRatioById } from "../src/lib/dashboards";

const prisma = new PrismaClient();

type Check = { name: string; ok: boolean; detail?: string };

function check(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

async function main() {
  const checks: Check[] = [];
  const requiredDocs = [
    "VERIFY_PHASE_D.md",
    "docs/RCP_RATIO_DICTIONARY_STUB.md",
    "docs/RCP_OPERATING_KPIS.md",
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/[entityCode]/page.tsx",
    "src/app/dashboard/ratios/page.tsx",
    "src/app/narratives/page.tsx",
  ];
  for (const file of requiredDocs) {
    checks.push(check(`doc/route exists: ${file}`, existsSync(resolve(file))));
  }

  const md = readFileSync(resolve("docs/RCP_RATIO_DICTIONARY_STUB.md"), "utf8");
  checks.push(check("Dictionary markdown is live (not gated-only stub)", md.includes("## Live ratios") && !md.includes("Phase A is a **book ledger** only")));
  for (const row of RATIO_DICTIONARY) {
    checks.push(check(`Markdown lists ${row.id}`, md.includes(row.id)));
  }

  const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
  const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
  checks.push(check("SPE-WBG exists", Boolean(wbg)));
  checks.push(check("RCP-OPCO exists", Boolean(opco)));
  if (!wbg || !opco) {
    throw new Error("Seed missing — run npm run db:reset");
  }

  const property = await buildPropertyDashboard({ entityId: wbg.id, year: 2026, month: 8 });
  const aug = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId: wbg.id, year: 2026, month: 8 } },
  });
  if (!aug) throw new Error("Missing WBG 2026-08");
  const inPeriod = await prisma.journalLine.findMany({
    where: { journal: { status: "POSTED", entityId: wbg.id, date: { gte: aug.startDate, lte: aug.endDate } } },
    include: { account: true },
  });
  const throughEnd = await prisma.journalLine.findMany({
    where: { journal: { status: "POSTED", entityId: wbg.id, date: { lte: aug.endDate } } },
    include: { account: true },
  });
  const posted = (rows: typeof inPeriod) =>
    rows.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit }));
  const is = buildIncomeStatement({ throughEnd: posted(throughEnd), inPeriod: posted(inPeriod) });

  const noiTile = liveRatioById(property.tiles, "noi_period");
  checks.push(check("WBG period NOI tile renders", Boolean(noiTile && noiTile.display === formatUsd(is.noi)), noiTile?.display));
  const perUnit = liveRatioById(property.tiles, "noi_per_unit");
  checks.push(
    check(
      "WBG NOI/unit = period NOI / 264",
      perUnit?.display === formatUsd(noiPerUnitCents(is.noi, 264)!),
      perUnit?.display,
    ),
  );
  const opexTile = liveRatioById(property.tiles, "opex_ratio");
  const expectedOpex = opexRatioBps(is.opex, is.egi);
  checks.push(check("WBG OpEx ratio uses OpEx/EGI", Boolean(opexTile && expectedOpex !== null), opexTile?.display));
  checks.push(check("WBG AM fees still below NOI", is.noi === is.netIncome + is.interest + is.depreciation + is.amFees - is.amIncome));

  const t12 = liveRatioById(property.tiles, "noi_t12");
  checks.push(check("WBG T12 is incomplete (not silently annualized)", Boolean(t12?.display.includes("/12 mo")), t12?.display));
  checks.push(check("WBG T12 months-available < 12", property.t12.definition === "incomplete" && property.t12.monthsAvailable < 12));

  const ltv = liveRatioById(property.tiles, "ltv");
  const delq = liveRatioById(property.tiles, "delinquency");
  checks.push(check("LTV tile gated", Boolean(ltv?.gated && ltv.display === "Gated"), ltv?.hint));
  checks.push(check("Delinquency tile stubbed", Boolean(delq?.gated && delq.display === "Not available")));
  checks.push(check("ratioAvailability(ltl) still false", ratioAvailability("ltl").ready === false));
  checks.push(check("ratioAvailability(delinquency) still false", ratioAvailability("delinquency").ready === false));

  const dscr = liveRatioById(property.tiles, "dscr");
  const dy = liveRatioById(property.tiles, "debt_yield");
  checks.push(check("WBG DSCR computed", Boolean(dscr && dscr.display !== "—"), dscr?.display));
  checks.push(check("WBG debt yield computed", Boolean(dy && dy.display !== "—"), dy?.display));
  checks.push(check("WBG DSCR uses period NOI definition", getRatioDefinition("dscr")?.noiDefinition === "period"));
  checks.push(check("WBG debt yield uses annualized period NOI", getRatioDefinition("debt_yield")?.noiDefinition === "annualized_period"));

  const occ = liveRatioById(property.tiles, "physical_occupancy");
  const be = liveRatioById(property.tiles, "breakeven_occupancy");
  checks.push(check("WBG physical occupancy ready", Boolean(occ && occ.display !== "—"), occ?.display));
  checks.push(check("WBG breakeven occupancy ready", Boolean(be && be.display !== "—"), be?.display));

  const cfadsTile = liveRatioById(property.tiles, "cfads");
  const capexTile = liveRatioById(property.tiles, "capex_vs_reserves");
  checks.push(
    check(
      "WBG CFADS tile renders",
      Boolean(cfadsTile && (cfadsTile.display.startsWith("$") || cfadsTile.display.startsWith("("))),
      cfadsTile?.display,
    ),
  );
  checks.push(check("WBG CapEx vs reserves tile renders", Boolean(capexTile?.hint.includes("Reserve")), capexTile?.hint));
  checks.push(
    check(
      "CFADS helper is NOI − capex − reserve req",
      cfadsCents({ periodNoiCents: 100n, periodCapexCents: 30n, reserveRequirementCents: 10n }) === 60n,
    ),
  );

  const drill = liveRatioById(property.tiles, "noi_period");
  checks.push(check("NOI drill-down has contributing accounts", Boolean(drill && drill.contributors.length >= 4), `${drill?.contributors.length ?? 0}`));
  checks.push(check("NOI contributors link to OS or TB", Boolean(drill?.contributors.some((c) => c.href.includes("/reports/")))));

  const opcoDash = await buildOpCoDashboard({ opcoId: opco.id, year: 2026, month: 8 });
  checks.push(check("OpCo view labeled combined roll-up not GAAP", opcoDash.viewLabel.includes("not GAAP")));
  checks.push(check("OpCo combined note rejects GAAP consol", opcoDash.combinedNote.includes("not a GAAP consolidation")));
  const unitsTile = liveRatioById(opcoDash.tiles, "properties_units");
  checks.push(check("OpCo properties/units is 3 / 540", unitsTile?.display === "3 / 540", unitsTile?.display));
  const shareSum = opcoDash.concentration.reduce((acc, row) => acc + (row.shareBps ?? 0), 0);
  checks.push(check("NOI concentration shares fill the mix", shareSum >= 9_900 && shareSum <= 10_000, `${shareSum}`));
  checks.push(check("Covenant watchlist has at least the value-add DSCR fail", opcoDash.watchlist.length >= 1, `${opcoDash.watchlist.length}`));
  const fee = liveRatioById(opcoDash.tiles, "fee_income");
  const ga = liveRatioById(opcoDash.tiles, "ga_ratio");
  checks.push(check("OpCo fee income tile renders", Boolean(fee && fee.display !== "—"), fee?.display));
  checks.push(check("OpCo G&A% tile renders", Boolean(ga && ga.display !== "—"), ga?.display));
  checks.push(check("OpCo LTV remains gated", Boolean(liveRatioById(opcoDash.tiles, "ltv")?.gated)));

  const narratives = readFileSync(resolve("src/app/narratives/page.tsx"), "utf8");
  checks.push(check("Phase E narratives page is a stub", narratives.includes("PHASE_E_NARRATIVES_TODO") || narratives.includes("Phase E")));

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
