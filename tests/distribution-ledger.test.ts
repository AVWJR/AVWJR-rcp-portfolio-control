import { createEntityWithCoa } from "@/lib/entities";
import {
  DistributionLedgerError,
  loadDistributionBoard,
  postDistribution,
  rejectDistributionDelete,
  rejectDistributionEdit,
  reverseDistribution,
} from "@/lib/distribution-ledger";
import { prisma } from "@/lib/prisma";
import { loadSpeWaterfall, saveSpeWaterfall } from "@/lib/waterfall";
import {
  applyWaterfallTemplate,
  dollars,
  runDistributionSequence,
  simplePrefCents,
  stateBeforeLastPosting,
} from "@rcp/ledger";
import { describe, expect, it } from "vitest";

const LP = dollars(3_000_000);
const MONTHLY = dollars(18_900);
const CAPITAL = dollars(2_000_000);

function seed() {
  return {
    config: applyWaterfallTemplate("institutional_catchup"),
    lpContributedCents: LP,
    openingUnreturnedCents: null as bigint | null,
    openingUnpaidPrefCents: null as bigint | null,
    europeanPromoteOpen: true,
  };
}

const POSTINGS = [
  { year: 2026, month: 1, grossCents: MONTHLY, source: "OPERATING_CASH" as const },
  { year: 2026, month: 2, grossCents: MONTHLY, source: "OPERATING_CASH" as const },
  { year: 2026, month: 3, grossCents: MONTHLY, source: "OPERATING_CASH" as const },
  { year: 2026, month: 4, grossCents: CAPITAL, source: "CAPITAL_EVENT" as const },
];

async function deleteSpe(entityId: string) {
  await prisma.distributionAudit.deleteMany({ where: { entityId } });
  await prisma.distributionEvent.deleteMany({ where: { entityId, reversesEventId: { not: null } } });
  await prisma.distributionEvent.deleteMany({ where: { entityId } });
  await prisma.speWaterfall.deleteMany({ where: { entityId } });
  await prisma.account.deleteMany({ where: { entityId } });
  await prisma.entity.deleteMany({ where: { id: entityId } });
}

describe("distribution ledger engine", () => {
  it("pays return of capital before pref on $3M at 8% simple, then a $2M capital event", () => {
    const { opening, events } = runDistributionSequence(seed(), POSTINGS);
    expect(opening.capitalReturnedCents).toBe(0n);
    expect(opening.unreturnedCapitalCents).toBe(LP);
    expect(opening.prefUnpaidCents).toBe(0n);

    let unreturned = LP;
    let prefAccrued = 0n;
    let roc = 0n;
    for (let i = 0; i < events.length; i += 1) {
      const accrue = simplePrefCents(unreturned, 800, 1);
      prefAccrued += accrue;
      roc += POSTINGS[i]!.grossCents;
      unreturned -= POSTINGS[i]!.grossCents;
      const state = events[i]!.state;
      expect(state.prefAccruedCents).toBe(prefAccrued);
      expect(state.prefPaidCents).toBe(0n);
      expect(state.prefUnpaidCents).toBe(prefAccrued);
      expect(state.capitalReturnedCents).toBe(roc);
      expect(state.unreturnedCapitalCents).toBe(unreturned);
      expect(state.byTier.roc.lpCents).toBe(roc);
      expect(state.byTier.roc.rcpCents).toBe(0n);
      expect(state.byTier.roc.coGpCents).toBe(0n);
      expect(state.byTier.pref.lpCents).toBe(0n);
      expect(state.byTier.pref.rcpCents).toBe(0n);
      expect(state.byTier.catchUp.lpCents).toBe(0n);
      expect(state.byTier.catchUp.rcpCents).toBe(0n);
      expect(state.byTier.catchUp.coGpCents).toBe(0n);
      expect(state.byTier.promote.lpCents).toBe(0n);
      expect(state.byTier.promote.rcpCents).toBe(0n);
      expect(state.byTier.promote.coGpCents).toBe(0n);
      expect(state.catchUpPaidCents).toBe(0n);
      expect(state.catchUpTargetCents).toBe(0n);
      expect(state.promoteEarnedCents).toBe(0n);
      expect(state.cumulativeLpCents).toBe(roc);
      expect(state.cumulativeRcpCents).toBe(0n);
      expect(state.cumulativeCoGpCents).toBe(0n);
    }

    expect(events[2]!.state.capitalReturnedCents).toBe(dollars(56_700));
    expect(events[2]!.state.prefAccruedCents).toBe(dollars(59_622));
    expect(events[2]!.state.prefPaidCents).toBe(0n);
    expect(events[2]!.state.prefUnpaidCents).toBe(dollars(59_622));
    expect(events[2]!.state.unreturnedCapitalCents).toBe(dollars(2_943_300));
    expect(events[3]!.state.capitalReturnedCents).toBe(dollars(2_056_700));
    expect(events[3]!.state.unreturnedCapitalCents).toBe(dollars(943_300));
    expect(events[3]!.state.prefAccruedCents).toBe(dollars(79_244));
    expect(events[3]!.state.prefPaidCents).toBe(0n);
    expect(events[3]!.state.prefUnpaidCents).toBe(dollars(79_244));
    expect(events[3]!.state.catchUpPaidCents).toBe(0n);
    expect(events[3]!.state.promoteEarnedCents).toBe(0n);
    expect(events[3]!.state.cumulativeRcpCents).toBe(0n);
  });

  it("restores the prior running totals when the latest posting is dropped", () => {
    const { opening, events } = runDistributionSequence(seed(), POSTINGS);
    const restored = stateBeforeLastPosting(opening, events);
    expect(restored.capitalReturnedCents).toBe(events[2]!.state.capitalReturnedCents);
    expect(restored.prefUnpaidCents).toBe(events[2]!.state.prefUnpaidCents);
    expect(restored.unreturnedCapitalCents).toBe(events[2]!.state.unreturnedCapitalCents);
    expect(stateBeforeLastPosting(opening, events.slice(0, 1)).unreturnedCapitalCents).toBe(LP);
    expect(stateBeforeLastPosting(opening, events.slice(0, 1)).prefAccruedCents).toBe(0n);
  });
});

describe("posted distributions", () => {
  it("refuses edits and deletes, and a reversal restores the prior ledger", async () => {
    expect(() => rejectDistributionEdit()).toThrow(DistributionLedgerError);
    expect(() => rejectDistributionDelete()).toThrow(DistributionLedgerError);
    try {
      rejectDistributionEdit();
    } catch (error) {
      expect(error).toBeInstanceOf(DistributionLedgerError);
      expect((error as DistributionLedgerError).status).toBe(409);
    }
    try {
      rejectDistributionDelete();
    } catch (error) {
      expect((error as DistributionLedgerError).status).toBe(409);
    }

    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const entity = await createEntityWithCoa({
      code: `SPE-DST${Date.now().toString(36).toUpperCase()}`,
      name: "Distribution Ledger LLC",
      type: "SPE",
      parentId: opco.id,
    });
    try {
      const tmpl = applyWaterfallTemplate("institutional_catchup");
      await saveSpeWaterfall(entity.id, {
        ...tmpl,
        lpContributedCents: LP,
        unreturnedCapitalCents: null,
        unpaidPrefCents: null,
        prefPaidToDateCents: 0n,
      });
      let board = await loadDistributionBoard(entity.id);
      expect(board?.hasEvents).toBe(false);
      expect(board?.capitalSource).toBe("waterfall");
      expect(board?.current.unreturnedCapitalCents).toBe(LP);
      expect(board?.current.capitalReturnedCents).toBe(0n);

      for (const posting of POSTINGS) {
        board = await postDistribution({
          entityId: entity.id,
          eventDate: new Date(Date.UTC(posting.year, posting.month - 1, 15)),
          year: posting.year,
          month: posting.month,
          grossCents: posting.grossCents,
          source: posting.source,
          memo: posting.source === "CAPITAL_EVENT" ? "Refinance" : "Operating cash",
          actor: "principal",
          role: "principal",
        });
      }
      if (!board) throw new Error("expected a distribution board");
      expect(board.current.capitalReturnedCents).toBe(dollars(2_056_700));
      expect(board.current.prefUnpaidCents).toBe(dollars(79_244));
      expect(board.capitalSource).toBe("ledger");
      const loaded = await loadSpeWaterfall(entity.id);
      expect(loaded?.capitalSource).toBe("ledger");
      expect(loaded?.unreturnedCapitalCents).toBe(dollars(943_300));
      expect(loaded?.unpaidPrefCents).toBe(dollars(79_244));
      expect(loaded?.unreturnedCapitalCents).not.toBe(dollars(1));
      expect(loaded?.unpaidPrefCents).not.toBe(dollars(50));
      const ignored = await saveSpeWaterfall(entity.id, {
        ...tmpl,
        lpContributedCents: LP,
        unreturnedCapitalCents: dollars(1),
        unpaidPrefCents: dollars(50),
        prefPaidToDateCents: 0n,
      });
      expect(ignored.capitalSource).toBe("ledger");
      expect(ignored.unreturnedCapitalCents).toBe(dollars(943_300));
      expect(ignored.unpaidPrefCents).toBe(dollars(79_244));

      const latest = board.events.filter((event) => !event.reversesEventId && !event.reversed).at(-1);
      if (!latest) throw new Error("expected a posted distribution");
      const originalGross = latest.grossCents;
      const reversed = await reverseDistribution({
        entityId: entity.id,
        eventId: latest.id,
        actor: "principal",
        role: "principal",
      });
      expect(reversed.current.capitalReturnedCents).toBe(dollars(56_700));
      expect(reversed.current.prefUnpaidCents).toBe(dollars(59_622));
      expect(reversed.current.unreturnedCapitalCents).toBe(dollars(2_943_300));
      const original = await prisma.distributionEvent.findUnique({ where: { id: latest.id } });
      expect(original?.grossCents).toBe(originalGross);
      expect(reversed.audits.some((row) => row.action === "POST")).toBe(true);
      expect(reversed.audits.some((row) => row.action === "REVERSE")).toBe(true);
      await expect(
        reverseDistribution({
          entityId: entity.id,
          eventId: latest.id,
          actor: "principal",
          role: "principal",
        }),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await deleteSpe(entity.id);
    }
  });
});
