import { applyWaterfallTemplate, dollars } from "@rcp/ledger";
import { createEntityWithCoa } from "@/lib/entities";
import { prisma } from "@/lib/prisma";
import { loadSpeWaterfall, parseWaterfallSave, saveSpeWaterfall } from "@/lib/waterfall";
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
    } finally {
      await deleteSpe(entity.id);
    }
  });
});
