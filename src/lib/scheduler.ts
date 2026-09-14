import { DEFAULT_SCHEDULED_JOBS } from "@rcp/documents";
import { isPackId, type PackId } from "@rcp/reporting";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildEntityPack, exportPackBuffer } from "./pack-export";
import { prisma } from "./prisma";

export const REPORTS_ROOT = resolve(process.cwd(), "data", "reports");

export function parsePeriodLabel(label: string): { year: number; month: number } {
  const [year, month] = label.split("-").map(Number);
  if (!year || !month) throw new Error(`Invalid period ${label}`);
  return { year, month };
}

export async function listReportJobs() {
  return prisma.reportJob.findMany({
    include: { runs: { orderBy: { startedAt: "desc" }, take: 5 } },
    orderBy: { code: "asc" },
  });
}

export async function runScheduledPack(opts: {
  packId: PackId | string;
  entityCode: string;
  periodLabel: string;
  jobCode?: string;
}): Promise<{
  jobId: string;
  runId: string;
  status: string;
  outputDir: string;
  files: string[];
  error?: string;
}> {
  if (!isPackId(opts.packId)) throw new Error(`Unknown pack ${opts.packId}`);
  const packId = opts.packId;
  const entity = await prisma.entity.findUnique({ where: { code: opts.entityCode } });
  if (!entity) throw new Error(`Unknown entity ${opts.entityCode}`);
  if (entity.type === "HOLDCO") throw new Error("HoldCo has no operating pack");
  if (entity.type === "SPE" && entity.lifecycleStatus === "ARCHIVED") {
    throw new Error("Archived SPE is not in live financial packs. Restore from Deal Archive.");
  }

  const def = DEFAULT_SCHEDULED_JOBS.find((j) => j.packId === packId && j.entityCode === opts.entityCode);
  const job = await prisma.reportJob.upsert({
    where: { code: opts.jobCode ?? def?.code ?? `${opts.entityCode}-${packId}` },
    update: { periodLabel: opts.periodLabel, packId, entityCode: opts.entityCode, entityId: entity.id },
    create: {
      code: opts.jobCode ?? def?.code ?? `${opts.entityCode}-${packId}`,
      packId,
      title: def?.title ?? `${opts.entityCode} ${packId}`,
      cadence: def?.cadence ?? "monthly",
      entityCode: opts.entityCode,
      periodLabel: opts.periodLabel,
      enabled: true,
      lastStatus: "RUNNING",
      notes: def?.notes,
      entityId: entity.id,
    },
  });

  const run = await prisma.reportJobRun.create({
    data: {
      jobId: job.id,
      status: "RUNNING",
      packId,
      entityCode: opts.entityCode,
      periodLabel: opts.periodLabel,
    },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = join(REPORTS_ROOT, opts.entityCode, opts.periodLabel, `${packId}-${stamp}`);
  const files: string[] = [];

  try {
    await prisma.reportJob.update({ where: { id: job.id }, data: { lastStatus: "RUNNING", lastError: null } });
    const { year, month } = parsePeriodLabel(opts.periodLabel);
    const pack = await buildEntityPack({
      entityId: entity.id,
      entityType: entity.type,
      year,
      month,
      packId,
    });
    await mkdir(outputDir, { recursive: true });
    for (const format of ["pdf", "pptx"] as const) {
      const buffer = await exportPackBuffer(pack, format);
      const filename = `${pack.filenameBase}.${format}`;
      await writeFile(join(outputDir, filename), buffer);
      files.push(filename);
    }
    await prisma.reportJobRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        outputDir,
        filesJson: JSON.stringify(files),
      },
    });
    await prisma.reportJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: "SUCCESS",
        lastOutputDir: outputDir,
        lastError: null,
      },
    });
    return { jobId: job.id, runId: run.id, status: "SUCCESS", outputDir, files };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.reportJobRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message, outputDir },
    });
    await prisma.reportJob.update({
      where: { id: job.id },
      data: { lastRunAt: new Date(), lastStatus: "FAILED", lastError: message, lastOutputDir: outputDir },
    });
    return { jobId: job.id, runId: run.id, status: "FAILED", outputDir, files, error: message };
  }
}
