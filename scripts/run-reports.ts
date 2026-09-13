/**
 * Generate Phase E packs on a cadence. Writes PDF + PPTX and persists last-run status.
 * No email send.
 *
 *   npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG --period=2026-08
 *   npm run reports:run -- --pack=quarterly_lender
 *   npm run reports:run -- --pack=all
 */
import { SCHEDULED_PACK_IDS } from "@rcp/documents";
import { isPackId } from "@rcp/reporting";
import { runScheduledPack } from "../src/lib/scheduler";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const pack = arg("pack", "monthly_investor") ?? "monthly_investor";
  const entity = arg("entity", "SPE-WBG") ?? "SPE-WBG";
  const period = arg("period", "2026-08") ?? "2026-08";
  const jobCode = arg("job");

  const packs = pack === "all" ? [...SCHEDULED_PACK_IDS] : [pack];
  let failed = 0;
  for (const id of packs) {
    if (!isPackId(id)) {
      console.error(`Unknown pack ${id}`);
      failed += 1;
      continue;
    }
    const result = await runScheduledPack({
      packId: id,
      entityCode: entity,
      periodLabel: period,
      jobCode,
    });
    console.log(`${result.status}  ${id}  ${entity}  ${period}`);
    if (result.files.length) console.log(`  files: ${result.files.join(", ")}`);
    if (result.outputDir) console.log(`  dir: ${result.outputDir}`);
    if (result.error) console.log(`  error: ${result.error}`);
    if (result.status !== "SUCCESS") failed += 1;
  }
  if (failed) process.exitCode = 1;
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
