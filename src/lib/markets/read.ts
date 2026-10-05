import { prisma } from "@/lib/prisma";
import { formatMilli, formatTenths, formatWeight } from "./parse";
import { marketSeedWritesAllowed, sourceFeedsOfficialScore } from "./policy";
import { isMissingMarketTable } from "./missing";
import { seedMarketRanks } from "./seed";
import {
  DATA_NEEDED,
  MARKETS_SCORES_PENDING,
  MARKETS_SETUP_PENDING,
  OFFICIAL_AS_OF_LABEL,
  PILLAR_NAMES,
  type PillarName,
} from "./types";

export type MarketsPending = { state: "pending"; message: string };

export type ScoreboardRow = {
  cbsa: string;
  name: string;
  rank: number;
  viability: string;
  band: string;
  confidence: string;
  momentum: string;
  flags: string;
};

export type MetricRow = {
  id: string;
  name: string;
  pillar: string;
  definition: string;
  unit: string;
  expectedSign: string;
  whyItMatters: string;
  source: string;
  inScoreToday: string;
  weightNotes: string;
};

export type WeightRow = {
  scope: string;
  pillar: string;
  variableId: string;
  weight: string;
  notes: string;
};

export type SourceRow = {
  id: string;
  name: string;
  publisher: string;
  url: string;
  termsUrl: string;
  licenseBasis: string;
  automationAllowed: boolean;
  costNotes: string;
  status: string;
  paywalled: boolean;
  notes: string;
  feedsScore: boolean;
};

export type MarketsBundle = {
  state: "ready";
  asOfLabel: string;
  runLabel: string;
  derivation: string;
  backtest: string;
  rows: ScoreboardRow[];
  metrics: MetricRow[];
  weights: WeightRow[];
  sources: SourceRow[];
  scoringSourceIds: string[];
};

export type MetroDetail = {
  cbsa: string;
  name: string;
  rank: number;
  of: number;
  viability: string;
  band: string;
  tiedWithinBand: string;
  tiedCount: number;
  rankP5: string;
  rankP95: string;
  confidence: string;
  momentum: string;
  flags: string;
  pillars: { name: PillarName; score: string | null }[];
  metrics: MetricRow[];
};

export type MarketTileModel =
  | { state: "locked" }
  | MarketsPending
  | {
      state: "ready";
      metroCount: number;
      topName: string;
      topScore: string;
      topRank: number;
      asOfLabel: string;
    };

function signLabel(raw: string): string {
  if (raw === "higher_is_worse") return "Higher is worse";
  return DATA_NEEDED;
}

function pillarList(json: string): { name: PillarName; score: string | null }[] {
  let parsed: Record<string, string> = {};
  try {
    const value = JSON.parse(json) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parsed = value as Record<string, string>;
    }
  } catch {
    parsed = {};
  }
  return PILLAR_NAMES.map((name) => {
    const score = parsed[name];
    return { name, score: score ? score : null };
  });
}

async function officialCount(): Promise<number> {
  return prisma.mktMetroScore.count({ where: { run: { isOfficial: true } } });
}

export async function ensureOfficialScores(): Promise<"ready" | MarketsPending> {
  try {
    const count = await officialCount();
    if (count >= 200) return "ready";
    if (!marketSeedWritesAllowed()) return { state: "pending", message: MARKETS_SCORES_PENDING };
    await seedMarketRanks();
    return "ready";
  } catch (error) {
    if (isMissingMarketTable(error)) return { state: "pending", message: MARKETS_SETUP_PENDING };
    throw error;
  }
}

export async function scoreDigest(): Promise<string> {
  const rows = await prisma.mktMetroScore.findMany({
    orderBy: [{ runId: "asc" }, { rank: "asc" }],
    select: {
      id: true,
      rank: true,
      viabilityTenths: true,
      confidenceTenths: true,
      momentum: true,
      flags: true,
      band: true,
      pillarScoresJson: true,
    },
  });
  return rows
    .map((row) =>
      [row.id, row.rank, row.viabilityTenths, row.confidenceTenths, row.momentum, row.band, row.flags, row.pillarScoresJson].join(
        "|",
      ),
    )
    .join("\n");
}

export async function loadMarketsBundle(): Promise<MarketsBundle | MarketsPending> {
  const ready = await ensureOfficialScores();
  if (ready !== "ready") return ready;
  const run = await prisma.mktScoreRun.findFirst({
    where: { isOfficial: true },
    include: {
      modelVersion: { include: { weightSets: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } },
      backtest: true,
      scores: { include: { metro: true }, orderBy: { rank: "asc" } },
    },
  });
  if (!run) return { state: "pending", message: MARKETS_SCORES_PENDING };
  const [sources, variables] = await Promise.all([
    prisma.mktSource.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.mktVariable.findMany({
      orderBy: { sortOrder: "asc" },
      include: { sources: { include: { source: true } } },
    }),
  ]);
  const scoringSources = sources.filter((source) => sourceFeedsOfficialScore(source));
  const scoringIds = new Set(scoringSources.map((source) => source.id));
  return {
    state: "ready",
    asOfLabel: OFFICIAL_AS_OF_LABEL,
    runLabel: run.label,
    derivation: run.modelVersion.derivationPlainEnglish,
    backtest: run.backtest?.limitationPlainEnglish ?? DATA_NEEDED,
    rows: run.scores.map((score) => ({
      cbsa: score.metro.cbsaCode,
      name: score.metro.name,
      rank: score.rank,
      viability: formatTenths(score.viabilityTenths),
      band: score.band,
      confidence: formatTenths(score.confidenceTenths),
      momentum: score.momentum,
      flags: score.flags,
    })),
    metrics: variables.map((variable) => ({
      id: variable.id,
      name: variable.name,
      pillar: variable.pillar,
      definition: variable.plainDefinition,
      unit: variable.unit,
      expectedSign: signLabel(variable.expectedSign),
      whyItMatters: variable.whyItMatters,
      source: variable.sourceLabel || DATA_NEEDED,
      inScoreToday: variable.inScoreLabel,
      weightNotes: variable.weightNotes || DATA_NEEDED,
    })),
    weights: run.modelVersion.weightSets.map((weight) => ({
      scope: weight.scope,
      pillar: weight.pillar,
      variableId: weight.variableId ?? "",
      weight: formatWeight(weight.weightNumerator, weight.weightDenominator),
      notes: weight.notes,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      publisher: source.publisher,
      url: source.url,
      termsUrl: source.termsUrl,
      licenseBasis: source.licenseBasis,
      automationAllowed: source.automationAllowed,
      costNotes: source.costNotes,
      status: source.status,
      paywalled: source.paywalled,
      notes: source.notes,
      feedsScore: scoringIds.has(source.id),
    })),
    scoringSourceIds: [...scoringIds],
  };
}

export async function loadMetroDetail(cbsa: string): Promise<MetroDetail | MarketsPending | null> {
  const bundle = await loadMarketsBundle();
  if (bundle.state !== "ready") return bundle;
  const run = await prisma.mktScoreRun.findFirst({
    where: { isOfficial: true },
    include: { scores: { where: { metroId: cbsa }, include: { metro: true } } },
  });
  const score = run?.scores[0];
  if (!score) return null;
  const inScore = bundle.metrics.filter((metric) => metric.inScoreToday === "yes");
  return {
    cbsa: score.metro.cbsaCode,
    name: score.metro.name,
    rank: score.rank,
    of: bundle.rows.length,
    viability: formatTenths(score.viabilityTenths),
    band: score.band,
    tiedWithinBand: score.tiedWithinBand,
    tiedCount: score.tiedCount,
    rankP5: formatMilli(score.rankP5Milli),
    rankP95: formatMilli(score.rankP95Milli),
    confidence: formatTenths(score.confidenceTenths),
    momentum: score.momentum,
    flags: score.flags,
    pillars: pillarList(score.pillarScoresJson),
    metrics: inScore,
  };
}

export async function loadMarketRanksTile(): Promise<Exclude<MarketTileModel, { state: "locked" }>> {
  const bundle = await loadMarketsBundle();
  if (bundle.state !== "ready") return bundle;
  const top = bundle.rows[0];
  if (!top) return { state: "pending", message: MARKETS_SCORES_PENDING };
  return {
    state: "ready",
    metroCount: bundle.rows.length,
    topName: top.name,
    topScore: top.viability,
    topRank: top.rank,
    asOfLabel: bundle.asOfLabel,
  };
}

export function scoreboardCsv(rows: ScoreboardRow[]): string {
  const header = ["exact_rank", "metro", "CBSA", "viability_score_1_100", "band", "confidence_1_100", "momentum", "flags"];
  const lines = rows.map((row) =>
    [row.rank, row.cbsa, csvCell(row.name), row.viability, csvCell(row.band), row.confidence, row.momentum, csvCell(row.flags)].join(
      ",",
    ),
  );
  return `${header.join(",")}\n${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
