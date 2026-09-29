import { createEntityWithCoa } from "@/lib/entities";
import {
  DistributionLedgerError,
  assertPreviewGrossMatches,
  loadDistributionBoard,
  parseWholeCents,
  postDistribution,
  rejectDistributionDelete,
  rejectDistributionEdit,
  reverseDistribution,
} from "@/lib/distribution-ledger";
import { centsToDollarsInput } from "@/lib/waterfall-inputs";
import { prisma } from "@/lib/prisma";
import { loadSpeWaterfall, saveSpeWaterfall, waterfallAmountsFromStored } from "@/lib/waterfall";
import {
  applyDistribution,
  applyWaterfallTemplate,
  dollars,
  openingDistributionState,
  runDistributionSequence,
  runWaterfall,
  simplePrefCents,
  stateBeforeLastPosting,
  waterfallPosition,
  type DistributionLedgerSeed,
  type DistributionRunningTotals,
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

function gpReceived(state: DistributionRunningTotals): bigint {
  return state.cumulativeRcpCents + state.cumulativeCoGpCents;
}

function prefAlreadyPaid(config: DistributionLedgerSeed["config"], prefPaid: bigint): DistributionRunningTotals {
  const opening = openingDistributionState({
    config,
    lpContributedCents: LP,
    openingUnreturnedCents: 0n,
    openingUnpaidPrefCents: 0n,
  });
  return {
    ...opening,
    prefAccruedCents: prefPaid,
    prefPaidCents: prefPaid,
    prefUnpaidCents: 0n,
    byTier: {
      ...opening.byTier,
      pref: { lpCents: prefPaid, rcpCents: 0n, coGpCents: 0n },
    },
  };
}

describe("catch-up across distributions", () => {
  it("gives the GP the same total from $90,000 then $50,000 as from one $140,000", () => {
    const config = applyWaterfallTemplate("institutional_catchup");
    const seed: DistributionLedgerSeed = {
      config,
      lpContributedCents: LP,
      openingUnreturnedCents: 0n,
      openingUnpaidPrefCents: 0n,
      europeanPromoteOpen: true,
    };
    const anchor = { year: 2026, month: 6 };
    const prior = prefAlreadyPaid(config, dollars(80_000));
    const first = applyDistribution(seed, prior, anchor, {
      year: 2026,
      month: 6,
      grossCents: dollars(90_000),
      source: "OPERATING_CASH",
    });
    const second = applyDistribution(seed, first.state, anchor, {
      year: 2026,
      month: 6,
      grossCents: dollars(50_000),
      source: "OPERATING_CASH",
    });
    const single = runWaterfall({
      config,
      lpContributedCents: LP,
      unreturnedCapitalCents: 0n,
      unpaidPrefCents: 0n,
      prefPaidToDateCents: dollars(80_000),
      periodMonths: 0,
      distributableCents: dollars(140_000),
      priorLpPrefPaidCents: dollars(80_000),
    });
    expect(first.monthsAccrued).toBe(0);
    expect(gpReceived(second.state)).toBe(single.gpCents);
    expect(single.gpCents).toBe(dollars(44_000));
  });

  it("keeps a 50% catch-up on the GP target and still reaches 20% across two events", () => {
    const config = { ...applyWaterfallTemplate("institutional_catchup"), catchUpBps: 5_000 };
    const seed: DistributionLedgerSeed = {
      config,
      lpContributedCents: LP,
      openingUnreturnedCents: 0n,
      openingUnpaidPrefCents: 0n,
      europeanPromoteOpen: true,
    };
    const anchor = { year: 2026, month: 6 };
    const prior = prefAlreadyPaid(config, dollars(80_000));
    const partial = applyDistribution(seed, prior, anchor, {
      year: 2026,
      month: 6,
      grossCents: dollars(30_000),
      source: "OPERATING_CASH",
    });
    const gpCatch = partial.state.byTier.catchUp.rcpCents + partial.state.byTier.catchUp.coGpCents;
    const grossCatch =
      partial.state.byTier.catchUp.lpCents + partial.state.byTier.catchUp.rcpCents + partial.state.byTier.catchUp.coGpCents;
    expect(partial.state.catchUpPaidCents).toBe(gpCatch);
    expect(gpCatch).toBeLessThan(partial.state.catchUpTargetCents);
    expect(grossCatch).toBeGreaterThanOrEqual(partial.state.catchUpTargetCents);
    expect(waterfallPosition(partial.state, config)).toBe("CATCH_UP");

    const rest = applyDistribution(seed, partial.state, anchor, {
      year: 2026,
      month: 6,
      grossCents: dollars(110_000),
      source: "OPERATING_CASH",
    });
    const single = runWaterfall({
      config,
      lpContributedCents: LP,
      unreturnedCapitalCents: 0n,
      unpaidPrefCents: 0n,
      prefPaidToDateCents: dollars(80_000),
      periodMonths: 0,
      distributableCents: dollars(140_000),
      priorLpPrefPaidCents: dollars(80_000),
    });
    expect(gpReceived(rest.state)).toBe(single.gpCents);
    const profits = dollars(80_000) + dollars(140_000);
    expect(gpReceived(rest.state) * 10_000n / profits).toBe(2_000n);
  });
});

describe("distribution posting guards", () => {
  it("requires whole cents and a matching preview", () => {
    expect(parseWholeCents("1890000")).toBe(1_890_000n);
    expect(parseWholeCents(1890000)).toBe(1_890_000n);
    expect(() => parseWholeCents("18900.5")).toThrow(/Amount must be whole cents/);
    expect(() => parseWholeCents(1.5)).toThrow(/Amount must be whole cents/);
    try {
      assertPreviewGrossMatches(10n, undefined);
      throw new Error("expected a mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(DistributionLedgerError);
      expect((error as DistributionLedgerError).status).toBe(409);
    }
    try {
      assertPreviewGrossMatches(10n, "11");
      throw new Error("expected a mismatch");
    } catch (error) {
      expect((error as DistributionLedgerError).status).toBe(409);
    }
    expect(() => assertPreviewGrossMatches(10n, "10")).not.toThrow();
  });

  async function freshSpe(label: string) {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const entity = await createEntityWithCoa({
      code: `SPE-${label}${Date.now().toString(36).toUpperCase()}`.slice(0, 24),
      name: `${label} Distribution LLC`,
      type: "SPE",
      parentId: opco.id,
    });
    const tmpl = applyWaterfallTemplate("institutional_catchup");
    await saveSpeWaterfall(entity.id, {
      ...tmpl,
      lpContributedCents: LP,
      unreturnedCapitalCents: null,
      unpaidPrefCents: null,
      prefPaidToDateCents: 0n,
    });
    return entity;
  }

  function post(entityId: string, year: number, month: number, grossCents: bigint) {
    return postDistribution({
      entityId,
      eventDate: new Date(Date.UTC(year, month - 1, 15)),
      year,
      month,
      grossCents,
      source: "OPERATING_CASH",
      memo: null,
      actor: "principal",
      role: "principal",
    });
  }

  it("lets one of two simultaneous posts win and keeps the totals equal to that gross", async () => {
    const entity = await freshSpe("RC");
    try {
      const amounts = [dollars(18_900), dollars(20_000)];
      const results = await Promise.allSettled(amounts.map((grossCents) => post(entity.id, 2026, 1, grossCents)));
      const ok = results.filter((result) => result.status === "fulfilled");
      const bad = results.filter((result) => result.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(bad).toHaveLength(1);
      const reason = (bad[0] as PromiseRejectedResult).reason as DistributionLedgerError;
      expect(reason).toBeInstanceOf(DistributionLedgerError);
      expect(reason.status).toBe(409);
      expect(reason.message).toBe("Another distribution was just recorded. Refresh and preview again.");
      const board = await loadDistributionBoard(entity.id);
      if (!board) throw new Error("expected a board");
      const posted = board.events.filter((event) => !event.reversesEventId).reduce((sum, event) => sum + event.grossCents, 0n);
      expect(board.current.cumulativeLpCents + board.current.cumulativeRcpCents + board.current.cumulativeCoGpCents).toBe(posted);
      expect(posted === dollars(18_900) || posted === dollars(20_000)).toBe(true);
    } finally {
      await deleteSpe(entity.id);
    }
  });

  it("refuses a back-dated period and accrues the months since the latest posting", async () => {
    const entity = await freshSpe("BD");
    try {
      const jan = await post(entity.id, 2026, 1, MONTHLY);
      expect(jan.events[0]?.monthsAccrued).toBe(1);
      const mar = await post(entity.id, 2026, 3, MONTHLY);
      const march = mar.events.filter((event) => !event.reversesEventId).at(-1);
      expect(march?.monthsAccrued).toBe(2);
      expect(march?.state.prefAccruedCents).toBe(simplePrefCents(LP, 800, 1) + simplePrefCents(LP - MONTHLY, 800, 2));
      await expect(post(entity.id, 2026, 1, MONTHLY)).rejects.toMatchObject({
        status: 409,
        message: "That period is before the latest distribution (2026-03). Pick that month or a later one.",
      });
      const again = await post(entity.id, 2026, 3, MONTHLY);
      expect(again.events.filter((event) => !event.reversesEventId).at(-1)?.monthsAccrued).toBe(0);
      const april = await post(entity.id, 2026, 4, MONTHLY);
      expect(april.events.filter((event) => !event.reversesEventId).at(-1)?.monthsAccrued).toBe(1);
    } finally {
      await deleteSpe(entity.id);
    }
  });

  it("refuses a posting on an archived SPE", async () => {
    const entity = await freshSpe("AR");
    try {
      await prisma.entity.update({ where: { id: entity.id }, data: { lifecycleStatus: "ARCHIVED" } });
      await expect(post(entity.id, 2026, 1, MONTHLY)).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(/soft-archived/),
      });
    } finally {
      await deleteSpe(entity.id);
    }
  });

  it("restores the opening seed after a save and a reversal, and leaves the waterfall box blank", async () => {
    const entity = await freshSpe("RV");
    try {
      const board = await post(entity.id, 2026, 1, MONTHLY);
      const posted = await prisma.distributionEvent.findFirst({ where: { entityId: entity.id } });
      const snap = JSON.parse(posted?.waterfallSnapshotJson ?? "{}") as {
        lpContributedCents?: string;
        openingUnreturnedCents?: string | null;
        openingUnpaidPrefCents?: string | null;
      };
      expect(snap.lpContributedCents).toBe(LP.toString());
      expect(snap.openingUnreturnedCents).toBeNull();
      expect(snap.openingUnpaidPrefCents).toBeNull();
      const tmpl = applyWaterfallTemplate("institutional_catchup");
      await saveSpeWaterfall(entity.id, {
        ...tmpl,
        lpContributedCents: LP,
        unreturnedCapitalCents: dollars(1),
        unpaidPrefCents: dollars(50),
        prefPaidToDateCents: dollars(50),
      });
      const row = await prisma.speWaterfall.findUnique({ where: { entityId: entity.id } });
      if (!row) throw new Error("expected a waterfall row");
      const stored = waterfallAmountsFromStored(row);
      expect(stored.unreturnedCapitalCents).toBeNull();
      expect(stored.unpaidPrefCents).toBeNull();
      expect(row.prefPaidToDateCents).toBe(0n);
      const latest = board.events.find((event) => !event.reversesEventId);
      if (!latest) throw new Error("expected a posting");
      const reversed = await reverseDistribution({
        entityId: entity.id,
        eventId: latest.id,
        actor: "principal",
        role: "principal",
      });
      expect(reversed.current.unreturnedCapitalCents).toBe(dollars(3_000_000));
      expect(reversed.current.prefUnpaidCents).toBe(0n);
      expect(reversed.hasEvents).toBe(false);
      expect(reversed.capitalSource).toBe("waterfall");
      const loaded = await loadSpeWaterfall(entity.id);
      expect(loaded?.unreturnedCapitalCents).toBeNull();
      expect(loaded?.unpaidPrefCents).toBeNull();
      expect(loaded?.capitalSource).toBe("waterfall");
      expect(centsToDollarsInput(loaded?.unreturnedCapitalCents)).toBe("");
      expect(centsToDollarsInput(loaded?.unpaidPrefCents)).toBe("");
    } finally {
      await deleteSpe(entity.id);
    }
  });
});
