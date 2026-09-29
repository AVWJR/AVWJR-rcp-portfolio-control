import { applyWaterfallTemplate, dollars } from "@rcp/ledger";
import { createEntityWithCoa } from "@/lib/entities";
import { prisma } from "@/lib/prisma";
import { effectiveCapital, loadSpeWaterfall, parseWaterfallSave, saveSpeWaterfall, waterfallAmountsFromStored } from "@/lib/waterfall";
import { centsToDollarsInput, dollarsInputToOptionalCents } from "@/lib/waterfall-inputs";
import { describe, expect, it } from "vitest";

async function deleteSpe(entityId: string) {
  await prisma.speWaterfall.deleteMany({ where: { entityId } });
  await prisma.account.deleteMany({ where: { entityId } });
  await prisma.entity.deleteMany({ where: { id: entityId } });
}

describe("waterfall persist + template apply", () => {
  it("parseWaterfallSave accepts institutional catch-up from the form payload", () => {
    const tmpl = applyWaterfallTemplate("institutional_catchup");
    const parsed = parseWaterfallSave({
      ...tmpl,
      lpContributedCents: dollars(10_000_000).toString(),
      unreturnedCapitalCents: "0",
      unpaidPrefCents: 0,
      prefPaidToDateCents: 0,
    });
    expect(parsed.config.templateId).toBe("institutional_catchup");
    expect(parsed.config.catchUpEnabled).toBe(true);
    expect(parsed.lpContributedCents).toBe(dollars(10_000_000));
    expect(parsed.unreturnedCapitalCents).toBe(0n);
    expect(parseWaterfallSave({ ...tmpl, lpContributedCents: dollars(1_000_000).toString(), unreturnedCapitalCents: "", unpaidPrefCents: null }).unreturnedCapitalCents).toBeNull();
    expect(parseWaterfallSave({ ...tmpl, lpContributedCents: dollars(1_000_000).toString(), unreturnedCapitalCents: null, unpaidPrefCents: "" }).unpaidPrefCents).toBeNull();
  });

  it("keeps a typed 0 distinct from a blank unreturned and pref field", () => {
    expect(centsToDollarsInput(0n)).toBe("0");
    expect(centsToDollarsInput(null)).toBe("");
    expect(dollarsInputToOptionalCents("0")).toBe(0n);
    expect(dollarsInputToOptionalCents("")).toBeNull();
    expect(dollarsInputToOptionalCents("0.00")).toBe(0n);

    const legacy = waterfallAmountsFromStored({
      tiersJson: "[]",
      unreturnedCapitalCents: 0n,
      unpaidPrefCents: 0n,
    });
    expect(legacy.unreturnedCapitalCents).toBeNull();
    expect(legacy.unpaidPrefCents).toBeNull();

    const typedZero = waterfallAmountsFromStored({
      tiersJson: JSON.stringify({
        tiers: [],
        capital: { unreturnedCapitalCents: "0", unpaidPrefCents: "0" },
      }),
      unreturnedCapitalCents: 0n,
      unpaidPrefCents: 0n,
    });
    expect(typedZero.unreturnedCapitalCents).toBe(0n);
    expect(typedZero.unpaidPrefCents).toBe(0n);

    const lp = dollars(1_000_000);
    expect(
      effectiveCapital({
        entityId: "x",
        entityCode: "SPE-WBG",
        entityName: "WBG",
        config: applyWaterfallTemplate("simple_pref_promote"),
        lpContributedCents: lp,
        unreturnedCapitalCents: 0n,
        unpaidPrefCents: 0n,
        prefPaidToDateCents: 0n,
        persisted: true,
      }).unreturnedCapitalCents,
    ).toBe(0n);
    expect(
      effectiveCapital({
        entityId: "x",
        entityCode: "SPE-WBG",
        entityName: "WBG",
        config: applyWaterfallTemplate("simple_pref_promote"),
        lpContributedCents: lp,
        unreturnedCapitalCents: null,
        unpaidPrefCents: null,
        prefPaidToDateCents: 0n,
        persisted: true,
      }).unreturnedCapitalCents,
    ).toBe(lp);
  });

  it("missing SpeWaterfall row stays 100% look-through", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const entity = await createEntityWithCoa({
      code: `SPE-WFLT${Date.now().toString(36).toUpperCase()}`,
      name: "Waterfall Test LLC",
      type: "SPE",
      parentId: opco.id,
    });
    try {
      const loaded = await loadSpeWaterfall(entity.id);
      expect(loaded?.persisted).toBe(false);
      expect(loaded?.config.templateId).toBe("look_through_100");
    } finally {
      await deleteSpe(entity.id);
    }
  });

  it("saveSpeWaterfall persists a simple pref template for rollup", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const entity = await createEntityWithCoa({
      code: `SPE-WFSV${Date.now().toString(36).toUpperCase()}`,
      name: "Waterfall Save LLC",
      type: "SPE",
      parentId: opco.id,
    });
    try {
      const tmpl = applyWaterfallTemplate("simple_pref_promote");
      await saveSpeWaterfall(entity.id, {
        ...tmpl,
        lpContributedCents: dollars(10_000_000),
        unreturnedCapitalCents: dollars(10_000_000),
        unpaidPrefCents: 0n,
        prefPaidToDateCents: 0n,
      });
      const loaded = await loadSpeWaterfall(entity.id);
      expect(loaded?.persisted).toBe(true);
      expect(loaded?.config.templateId).toBe("simple_pref_promote");
      expect(loaded?.lpContributedCents).toBe(dollars(10_000_000));
      expect(loaded?.config.coGpOfPromoteBps).toBe(0);
    } finally {
      await deleteSpe(entity.id);
    }
  });

  it("saveSpeWaterfall persists Co-GP shares", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const entity = await createEntityWithCoa({
      code: `SPE-WFCO${Date.now().toString(36).toUpperCase()}`,
      name: "Co-GP Save LLC",
      type: "SPE",
      parentId: opco.id,
    });
    try {
      const tmpl = applyWaterfallTemplate("simple_pref_promote");
      await saveSpeWaterfall(entity.id, {
        ...tmpl,
        coGpName: "JV Partner",
        coGpOfPromoteBps: 5_000,
        coGpCoInvestShareBps: 2_500,
        lpContributedCents: dollars(10_000_000),
        unreturnedCapitalCents: dollars(10_000_000),
        unpaidPrefCents: 0n,
        prefPaidToDateCents: 0n,
      });
      const loaded = await loadSpeWaterfall(entity.id);
      expect(loaded?.config.coGpName).toBe("JV Partner");
      expect(loaded?.config.coGpOfPromoteBps).toBe(5_000);
      expect(loaded?.config.coGpCoInvestShareBps).toBe(2_500);
    } finally {
      await deleteSpe(entity.id);
    }
  });

  it("round-trips a typed 0 and a blank unreturned / pref unpaid on reload", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const entity = await createEntityWithCoa({
      code: `SPE-WFZR${Date.now().toString(36).toUpperCase()}`,
      name: "Zero Capital LLC",
      type: "SPE",
      parentId: opco.id,
    });
    try {
      const tmpl = applyWaterfallTemplate("simple_pref_promote");
      const zero = await saveSpeWaterfall(entity.id, {
        ...tmpl,
        lpContributedCents: dollars(1_000_000),
        unreturnedCapitalCents: 0n,
        unpaidPrefCents: 0n,
        prefPaidToDateCents: 0n,
      });
      expect(zero.unreturnedCapitalCents).toBe(0n);
      expect(zero.unpaidPrefCents).toBe(0n);
      const reloadedZero = await loadSpeWaterfall(entity.id);
      expect(reloadedZero?.unreturnedCapitalCents).toBe(0n);
      expect(reloadedZero?.unpaidPrefCents).toBe(0n);
      expect(centsToDollarsInput(reloadedZero?.unreturnedCapitalCents)).toBe("0");
      expect(centsToDollarsInput(reloadedZero?.unpaidPrefCents)).toBe("0");

      const blank = await saveSpeWaterfall(entity.id, {
        ...tmpl,
        lpContributedCents: dollars(1_000_000),
        unreturnedCapitalCents: null,
        unpaidPrefCents: null,
        prefPaidToDateCents: 0n,
      });
      expect(blank.unreturnedCapitalCents).toBeNull();
      expect(blank.unpaidPrefCents).toBeNull();
      const reloadedBlank = await loadSpeWaterfall(entity.id);
      expect(reloadedBlank?.unreturnedCapitalCents).toBeNull();
      expect(reloadedBlank?.unpaidPrefCents).toBeNull();
      expect(centsToDollarsInput(reloadedBlank?.unreturnedCapitalCents)).toBe("");
      expect(effectiveCapital(reloadedBlank!).unreturnedCapitalCents).toBe(dollars(1_000_000));
      expect(effectiveCapital(reloadedBlank!).unpaidPrefCents).toBe(0n);
    } finally {
      await deleteSpe(entity.id);
    }
  });
});
