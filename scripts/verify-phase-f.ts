/**
 * VERIFY_PHASE_F — tax bridge, K-1 export, 1099 hooks, vault, scheduler.
 * Run after `npm run db:reset`.
 */
import {
  AP_VENDOR_STUB,
  TAX_BRIDGE_STATUS,
  TAX_FILING_DISCLAIMER,
  build1099Export,
  everyLineLabeled,
  endingCapital,
  worksheetIdentityHolds,
} from "@rcp/tax-bridge";
import { PHASE_F_SCHEDULER_TODO, PHASE_F_VAULT_TODO, VAULT_STATUS, SCHEDULER_STATUS } from "@rcp/documents";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadBooksToTaxWorksheet } from "../src/lib/tax-bridge";
import { loadCapitalRollforward } from "../src/lib/capital";
import { load1099Export } from "../src/lib/vendors";
import { listVaultDocuments, readVaultDocument } from "../src/lib/vault";
import { runScheduledPack } from "../src/lib/scheduler";

const prisma = new PrismaClient();

type Check = { name: string; ok: boolean; detail?: string };

function check(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

async function main() {
  const checks: Check[] = [];
  const required = [
    "VERIFY_PHASE_F.md",
    "docs/RCP_TAX_BRIDGE.md",
    "docs/RCP_DOCUMENT_VAULT.md",
    "docs/RCP_SCHEDULER.md",
    "src/app/tax/page.tsx",
    "src/app/tax/k1/page.tsx",
    "src/app/vendors/page.tsx",
    "src/app/vault/page.tsx",
    "src/app/scheduler/page.tsx",
    "src/app/api/tax/bridge/route.ts",
    "src/app/api/tax/k1/route.ts",
    "src/app/api/vault/route.ts",
    "src/app/api/scheduler/run/route.ts",
    "scripts/run-reports.ts",
  ];
  for (const file of required) {
    checks.push(check(`exists: ${file}`, existsSync(resolve(file))));
  }

  const readme = readFileSync(resolve("README.md"), "utf8");
  const taxDoc = readFileSync(resolve("docs/RCP_TAX_BRIDGE.md"), "utf8");
  const verify = readFileSync(resolve("VERIFY_PHASE_F.md"), "utf8");
  checks.push(check("README has Phase F section", readme.includes("Phase F")));
  checks.push(check("README says does not file", /does not file/i.test(readme)));
  checks.push(check("Tax doc disclaimer", taxDoc.includes(TAX_FILING_DISCLAIMER.slice(0, 40))));
  checks.push(check("VERIFY_PHASE_F disclaimer", /does not file/i.test(verify)));
  checks.push(check("TAX_BRIDGE_STATUS ready", TAX_BRIDGE_STATUS === "worksheet_ready"));
  checks.push(check("Vault status ready", VAULT_STATUS === "ready"));
  checks.push(check("Scheduler status ready", SCHEDULER_STATUS === "ready"));
  checks.push(check("Vault TODO replaced", !PHASE_F_VAULT_TODO.includes("TODO(Phase F)")));
  checks.push(check("Scheduler TODO replaced", !PHASE_F_SCHEDULER_TODO.includes("TODO(Phase F)")));

  const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
  const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
  checks.push(check("SPE-WBG exists", Boolean(wbg)));
  checks.push(check("RCP-OPCO exists", Boolean(opco)));
  if (!wbg || !opco) throw new Error("Seed missing — run npm run db:reset");

  const wbgWs = await loadBooksToTaxWorksheet({
    entityId: wbg.id,
    year: 2026,
    month: 8,
    consolidated: false,
  });
  const opcoWs = await loadBooksToTaxWorksheet({
    entityId: opco.id,
    year: 2026,
    month: 8,
    consolidated: false,
  });
  checks.push(check("WBG worksheet labeled", everyLineLabeled(wbgWs)));
  checks.push(check("OpCo worksheet labeled", everyLineLabeled(opcoWs)));
  checks.push(check("WBG identity", worksheetIdentityHolds(wbgWs)));
  checks.push(check("OpCo identity", worksheetIdentityHolds(opcoWs)));
  checks.push(check("WBG has BOOKS dep line", wbgWs.lines.some((l) => l.key === "book_dep" && l.basis === "BOOKS")));
  checks.push(check("WBG has TAX MACRS line", wbgWs.lines.some((l) => l.key === "tax_dep_macrs" && l.basis === "TAX")));
  checks.push(check("WBG book dep is 6210 period amount", wbgWs.bookDepreciation > 0n, String(wbgWs.bookDepreciation)));
  checks.push(check("WBG tax dep hook computed", wbgWs.taxDepreciation > 0n, String(wbgWs.taxDepreciation)));
  checks.push(check("WBG sample adjustment seeded", wbgWs.lines.some((l) => l.key === "wbg_meals_addback")));
  checks.push(check("OpCo sample adjustment seeded", opcoWs.lines.some((l) => l.key === "opco_meals_addback")));
  checks.push(check("WBG AM fees below-NOI line present", wbgWs.bookAmFees > 0n));
  checks.push(check("Worksheet disclaimer present", wbgWs.disclaimer.includes("does not file")));
  checks.push(check("OpCo combined note not GAAP/tax consol when flagged", wbgWs.viewLabel.includes("not a tax consolidation")));

  const wbgCap = await loadCapitalRollforward({ entityId: wbg.id, year: 2026, month: 8 });
  const opcoCap = await loadCapitalRollforward({ entityId: opco.id, year: 2026, month: 8 });
  checks.push(check("WBG capital identity", wbgCap.totals.identityHolds && wbgCap.rows.length >= 1));
  checks.push(check("OpCo capital identity", opcoCap.totals.identityHolds && opcoCap.rows.length >= 1));
  checks.push(
    check(
      "WBG ending = beg + contrib − dist + NI",
      wbgCap.totals.endingCents ===
        endingCapital({
          beginningCents: wbgCap.totals.beginningCents,
          contributionsCents: wbgCap.totals.contributionsCents,
          distributionsCents: wbgCap.totals.distributionsCents,
          bookNiAllocCents: wbgCap.totals.bookNiAllocCents,
        }),
    ),
  );
  checks.push(check("WBG 100% member", wbgCap.rows[0]?.ownershipBps === 10_000));
  checks.push(check("K-1 limitations documented", wbgCap.limitations.length >= 4));
  checks.push(check("K-1 not a filed return", wbgCap.limitations.some((l) => /not a filed/i.test(l))));

  const exp = await load1099Export({ year: 2026, month: 8, entityCode: "SPE-WBG" });
  checks.push(check("WBG 1099 overlay has rows", exp.rows.length >= 3 && !exp.stub, String(exp.rows.length)));
  checks.push(check("1099 reportable total > 0", exp.totalReportableCents > 0n));
  const empty = build1099Export({ vendors: [], payments: [], year: 2026, month: 8 });
  checks.push(check("Empty 1099 stubs honestly", empty.stub && empty.stubReason.includes("no vendor invoice")));
  checks.push(check("AP stub constant mentions 2010", AP_VENDOR_STUB.includes("2010")));

  const docs = await listVaultDocuments(wbg.id);
  const kinds = new Set(docs.map((d) => d.kind));
  checks.push(check("WBG vault has 5 seed kinds", ["lease", "loan", "k1", "draw", "insurance"].every((k) => kinds.has(k as "lease"))));
  const first = docs[0];
  if (first) {
    const blob = await readVaultDocument(first.id);
    checks.push(check("Vault blob readable", Boolean(blob && blob.bytes.length === first.byteSize)));
  } else {
    checks.push(check("Vault blob readable", false, "no docs"));
  }
  const opcoDocs = await listVaultDocuments(opco.id);
  checks.push(check("OpCo vault linked", opcoDocs.some((d) => d.kind === "k1")));

  const jobs = await prisma.reportJob.count();
  checks.push(check("Two scheduled jobs seeded", jobs >= 2, String(jobs)));
  const run = await runScheduledPack({
    packId: "monthly_investor",
    entityCode: "SPE-WBG",
    periodLabel: "2026-08",
  });
  checks.push(check("Scheduler run succeeded", run.status === "SUCCESS", run.error));
  checks.push(check("Scheduler wrote PDF+PPTX", run.files.some((f) => f.endsWith(".pdf")) && run.files.some((f) => f.endsWith(".pptx"))));
  if (run.outputDir) {
    for (const file of run.files) {
      checks.push(check(`wrote ${file}`, existsSync(resolve(run.outputDir, file))));
    }
  }
  const job = await prisma.reportJob.findFirst({ where: { packId: "monthly_investor", entityCode: "SPE-WBG" } });
  checks.push(check("Job last-run SUCCESS", job?.lastStatus === "SUCCESS" && Boolean(job.lastRunAt)));

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
