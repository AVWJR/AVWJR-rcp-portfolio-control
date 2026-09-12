/**
 * Usage: npm run import:rent-roll -- --entity=SPE-WBG --file=data/samples/rent-roll.csv
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { importRentRollCsv } from "../src/lib/rent-roll";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main() {
  const code = arg("entity");
  const file = arg("file");
  const replace = process.argv.includes("--replace");
  if (!code || !file) {
    console.error("Required: --entity=SPE-WBG --file=path.csv [--replace]");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) {
    console.error(`Unknown entity ${code}`);
    process.exit(1);
  }
  const csv = readFileSync(file, "utf8");
  console.warn("WARNING: rent-roll import replaces every unit on this SPE.");
  const units = await importRentRollCsv({ entityId: entity.id, csv, confirmReplace: replace });
  console.log(`Imported ${units.length} units into ${code}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
