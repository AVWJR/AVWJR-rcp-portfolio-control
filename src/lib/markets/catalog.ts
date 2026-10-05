import fs from "node:fs";
import path from "node:path";
import { csvRecords, decimalToMilli, decimalToTenths } from "./parse";
import {
  BACKTEST_LIMITATION,
  DATA_NEEDED,
  DERIVATION_PLAIN_ENGLISH,
  NOT_CONNECTED,
  OFFICIAL_AS_OF_ISO,
  OFFICIAL_BACKTEST_ID,
  OFFICIAL_MODEL_CODE,
  OFFICIAL_MODEL_ID,
  OFFICIAL_RUN_ID,
  PILLAR_NAMES,
  type MarketSeedPlan,
  type MetroScoreSeed,
  type SourceSeed,
  type VariableSeed,
  type WeightSeed,
} from "./types";

export const MODEL_DERIVATION = DERIVATION_PLAIN_ENGLISH;
export const BACKTEST_TEXT = BACKTEST_LIMITATION;

const NO_FETCH = "No automated fetch in this version.";

type Agency = { publisher: string; url: string };

function agencyFor(name: string): Agency {
  if (name.startsWith("BLS CES") && !name.includes("Census")) {
    return { publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/ces/" };
  }
  if (name.startsWith("BLS LAUS")) {
    return { publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/lau/" };
  }
  if (name.startsWith("BLS QCEW")) {
    return { publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/cew/" };
  }
  if (name.startsWith("IRS")) {
    return { publisher: "Internal Revenue Service", url: "https://www.irs.gov/statistics/soi-tax-stats-migration-data" };
  }
  if (name.startsWith("Census PEP")) {
    return { publisher: "U.S. Census Bureau", url: "https://www.census.gov/programs-surveys/popest.html" };
  }
  if (name.startsWith("Census ACS") && !name.includes("BPS") && !name.includes("+")) {
    return { publisher: "U.S. Census Bureau", url: "https://www.census.gov/programs-surveys/acs.html" };
  }
  if (name.startsWith("Census BPS") && !name.includes("ACS") && !name.includes("BLS") && !name.includes("+")) {
    return { publisher: "U.S. Census Bureau", url: "https://www.census.gov/construction/bps/" };
  }
  if (name.includes("Census") && name.includes("BLS")) {
    return { publisher: "U.S. Census Bureau and U.S. Bureau of Labor Statistics", url: "" };
  }
  if (name.startsWith("Census")) {
    return { publisher: "U.S. Census Bureau", url: "" };
  }
  return { publisher: DATA_NEEDED, url: "" };
}

export function sourceIdFor(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `src-${slug}`.slice(0, 90);
}

function blankSource(name: string): boolean {
  return name === "" || name === "—" || name === "-" || name === "–";
}

function seriesId(raw: string, pillar: string): string {
  if (/^[A-Z]{2,4}-\d+$/.test(raw)) return raw;
  if (pillar === "Capital markets") return "PILLAR-CAPITAL-MARKETS";
  if (pillar === "Risk") return "PILLAR-RISK";
  if (pillar.startsWith("Not scored")) return "COMMENTARY-LOCAL-MEDIA";
  if (pillar.startsWith("Paid")) return "PAID-ON-HOLD";
  if (pillar.startsWith("Queued")) return "QUEUED-V11";
  throw new Error(`No variable id for ${pillar}`);
}

function unitFromDefinition(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("ratio")) return "ratio";
  if (lower.includes("%") || lower.includes("percent")) return "percent";
  if (lower.includes("rate")) return "rate";
  return DATA_NEEDED;
}

function marketDataDir(): string {
  return path.join(process.cwd(), "data", "market-ranks");
}

function readData(name: string): string {
  return fs.readFileSync(path.join(marketDataDir(), name), "utf8");
}

export function loadApprovedFiles() {
  const presentation = csvRecords(readData("01_scores_all_200_metros.csv"));
  const sources = csvRecords(readData("02_data_sources_in_v1.csv"));
  const top50 = csvRecords(readData("03_top50_scores.csv"));
  const phase5 = csvRecords(readData("phase5_scores_v1_2026-10-04.csv"), true);
  return { presentation, sources, top50, phase5 };
}

function pillarJson(row: Record<string, string> | undefined): string {
  const scores: Record<string, string> = {};
  if (!row) return "{}";
  for (const name of PILLAR_NAMES) {
    const raw = row[`subscore_${name}`] ?? "";
    if (raw) scores[name] = raw;
  }
  return JSON.stringify(scores);
}

export function buildMarketSeedPlan(files = loadApprovedFiles()): MarketSeedPlan {
  const inScoreSourceNames = new Set(
    files.sources.filter((row) => row.in_score_today === "yes" && !blankSource(row.source)).map((row) => row.source),
  );

  const sourceNames: string[] = [];
  for (const row of files.sources) {
    if (blankSource(row.source) || row.source === "vendor quotes on hold") continue;
    if (row.source === "BLS QCEW; IRS SOI") {
      for (const part of ["BLS QCEW", "IRS SOI"]) {
        if (!sourceNames.includes(part)) sourceNames.push(part);
      }
      continue;
    }
    if (!sourceNames.includes(row.source)) sourceNames.push(row.source);
  }

  const sources: SourceSeed[] = sourceNames.map((name, index) => {
    const commentary = name === "CRE Sentinel local-media pass";
    const queued = name === "BLS QCEW" || name === "IRS SOI";
    const active = inScoreSourceNames.has(name);
    const agency = commentary ? { publisher: "CRE Sentinel", url: "" } : agencyFor(name);
    let notes = NO_FETCH;
    let costNotes = "Public series. No fee in v1.";
    let status: SourceSeed["status"] = active ? "active" : "inactive";
    let licenseBasis: SourceSeed["licenseBasis"] = "public";
    if (commentary) {
      licenseBasis = "manual_only";
      status = "inactive";
      costNotes = "Commentary only. No fee.";
      notes = `Commentary only. Market color and local news never change the score. ${NO_FETCH}`;
    } else if (queued) {
      costNotes = "Public series. Not in the v1 score.";
      notes = `Queued for v1.1. Not in the official v1 score. ${NO_FETCH}`;
    } else if (!active) {
      costNotes = "Public series. Weight 0 in v1. No fee.";
      notes = `Eligible but weight 0 in v1. Not in the official score. ${NO_FETCH}`;
    } else {
      notes = `In the official free-data score. ${NO_FETCH}`;
    }
    return {
      id: sourceIdFor(name),
      name,
      publisher: agency.publisher,
      url: agency.url,
      termsUrl: "",
      licenseBasis,
      automationAllowed: false,
      costNotes,
      status,
      paywalled: false,
      notes,
      sortOrder: index,
    };
  });

  const paid: SourceSeed[] = [
    {
      id: sourceIdFor("Yardi Matrix"),
      name: "Yardi Matrix",
      publisher: "Yardi",
      url: "",
      termsUrl: "",
      licenseBasis: "license_required",
      automationAllowed: false,
      costNotes: "Paid. Not connected. No price is stored in v1.",
      status: "inactive",
      paywalled: true,
      notes: `${NOT_CONNECTED} ${NO_FETCH}`,
      sortOrder: sources.length,
    },
    {
      id: sourceIdFor("MSCI"),
      name: "MSCI",
      publisher: "MSCI",
      url: "",
      termsUrl: "",
      licenseBasis: "license_required",
      automationAllowed: false,
      costNotes: "Paid. Not connected. No price is stored in v1.",
      status: "inactive",
      paywalled: true,
      notes: `${NOT_CONNECTED} ${NO_FETCH}`,
      sortOrder: sources.length + 1,
    },
  ];
  sources.push(...paid);

  const sourceByName = new Map(sources.map((row) => [row.name, row.id]));
  const variables: VariableSeed[] = files.sources.map((row, index) => {
    const id = seriesId(row.variable_id, row.pillar);
    const sourceIds: string[] = [];
    if (row.pillar.startsWith("Paid")) {
      sourceIds.push(sourceIdFor("Yardi Matrix"), sourceIdFor("MSCI"));
    } else if (row.source === "BLS QCEW; IRS SOI") {
      sourceIds.push(sourceIdFor("BLS QCEW"), sourceIdFor("IRS SOI"));
    } else if (!blankSource(row.source) && sourceByName.has(row.source)) {
      sourceIds.push(sourceByName.get(row.source)!);
    }
    const weightNotes = row.weight_notes ?? "";
    return {
      id,
      name: /^[A-Z]{2,4}-\d+$/.test(id) ? id : row.what_it_measures_plain_english,
      plainDefinition: row.what_it_measures_plain_english,
      pillar: row.pillar,
      unit: unitFromDefinition(row.what_it_measures_plain_english),
      expectedSign: /worse/i.test(weightNotes) ? "higher_is_worse" : "not_stated",
      whyItMatters: weightNotes || DATA_NEEDED,
      inScoreToday: row.in_score_today === "yes",
      inScoreLabel: row.in_score_today,
      sourceLabel: blankSource(row.source) ? "" : row.source,
      weightNotes,
      sortOrder: index,
      sourceIds,
    };
  });

  const weights: WeightSeed[] = [];
  const scoredPillars = ["Demand", "Demographics", "Supply", "Affordability", "Operating"];
  scoredPillars.forEach((pillar, index) => {
    weights.push({
      id: `mkt-weight-pillar-${pillar.toLowerCase()}`,
      scope: "PILLAR",
      pillar,
      variableId: null,
      weightNumerator: 1,
      weightDenominator: 5,
      notes: "Equal pillar. 20% of the Viability Score.",
      sortOrder: index,
    });
  });
  weights.push(
    {
      id: "mkt-weight-pillar-capital-markets",
      scope: "PILLAR",
      pillar: "Capital markets",
      variableId: null,
      weightNumerator: 0,
      weightDenominator: 1,
      notes: "No public variables in v1. Pillar weight 0.",
      sortOrder: 5,
    },
    {
      id: "mkt-weight-pillar-risk",
      scope: "PILLAR",
      pillar: "Risk",
      variableId: null,
      weightNumerator: 0,
      weightDenominator: 1,
      notes: "No public variables in v1. Pillar weight 0.",
      sortOrder: 6,
    },
  );

  for (const pillar of scoredPillars) {
    const members = variables.filter((row) => row.pillar === pillar && /^[A-Z]{2,4}-\d+$/.test(row.id));
    const inScore = members.filter((row) => row.inScoreToday);
    members.forEach((row, index) => {
      const supplyZero = pillar === "Supply" && row.id !== "SUP-20";
      const supplyFull = row.id === "SUP-20";
      weights.push({
        id: `mkt-weight-var-${row.id}`,
        scope: "VARIABLE",
        pillar,
        variableId: row.id,
        weightNumerator: supplyFull ? 1 : supplyZero || !row.inScoreToday ? 0 : 1,
        weightDenominator: supplyFull ? 1 : supplyZero || !row.inScoreToday ? 1 : inScore.length,
        notes: supplyFull
          ? "100% of the Supply pillar."
          : supplyZero
            ? "Eligible but weight 0. The backtest put all Supply weight on SUP-20."
            : "Equal share of this pillar.",
        sortOrder: 100 + index,
      });
    });
  }

  const phase5ByCbsa = new Map(files.phase5.map((row) => [row.cbsa_code, row]));
  if (files.presentation.length !== 200) {
    throw new Error(`Expected 200 metros, found ${files.presentation.length}`);
  }
  const metros: MetroScoreSeed[] = files.presentation.map((row) => {
    const cbsa = row.metro;
    const phase5 = phase5ByCbsa.get(cbsa);
    if (!phase5) throw new Error(`Phase 5 file has no row for CBSA ${cbsa}`);
    if (Number(phase5.rank) !== Number(row.exact_rank)) {
      throw new Error(`Rank mismatch for CBSA ${cbsa}`);
    }
    return {
      id: `mkt-score-${cbsa}`,
      cbsaCode: cbsa,
      name: row.CBSA,
      rank: Number(row.exact_rank),
      viabilityTenths: decimalToTenths(row.viability_score_1_100),
      band: row.band,
      tiedWithinBand: row.tied_within_band,
      tiedCount: Number(row.tied_count),
      rankP5Milli: decimalToMilli(row.rank_p5),
      rankP95Milli: decimalToMilli(row.rank_p95),
      confidenceTenths: decimalToTenths(row.confidence_1_100),
      momentum: row.momentum,
      flags: row.flags,
      pillarScoresJson: pillarJson(phase5),
    };
  });

  return { sources, variables, weights, metros };
}

export function officialRunRecord() {
  return {
    id: OFFICIAL_RUN_ID,
    modelVersionId: OFFICIAL_MODEL_ID,
    asOf: new Date(`${OFFICIAL_AS_OF_ISO}T12:00:00.000Z`),
    isOfficial: true,
    label: "Free public data v1",
    notes:
      "Official presentation scores from the Nov 1, 2025 free-data run. Pillar subscores come from the Phase 5 file when the cell is present. Paid sources are not inputs.",
  };
}

export function officialModelRecord() {
  return {
    id: OFFICIAL_MODEL_ID,
    code: OFFICIAL_MODEL_CODE,
    name: "Equal pillars, Supply SUP-20",
    derivationPlainEnglish: MODEL_DERIVATION,
    isOfficial: true,
  };
}

export function officialBacktestRecord() {
  return {
    id: OFFICIAL_BACKTEST_ID,
    runId: OFFICIAL_RUN_ID,
    limitationPlainEnglish: BACKTEST_TEXT,
  };
}
