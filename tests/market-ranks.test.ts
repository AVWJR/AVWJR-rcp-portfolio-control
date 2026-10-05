import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { buildMarketSeedPlan, loadApprovedFiles } from "@/lib/markets/catalog";
import {
  MARKETS_LOCKED,
  MARKETS_LOOPNET,
  MARKETS_NO_CREDENTIALS,
  MARKETS_PUBLIC_SOURCE,
  REGISTERED_ONLY,
} from "@/lib/markets/types";
import { decimalToTenths } from "@/lib/markets/parse";
import {
  marketSeedWritesAllowed,
  marketsRoleAllowed,
  parsePaidSourceInput,
  sourceFeedsOfficialScore,
} from "@/lib/markets/policy";
import { scoreDigest } from "@/lib/markets/read";
import { registerPaidSource } from "@/lib/markets/register";
import { seedMarketRanks } from "@/lib/markets/seed";
import { prisma } from "@/lib/prisma";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const ROOT = process.cwd();
const SPE_CODES = ["SPE-WBG", "SPE-CVC", "SPE-HCR"];

afterAll(async () => {
  await prisma.mktSource.deleteMany({ where: { name: { in: ["Example Paid Feed", "LoopNet Listings"] } } });
  await prisma.$disconnect();
});

describe("market ranks catalog", () => {
  const plan = buildMarketSeedPlan();
  const files = loadApprovedFiles();

  it("keeps the schema additive and clear of ledger tables", () => {
    const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
    const prod = readFileSync(path.join(ROOT, "prisma/schema.prod.prisma"), "utf8");
    for (const text of [schema, prod]) {
      expect(text).toContain("model Entity");
      expect(text).toContain("model Journal");
      expect(text).toContain("model MktSource");
      expect(text).toContain("model MktMetroScore");
      expect(text.indexOf("model Entity")).toBeLessThan(text.indexOf("model MktSource"));
      expect(text).not.toMatch(/apiKey|api_key/);
    }
    const seed = readFileSync(path.join(ROOT, "src/lib/markets/seed.ts"), "utf8");
    expect(seed).not.toMatch(/entity\.delete|journal\.delete|SPE-WBG|SPE-CVC|SPE-HCR/);
  });

  it("does not import ledger writers or a paid fetcher", () => {
    const roots = [
      path.join(ROOT, "src/lib/markets"),
      path.join(ROOT, "src/app/markets"),
      path.join(ROOT, "src/app/api/markets"),
      path.join(ROOT, "src/components/markets"),
    ];
    const filesOnDisk = roots.flatMap((dir) => walk(dir));
    for (const file of filesOnDisk) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/postJournal/);
      expect(source, file).not.toMatch(/@rcp\/ledger/);
      expect(source, file).not.toMatch(/prisma\.journal/);
      expect(source, file).not.toMatch(/loopnet\.com/i);
      if (!file.endsWith("register-form.tsx")) {
        expect(source, file).not.toMatch(/fetch\s*\(/);
      }
    }
  });

  it("reproduces the approved presentation scores and the top 50 slice", () => {
    expect(plan.metros).toHaveLength(200);
    expect(files.top50).toHaveLength(50);
    files.presentation.forEach((row, index) => {
      const metro = plan.metros[index];
      expect(metro.rank).toBe(Number(row.exact_rank));
      expect(metro.cbsaCode).toBe(row.metro);
      expect(metro.viabilityTenths).toBe(decimalToTenths(row.viability_score_1_100));
      expect(metro.name).toBe(row.CBSA);
    });
    files.top50.forEach((row, index) => {
      const full = files.presentation[index];
      expect(row.metro).toBe(full.metro);
      expect(row.exact_rank).toBe(full.exact_rank);
      expect(row.viability_score_1_100).toBe(full.viability_score_1_100);
    });
  });

  it("stores pillar subscores only when Phase 5 has them", () => {
    const demandOnly = plan.metros.filter((metro) => {
      const parsed = JSON.parse(metro.pillarScoresJson) as Record<string, string>;
      return !parsed.Supply;
    });
    expect(demandOnly.map((metro) => metro.cbsaCode).sort()).toEqual(["35300", "47930"]);
    for (const metro of demandOnly) {
      const parsed = JSON.parse(metro.pillarScoresJson) as Record<string, string>;
      expect(parsed.Demand).toBeTruthy();
      expect(parsed.Supply).toBeUndefined();
      expect(JSON.stringify(parsed)).not.toContain(":0");
    }
    const grandForks = plan.metros.find((metro) => metro.cbsaCode === "24220");
    const pillars = JSON.parse(grandForks!.pillarScoresJson) as Record<string, string>;
    expect(pillars.Demand).toBe(files.phase5.find((row) => row.cbsa_code === "24220")?.subscore_Demand);
  });

  it("keeps paid and inactive sources out of the official inputs", () => {
    const scoringIds = new Set(
      plan.variables.filter((row) => row.inScoreToday).flatMap((row) => row.sourceIds),
    );
    const scoring = plan.sources.filter((source) => scoringIds.has(source.id));
    expect(scoring.every((source) => sourceFeedsOfficialScore(source))).toBe(true);
    expect(plan.sources.filter((source) => source.licenseBasis === "license_required").map((source) => source.name).sort()).toEqual([
      "MSCI",
      "Yardi Matrix",
    ]);
    for (const source of plan.sources) {
      expect(source.automationAllowed).toBe(false);
      if (source.licenseBasis === "license_required" || source.status !== "active") {
        expect(sourceFeedsOfficialScore(source)).toBe(false);
      }
    }
    expect(plan.sources.some((source) => /loop\s*net/i.test(source.name))).toBe(false);
    const supply = plan.weights.find((row) => row.variableId === "SUP-20");
    expect(supply?.weightNumerator).toBe(1);
    expect(supply?.weightDenominator).toBe(1);
    expect(plan.weights.filter((row) => row.scope === "PILLAR" && row.weightNumerator === 1)).toHaveLength(5);
  });

  it("refuses an unauthenticated role when the unlock gate is on", () => {
    expect(marketsRoleAllowed(null, true)).toBe(false);
    expect(marketsRoleAllowed("viewer", true)).toBe(false);
    expect(marketsRoleAllowed("principal", true)).toBe(true);
    expect(marketsRoleAllowed(null, false)).toBe(true);
    expect(marketSeedWritesAllowed({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe(false);
    expect(marketSeedWritesAllowed({ VERCEL: "1", VERCEL_ENV: "production" })).toBe(true);
    expect(marketSeedWritesAllowed({})).toBe(true);
  });

  it("rejects LoopNet and credential fields before any save", () => {
    expect(() => parsePaidSourceInput({ name: "LoopNet", publisher: "CoStar", url: "" })).toThrow(MARKETS_LOOPNET);
    expect(() => parsePaidSourceInput({ name: "Paid Feed", publisher: "Vendor", apiKey: "secret" })).toThrow(
      MARKETS_NO_CREDENTIALS,
    );
  });
});

describe("market ranks database", () => {
  it("seeds the approved scores without touching SPE books", async () => {
    const seeded = await seedMarketRanks();
    expect(seeded.metros).toBe(200);
    const spes = await prisma.entity.findMany({ where: { code: { in: SPE_CODES } }, select: { code: true } });
    expect(spes.map((row) => row.code).sort()).toEqual([...SPE_CODES].sort());
    const rows = await prisma.mktMetroScore.findMany({
      where: { run: { isOfficial: true } },
      orderBy: { rank: "asc" },
    });
    expect(rows).toHaveLength(200);
    const plan = buildMarketSeedPlan();
    rows.forEach((row, index) => {
      expect(row.rank).toBe(plan.metros[index].rank);
      expect(row.viabilityTenths).toBe(plan.metros[index].viabilityTenths);
      expect(row.metroId).toBe(plan.metros[index].cbsaCode);
    });
    const boise = rows.find((row) => row.metroId === "14260");
    expect(boise?.viabilityTenths).toBe(919);
    expect(boise?.rank).toBe(2);
  });

  it("ignores inactive and license-required sources on the score read", async () => {
    const { loadMarketsBundle } = await import("@/lib/markets/read");
    const bundle = await loadMarketsBundle();
    if (bundle.state !== "ready") throw new Error(bundle.message);
    const sources = await prisma.mktSource.findMany();
    for (const id of bundle.scoringSourceIds) {
      const source = sources.find((row) => row.id === id);
      expect(source && sourceFeedsOfficialScore(source)).toBe(true);
    }
    expect(bundle.sources.filter((source) => source.licenseBasis === "license_required").every((source) => !source.feedsScore)).toBe(
      true,
    );
    const ces = await prisma.mktSource.findFirst({ where: { name: "BLS CES total nonfarm" } });
    if (!ces) throw new Error("missing BLS CES");
    const before = await scoreDigest();
    await prisma.mktSource.update({ where: { id: ces.id }, data: { status: "inactive" } });
    const hidden = await loadMarketsBundle();
    if (hidden.state !== "ready") throw new Error(hidden.message);
    expect(hidden.scoringSourceIds).not.toContain(ces.id);
    expect(await scoreDigest()).toBe(before);
    await prisma.mktSource.update({ where: { id: ces.id }, data: { status: "active" } });
  });

  it("registers a paid source without changing any metro score", async () => {
    const before = await scoreDigest();
    const saved = await registerPaidSource({
      name: "Example Paid Feed",
      publisher: "Example Publisher",
      url: "https://example.com/series",
      termsUrl: "",
      costNotes: "Quote later. No key.",
      licenseStatus: "inactive",
    });
    expect(saved.message).toBe(REGISTERED_ONLY);
    expect(await scoreDigest()).toBe(before);
    const row = await prisma.mktSource.findUnique({ where: { id: saved.id } });
    expect(row?.licenseBasis).toBe("license_required");
    expect(row?.status).toBe("inactive");
    expect(row?.automationAllowed).toBe(false);
    expect(row?.paywalled).toBe(true);
    expect(sourceFeedsOfficialScore(row!)).toBe(false);
    const again = await registerPaidSource({
      name: "Example Paid Feed",
      publisher: "Example Publisher",
      url: "https://example.com/series-2",
      termsUrl: "https://example.com/terms",
      costNotes: "Updated note.",
      licenseStatus: "pending_license",
    });
    expect(again.id).toBe(saved.id);
    expect(await scoreDigest()).toBe(before);
    const updated = await prisma.mktSource.findUnique({ where: { id: saved.id } });
    expect(updated?.status).toBe("pending_license");
    expect(updated?.licenseBasis).toBe("license_required");
    await expect(registerPaidSource({ name: "LoopNet", publisher: "CoStar", url: "" })).rejects.toThrow(MARKETS_LOOPNET);
    expect(await prisma.mktSource.count({ where: { name: { contains: "LoopNet" } } })).toBe(0);
    await expect(registerPaidSource({ name: "BLS LAUS", publisher: "Someone", url: "" })).rejects.toThrow(MARKETS_PUBLIC_SOURCE);
    expect(await scoreDigest()).toBe(before);
  });
});

describe("unauthenticated markets API", () => {
  it("refuses GET /api/markets when the unlock gate is on", async () => {
    vi.stubEnv("PRINCIPAL_PASSWORD", "principal-unlock-demo");
    vi.stubEnv("PARTNER_VIEW_TOKEN", "partner-share-token-demo");
    const { GET } = await import("../src/app/api/markets/route");
    const response = await GET();
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe(MARKETS_LOCKED);
    vi.unstubAllEnvs();
  });
});

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full);
  }
  return found;
}
