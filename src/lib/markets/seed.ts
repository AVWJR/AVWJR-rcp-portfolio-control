import { prisma } from "@/lib/prisma";
import {
  buildMarketSeedPlan,
  officialBacktestRecord,
  officialModelRecord,
  officialRunRecord,
} from "./catalog";
import { isMissingMarketTable } from "./missing";
import { MARKETS_SETUP_PENDING } from "./types";

/** Upserts the approved free-data run. Does not delete metros, scores, or SPE books. */
export async function seedMarketRanks(): Promise<{ metros: number }> {
  const plan = buildMarketSeedPlan();
  const model = officialModelRecord();
  const run = officialRunRecord();
  const backtest = officialBacktestRecord();

  for (const source of plan.sources) {
    await prisma.mktSource.upsert({
      where: { id: source.id },
      create: source,
      update: {
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
        sortOrder: source.sortOrder,
      },
    });
  }

  for (const variable of plan.variables) {
    await prisma.mktVariable.upsert({
      where: { id: variable.id },
      create: {
        id: variable.id,
        name: variable.name,
        plainDefinition: variable.plainDefinition,
        pillar: variable.pillar,
        unit: variable.unit,
        expectedSign: variable.expectedSign,
        whyItMatters: variable.whyItMatters,
        inScoreToday: variable.inScoreToday,
        inScoreLabel: variable.inScoreLabel,
        sourceLabel: variable.sourceLabel,
        weightNotes: variable.weightNotes,
        sortOrder: variable.sortOrder,
      },
      update: {
        name: variable.name,
        plainDefinition: variable.plainDefinition,
        pillar: variable.pillar,
        unit: variable.unit,
        expectedSign: variable.expectedSign,
        whyItMatters: variable.whyItMatters,
        inScoreToday: variable.inScoreToday,
        inScoreLabel: variable.inScoreLabel,
        sourceLabel: variable.sourceLabel,
        weightNotes: variable.weightNotes,
        sortOrder: variable.sortOrder,
      },
    });
    await prisma.mktVariableSource.deleteMany({ where: { variableId: variable.id } });
    if (variable.sourceIds.length > 0) {
      await prisma.mktVariableSource.createMany({
        data: variable.sourceIds.map((sourceId) => ({ variableId: variable.id, sourceId })),
      });
    }
  }

  await prisma.mktModelVersion.upsert({
    where: { id: model.id },
    create: model,
    update: {
      code: model.code,
      name: model.name,
      derivationPlainEnglish: model.derivationPlainEnglish,
      isOfficial: model.isOfficial,
    },
  });

  for (const weight of plan.weights) {
    await prisma.mktWeightSet.upsert({
      where: { id: weight.id },
      create: { ...weight, modelVersionId: model.id },
      update: {
        scope: weight.scope,
        pillar: weight.pillar,
        variableId: weight.variableId,
        weightNumerator: weight.weightNumerator,
        weightDenominator: weight.weightDenominator,
        notes: weight.notes,
        sortOrder: weight.sortOrder,
      },
    });
  }

  await prisma.mktScoreRun.upsert({
    where: { id: run.id },
    create: run,
    update: {
      modelVersionId: run.modelVersionId,
      asOf: run.asOf,
      isOfficial: run.isOfficial,
      label: run.label,
      notes: run.notes,
    },
  });

  for (const metro of plan.metros) {
    await prisma.mktMetro.upsert({
      where: { cbsaCode: metro.cbsaCode },
      create: { cbsaCode: metro.cbsaCode, name: metro.name },
      update: { name: metro.name },
    });
    await prisma.mktMetroScore.upsert({
      where: { id: metro.id },
      create: {
        id: metro.id,
        runId: run.id,
        metroId: metro.cbsaCode,
        rank: metro.rank,
        viabilityTenths: metro.viabilityTenths,
        band: metro.band,
        tiedWithinBand: metro.tiedWithinBand,
        tiedCount: metro.tiedCount,
        rankP5Milli: metro.rankP5Milli,
        rankP95Milli: metro.rankP95Milli,
        confidenceTenths: metro.confidenceTenths,
        momentum: metro.momentum,
        flags: metro.flags,
        pillarScoresJson: metro.pillarScoresJson,
      },
      update: {
        runId: run.id,
        metroId: metro.cbsaCode,
        rank: metro.rank,
        viabilityTenths: metro.viabilityTenths,
        band: metro.band,
        tiedWithinBand: metro.tiedWithinBand,
        tiedCount: metro.tiedCount,
        rankP5Milli: metro.rankP5Milli,
        rankP95Milli: metro.rankP95Milli,
        confidenceTenths: metro.confidenceTenths,
        momentum: metro.momentum,
        flags: metro.flags,
        pillarScoresJson: metro.pillarScoresJson,
      },
    });
  }

  await prisma.mktBacktestResult.upsert({
    where: { id: backtest.id },
    create: backtest,
    update: { limitationPlainEnglish: backtest.limitationPlainEnglish, runId: backtest.runId },
  });

  return { metros: plan.metros.length };
}

export async function seedMarketRanksIfReady(): Promise<void> {
  try {
    await seedMarketRanks();
  } catch (error) {
    if (isMissingMarketTable(error)) {
      console.warn(MARKETS_SETUP_PENDING);
      return;
    }
    throw error;
  }
}
