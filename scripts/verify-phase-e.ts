/**
 * VERIFY_PHASE_E — infographics, five-audience narratives, PDF/PPTX packs.
 * Run after `npm run db:reset`.
 */
import { PHASE_F_VAULT_TODO, renderPdfPack, renderPptxPack } from "@rcp/documents";
import { TAX_BRIDGE_STATUS } from "@rcp/tax-bridge";
import {
  AUDIENCES,
  CHART_IDS,
  PACK_CATALOG,
  PACK_IDS,
  buildAllNarratives,
  buildChartSuite,
  buildPack,
  chartIdsPresent,
} from "@rcp/reporting";
import { buildIncomeStatement, formatUsd } from "@rcp/ledger";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPeriodSnapshot } from "../src/lib/period-snapshot";

const prisma = new PrismaClient();

type Check = { name: string; ok: boolean; detail?: string };

function check(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

async function main() {
  const checks: Check[] = [];
  const requiredDocs = [
    "VERIFY_PHASE_E.md",
    "docs/RCP_REPORT_CATALOG.md",
    "src/app/narratives/page.tsx",
    "src/app/narratives/packs/[packId]/page.tsx",
    "src/app/api/narratives/route.ts",
    "src/app/api/packs/[packId]/route.ts",
  ];
  for (const file of requiredDocs) {
    checks.push(check(`doc/route exists: ${file}`, existsSync(resolve(file))));
  }

  const catalog = readFileSync(resolve("docs/RCP_REPORT_CATALOG.md"), "utf8");
  const readme = readFileSync(resolve("README.md"), "utf8");
  checks.push(check("Report catalog lists five audiences", AUDIENCES.every((a) => catalog.includes(`\`${a}\``))));
  for (const id of PACK_IDS) {
    checks.push(check(`Catalog lists pack ${id}`, catalog.includes(id)));
  }
  checks.push(check("README has Phase E section", readme.includes("Phase E")));
  checks.push(check("PACK_CATALOG has four packs", PACK_CATALOG.length === 4));

  const narrativesPage = readFileSync(resolve("src/app/narratives/page.tsx"), "utf8");
  checks.push(check("Narratives page is no longer a stub", !narrativesPage.includes("PHASE_E_NARRATIVES_TODO") && narrativesPage.includes("buildAllNarratives")));

  const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
  const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
  checks.push(check("SPE-WBG exists", Boolean(wbg)));
  checks.push(check("RCP-OPCO exists", Boolean(opco)));
  if (!wbg || !opco) throw new Error("Seed missing — run npm run db:reset");

  const wbgSnap = await loadPeriodSnapshot({ entityId: wbg.id, entityType: "SPE", year: 2026, month: 8 });
  const opcoSnap = await loadPeriodSnapshot({ entityId: opco.id, entityType: "OPCO", year: 2026, month: 8 });
  const wbgJuly = await loadPeriodSnapshot({ entityId: wbg.id, entityType: "SPE", year: 2026, month: 7 });

  const wbgNarr = buildAllNarratives(wbgSnap);
  const opcoNarr = buildAllNarratives(opcoSnap);
  const julyNarr = buildAllNarratives(wbgJuly);
  for (const audience of AUDIENCES) {
    checks.push(check(`WBG ${audience} narrative present`, wbgNarr[audience].sections.length >= 3));
    checks.push(check(`OpCo ${audience} narrative present`, opcoNarr[audience].sections.length >= 3));
    const body = wbgNarr[audience].sections.map((s) => s.body).join(" ");
    checks.push(check(`WBG ${audience} cites period NOI $`, body.includes(formatUsd(wbgSnap.noiCents))));
    checks.push(check(`WBG ${audience} cites units or USD`, /\$|units|%|x/.test(body)));
  }
  checks.push(check("IC includes go/hold/fix", Boolean(wbgNarr.ic.recommendation?.action)));
  checks.push(
    check(
      "Narratives change when period changes",
      wbgNarr.lp.sections[0]!.body !== julyNarr.lp.sections[0]!.body && wbgNarr.lp.period === "2026-08" && julyNarr.lp.period === "2026-07",
    ),
  );
  checks.push(check("LP mentions distributions proxy / CFADS", wbgNarr.lp.sections.some((s) => /CFADS|distributions proxy/i.test(s.body))));
  checks.push(check("Lender mentions DSCR and reserves", /DSCR/.test(wbgNarr.lender.sections.map((s) => s.body).join(" ")) && /reserve/i.test(wbgNarr.lender.sections.map((s) => s.body).join(" "))));
  checks.push(check("Mgmt assigns variance owners", /variance/i.test(wbgNarr.mgmt.sections.map((s) => s.body).join(" "))));

  const suite = buildChartSuite(wbgSnap);
  const present = chartIdsPresent(suite);
  for (const id of CHART_IDS) {
    checks.push(check(`Chart suite includes ${id}`, present.includes(id)));
  }

  const investor = buildPack(wbgSnap, "monthly_investor");
  const lender = buildPack(wbgSnap, "quarterly_lender");
  const ic = buildPack(wbgSnap, "ic_memo");
  const flash = buildPack(wbgSnap, "management_flash");
  checks.push(check("Investor pack audience is LP", investor.meta.audience === "lp" && investor.slides.length >= 5));
  checks.push(check("Lender pack audience is lender", lender.meta.audience === "lender"));
  checks.push(check("IC pack has recommendation slide narrative", Boolean(ic.narrative.recommendation)));
  checks.push(check("Flash pack audience is mgmt", flash.meta.audience === "mgmt"));

  const pdf = await renderPdfPack(investor);
  const pptx = await renderPptxPack(lender);
  checks.push(check("PDF magic %PDF", pdf.subarray(0, 4).toString("utf8") === "%PDF", pdf.subarray(0, 8).toString("utf8")));
  checks.push(check("PPTX magic PK", pptx.subarray(0, 2).toString("utf8") === "PK", `${pptx.length} bytes`));
  checks.push(check("PDF is non-trivial", pdf.length > 1_000));
  checks.push(check("PPTX is non-trivial", pptx.length > 1_000));

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
  const posted = (rows: typeof inPeriod) => rows.map((l) => ({ accountCode: l.account.code, debit: l.debit, credit: l.credit }));
  const is = buildIncomeStatement({ throughEnd: posted(throughEnd), inPeriod: posted(inPeriod) });
  checks.push(check("Snapshot NOI matches IS NOI", wbgSnap.noiCents === is.noi, formatUsd(wbgSnap.noiCents)));
  checks.push(check("AM fees still below NOI", is.noi === is.netIncome + is.interest + is.depreciation + is.amFees - is.amIncome));
  checks.push(check("LTV gated on snapshot", wbgSnap.ltvGated === true && /appraisal|book cost/i.test(wbgSnap.ltvReason)));
  checks.push(check("Delinquency gated on snapshot", wbgSnap.delinquencyGated === true));
  checks.push(check("T12 incomplete on seed", !wbgSnap.t12Complete && wbgSnap.t12MonthsAvailable < 12));
  checks.push(check("OpCo combined note rejects GAAP", Boolean(opcoSnap.combinedNote?.includes("not a GAAP consolidation"))));
  checks.push(check("OpCo roll-up flag set", opcoSnap.rollupIsNotGaap));
  checks.push(check("Phase E pack catalog still four packs", PACK_CATALOG.length === 4));
  checks.push(check("Phase F vault constant exported", PHASE_F_VAULT_TODO.length > 0));
  checks.push(check("Phase F tax status exported", Boolean(TAX_BRIDGE_STATUS)));

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
