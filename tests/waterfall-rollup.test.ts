import { applyWaterfallTemplate, dollars, lookThroughConfig, runWaterfall } from "@rcp/ledger";
import { europeanPromoteOpen, rollupWaterfallPools, type SpeWaterfallRecord } from "@/lib/waterfall";
import { describe, expect, it } from "vitest";

function record(
  code: string,
  templateId: SpeWaterfallRecord["config"]["templateId"],
  capital = dollars(10_000_000),
): SpeWaterfallRecord {
  const config = templateId === "look_through_100" ? lookThroughConfig() : applyWaterfallTemplate(templateId);
  return {
    entityId: `id-${code}`,
    entityCode: code,
    entityName: code,
    config,
    lpContributedCents: capital,
    unreturnedCapitalCents: capital,
    unpaidPrefCents: 0n,
    prefPaidToDateCents: 0n,
    persisted: templateId !== "look_through_100",
  };
}

describe("OpCo waterfall rollup uses GP/RCP share", () => {
  it("keeps 100% look-through when no template is saved", () => {
    const cash = dollars(500_000);
    const cfads = dollars(80_000);
    const rolled = rollupWaterfallPools(
      [record("SPE-WBG", "look_through_100", 0n)],
      [{ entityCode: "SPE-WBG", cashCents: cash, cfadsCents: cfads }],
      dollars(10_000),
    );
    expect(rolled.applied).toBe(false);
    expect(rolled.cashGpCents).toBe(cash + dollars(10_000));
    expect(rolled.cfadsGpCents).toBe(cfads);
    expect(rolled.cfadsLpCents).toBe(0n);
  });

  it("haircuts OpCo CFADS to GP share after simple pref+promote", () => {
    const spe = record("SPE-HMTOS", "simple_pref_promote");
    const cfads = dollars(12_000_000);
    const rolled = rollupWaterfallPools(
      [spe],
      [{ entityCode: "SPE-HMTOS", cashCents: cfads, cfadsCents: cfads }],
      0n,
      12,
    );
    const direct = runWaterfall({
      config: spe.config,
      distributableCents: cfads,
      lpContributedCents: spe.lpContributedCents,
      unreturnedCapitalCents: spe.unreturnedCapitalCents,
      unpaidPrefCents: 0n,
      prefPaidToDateCents: 0n,
      periodMonths: 12,
    });
    expect(rolled.applied).toBe(true);
    expect(rolled.cfadsGpCents).toBe(direct.gpCents);
    expect(rolled.cfadsRcpCents).toBe(direct.rcpCents);
    expect(rolled.cfadsCoGpCents).toBe(0n);
    expect(rolled.cfadsLpCents).toBe(direct.lpCents);
    expect(rolled.cfadsGpCents).toBe(dollars(240_000));
    expect(rolled.cfadsGpCents + rolled.cfadsLpCents).toBe(cfads);
    expect(rolled.cfadsGpCents).toBeLessThan(rolled.cfadsGrossCents);
  });

  it("haircuts OpCo CFADS to RCP (not full GP) when Co-GP is set", () => {
    const spe = record("SPE-HMTOS", "simple_pref_promote");
    spe.config = { ...spe.config, coGpOfPromoteBps: 5_000, coGpName: "JV" };
    const cfads = dollars(12_000_000);
    const rolled = rollupWaterfallPools(
      [spe],
      [{ entityCode: "SPE-HMTOS", cashCents: cfads, cfadsCents: cfads }],
      0n,
      12,
    );
    expect(rolled.applied).toBe(true);
    expect(rolled.hasCoGp).toBe(true);
    expect(rolled.cfadsGpCents).toBe(dollars(240_000));
    expect(rolled.cfadsRcpCents).toBe(dollars(120_000));
    expect(rolled.cfadsCoGpCents).toBe(dollars(120_000));
    expect(rolled.cfadsRcpCents + rolled.cfadsCoGpCents).toBe(rolled.cfadsGpCents);
  });

  it("does not count archived-missing SPEs (records are live-only)", () => {
    const rolled = rollupWaterfallPools(
      [record("SPE-WBG", "look_through_100", 0n)],
      [{ entityCode: "SPE-WBG", cashCents: dollars(1), cfadsCents: dollars(1) }],
      0n,
    );
    expect(rolled.speCount).toBe(1);
  });
});

describe("European portfolio gate", () => {
  it("stays closed while an LP deal has unreturned capital", () => {
    const rows = [record("SPE-HMTOS", "european_fund")];
    expect(europeanPromoteOpen(rows, 12)).toBe(false);
  });

  it("ignores look-through SPEs with no LP capital", () => {
    expect(europeanPromoteOpen([record("SPE-WBG", "look_through_100", 0n)], 1)).toBe(true);
  });
});
