import { hardLockAction, reopenAction, softCloseAction } from "@/app/actions/close";
import { createEntityWithCoa } from "@/lib/entities";
import { openPeriod } from "@/lib/deals/periods";
import { closePickerNote, completeChecklist } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const ids: string[] = [];

async function removeEntity(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.periodCloseEvent.deleteMany({ where: { period: { entityId: id } } });
    await tx.closeChecklistItem.deleteMany({ where: { period: { entityId: id } } });
    await tx.journalLine.deleteMany({
      where: { OR: [{ journal: { entityId: id } }, { account: { entityId: id } }] },
    });
    await tx.journal.deleteMany({ where: { entityId: id } });
    await tx.period.deleteMany({ where: { entityId: id } });
    await tx.account.deleteMany({ where: { entityId: id } });
    await tx.entity.deleteMany({ where: { id } });
  });
}

afterAll(async () => {
  for (const id of ids) {
    await removeEntity(id);
  }
  await prisma.$disconnect();
});

function form(periodId: string, extra?: Record<string, string>) {
  const data = new FormData();
  data.set("periodId", periodId);
  for (const [key, value] of Object.entries(extra ?? {})) data.set(key, value);
  return data;
}

describe("Period Close refuses deals that are not Owned", () => {
  it("disables Pipeline, Screened, and Test on the picker and leaves Owned and OpCo selectable", () => {
    expect(closePickerNote({ type: "SPE", code: "SPE-X", lifecycleStatus: "LIVE", dealStatus: "PIPELINE" })).toBe(
      "SPE-X is Pipeline, not Owned. Soft close and hard close are only for Owned deals. This month was not closed.",
    );
    expect(closePickerNote({ type: "SPE", code: "SPE-S", lifecycleStatus: "LIVE", dealStatus: "SCREENED" })).toMatch(
      /SPE-S is Screened, not Owned/,
    );
    expect(closePickerNote({ type: "SPE", code: "SPE-T", lifecycleStatus: "LIVE", dealStatus: "TEST" })).toMatch(
      /SPE-T is Test, not Owned/,
    );
    expect(closePickerNote({ type: "SPE", code: "SPE-WBG", lifecycleStatus: "LIVE", dealStatus: "OWNED" })).toBeNull();
    expect(closePickerNote({ type: "OPCO", code: "RCP-OPCO", lifecycleStatus: "LIVE", dealStatus: "OWNED" })).toBeNull();
  });

  it("refuses soft close and hard lock for Pipeline, Screened, and Test, and still closes Owned and OpCo", async () => {
    const suffix = Date.now().toString(36).toUpperCase().slice(-5);
    const spe = await createEntityWithCoa({
      code: `SPE-G${suffix}`.slice(0, 12),
      name: `Gate ${suffix} LLC`,
      type: "SPE",
      dealStatus: "PIPELINE",
    });
    ids.push(spe.id);
    const period = await openPeriod(spe.id, 2026, 8);

    for (const dealStatus of ["PIPELINE", "SCREENED", "TEST"] as const) {
      await prisma.entity.update({ where: { id: spe.id }, data: { dealStatus } });
      const word = dealStatus === "PIPELINE" ? "Pipeline" : dealStatus === "SCREENED" ? "Screened" : "Test";
      await expect(softCloseAction(form(period.id))).rejects.toThrow(
        new RegExp(`${spe.code} is ${word}, not Owned`),
      );
      await expect(hardLockAction(form(period.id))).rejects.toThrow(/not Owned[\s\S]*not closed/);
      expect((await prisma.period.findUnique({ where: { id: period.id } }))?.status).toBe("OPEN");
    }

    await prisma.entity.update({ where: { id: spe.id }, data: { dealStatus: "OWNED" } });
    await softCloseAction(form(period.id));
    expect((await prisma.period.findUnique({ where: { id: period.id } }))?.status).toBe("SOFT_CLOSED");
    await completeChecklist(period.id);
    await hardLockAction(form(period.id));
    expect((await prisma.period.findUnique({ where: { id: period.id } }))?.status).toBe("CLOSED");

    const opco = await createEntityWithCoa({
      code: `OPC${suffix}`.slice(0, 12),
      name: `OpCo ${suffix}`,
      type: "OPCO",
    });
    ids.push(opco.id);
    const opcoPeriod = await openPeriod(opco.id, 2026, 8);
    await softCloseAction(form(opcoPeriod.id));
    expect((await prisma.period.findUnique({ where: { id: opcoPeriod.id } }))?.status).toBe("SOFT_CLOSED");
    await completeChecklist(opcoPeriod.id);
    await hardLockAction(form(opcoPeriod.id));
    expect((await prisma.period.findUnique({ where: { id: opcoPeriod.id } }))?.status).toBe("CLOSED");

    await prisma.entity.update({ where: { id: spe.id }, data: { dealStatus: "PIPELINE" } });
    await reopenAction(form(period.id, { reason: "books correction", ticket: "TICK-1" }));
    expect((await prisma.period.findUnique({ where: { id: period.id } }))?.status).toBe("OPEN");

    await removeEntity(spe.id);
    await removeEntity(opco.id);
  });
});
