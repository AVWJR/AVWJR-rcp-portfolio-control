import { cfadsCents, periodPpeAdditionsCents } from "@rcp/analytics";
import { buildIncomeStatement, netByCode, rollupBalances } from "@rcp/ledger";
import { buildOperatingPackage } from "@/lib/operating";
import { loadPortfolioDebt } from "@/lib/debt-view";
import { europeanPromoteOpen, loadLiveSpeWaterfalls, loadSpeWaterfall, type SpeWaterfallRecord } from "@/lib/waterfall";
import type { DealProformaSeed } from "@/lib/proforma-types";

async function periodCfadsForEntity(entityId: string, entityCode: string, year: number, month: number): Promise<bigint> {
  const pack = await buildOperatingPackage({ entityId, year, month, consolidated: false });
  const balances = rollupBalances(pack.scope.throughEnd);
  const endMap = new Map(balances.map((row) => [row.code, netByCode(balances, row.code)]));
  const startBalances = rollupBalances(pack.scope.throughStart);
  const startMap = new Map(startBalances.map((row) => [row.code, netByCode(startBalances, row.code)]));
  const is = buildIncomeStatement({
    throughEnd: pack.scope.throughEnd,
    throughStart: pack.scope.throughStart,
    inPeriod: pack.scope.inPeriod,
  });
  const loans = (await loadPortfolioDebt(year, month)).filter((l) => l.entityCode === entityCode);
  const reserveReq = loans[0]?.reserveRequirementCents ?? 0n;
  const periodCapex = periodPpeAdditionsCents(startMap, endMap);
  return cfadsCents({
    periodNoiCents: is.noi,
    periodCapexCents: periodCapex,
    reserveRequirementCents: reserveReq,
  });
}

function seedFromRecord(
  record: SpeWaterfallRecord,
  periodCfadsCents: bigint,
  gate: boolean,
): DealProformaSeed {
  return {
    entityCode: record.entityCode,
    entityName: record.entityName,
    config: record.config,
    lpContributedCents: record.lpContributedCents.toString(),
    unreturnedCapitalCents: record.unreturnedCapitalCents.toString(),
    unpaidPrefCents: record.unpaidPrefCents.toString(),
    prefPaidToDateCents: record.prefPaidToDateCents.toString(),
    periodCfadsCents: periodCfadsCents.toString(),
    europeanPromoteOpen: gate,
  };
}

export async function loadDealProformaSeed(opts: {
  entityId: string;
  entityCode: string;
  parentId: string | null;
  year: number;
  month: number;
}): Promise<DealProformaSeed | null> {
  const record = await loadSpeWaterfall(opts.entityId);
  if (!record) return null;
  const siblings = opts.parentId ? await loadLiveSpeWaterfalls(opts.parentId) : [record];
  const gate = europeanPromoteOpen(siblings, 1);
  const cfads = await periodCfadsForEntity(opts.entityId, opts.entityCode, opts.year, opts.month);
  return seedFromRecord(record, cfads, gate);
}

export async function loadOpCoProformaSeeds(opts: {
  opcoId: string;
  year: number;
  month: number;
}): Promise<DealProformaSeed[]> {
  const records = await loadLiveSpeWaterfalls(opts.opcoId);
  const gate = europeanPromoteOpen(records, 1);
  const out: DealProformaSeed[] = [];
  for (const record of records) {
    const cfads = await periodCfadsForEntity(record.entityId, record.entityCode, opts.year, opts.month);
    out.push(seedFromRecord(record, cfads, gate));
  }
  return out;
}
