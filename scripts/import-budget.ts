/**
 * Usage: npm run import:budget -- --entity=SPE-WBG --period=2026-08 --file=data/samples/budget.csv
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { importBudgetCsv } from "../src/lib/budgets";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main() {
  const code = arg("entity");
  const file = arg("file");
  const period = arg("period") ?? "2026-08";
  if (!code || !file) {
    console.error("Required: --entity=SPE-WBG --file=path.csv [--period=2026-08]");
    process.exit(1);
  }
  const [year, month] = period.split("-").map(Number);
  const prisma = new PrismaClient();
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) {
    console.error(`Unknown entity ${code}`);
    process.exit(1);
  }
  const csv = readFileSync(file, "utf8");
  const rows = await importBudgetCsv({ entityId: entity.id, year, month, csv, source: "cli" });
  console.log(`Imported ${rows.length} budget lines into ${code} ${period}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
