import type { ExpertClientContext, OfflineBundle } from "./types";
import { EXPERT_SYSTEM_PROMPT } from "./system-prompt";

function isErr(value: unknown): value is { ok: false; error: string } {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok: unknown }).ok === false);
}

const KEY_KPI_IDS = new Set([
  "noi_period",
  "egi",
  "physical_occupancy",
  "dscr",
  "debt_yield",
  "loss_to_lease",
]);

/** Compact live-books view for the model. Full rows stay behind tool calls. */
export function summarizeExpertSnapshot(ctx: ExpertClientContext, bundle: OfflineBundle) {
  const entity = isErr(bundle.entity)
    ? { error: bundle.entity.error }
    : {
        code: bundle.entity.code,
        name: bundle.entity.name,
        type: bundle.entity.type,
        parentCode: bundle.entity.parentCode,
        unitCount: bundle.entity.unitCount,
      };

  const period = isErr(bundle.period)
    ? { error: bundle.period.error }
    : {
        periodLabel: bundle.period.periodLabel,
        status: bundle.period.status,
        statusLabel: bundle.period.statusLabel,
        openChecklistCount: bundle.period.openItems?.length ?? 0,
      };

  const completeness = isErr(bundle.completeness)
    ? { error: bundle.completeness.error }
    : {
        score: bundle.completeness.score,
        ready: bundle.completeness.ready,
        applicable: bundle.completeness.applicable,
        gaps: bundle.completeness.items
          .filter((item) => item.status === "missing" || item.status === "partial")
          .map((item) => ({
            id: item.id,
            label: item.label,
            status: item.status,
            detail: item.detail,
          })),
      };

  const flags = isErr(bundle.anomalies) ? [] : bundle.anomalies.flags;
  const blockers = flags
    .filter((flag) => flag.severity === "blocker")
    .map((flag) => ({ id: flag.id, title: flag.title, detail: flag.detail }));

  const kpis = isErr(bundle.kpis)
    ? { error: bundle.kpis.error }
    : {
        kind: bundle.kpis.kind,
        viewLabel: bundle.kpis.viewLabel,
        tiles: bundle.kpis.tiles
          .filter((tile) => KEY_KPI_IDS.has(tile.id) || tile.id.includes("noi"))
          .slice(0, 6)
          .map((tile) => ({
            id: tile.id,
            display: tile.display,
            gated: tile.gated,
          })),
      };

  return {
    page: {
      pathname: ctx.pathname,
      pageTitle: ctx.pageTitle,
      entityCode: ctx.entityCode,
      periodLabel: ctx.periodLabel,
      view: ctx.view ?? null,
      accessRole: ctx.accessRole ?? "principal",
    },
    entity,
    period,
    completeness,
    blockers,
    watchInfoFlagCount: flags.filter((flag) => flag.severity !== "blocker").length,
    kpis,
    note: "Summary only. Call getAnomalies / getDataCompleteness / getKpiSnapshot / listNavTargets if this answer needs a full row. Do not recite blockers or gaps unless the user asked or a blocker is on this page.",
  };
}

export function buildSystemForTurn(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  return `${EXPERT_SYSTEM_PROMPT}

Current page (authoritative for where they are):
${JSON.stringify({
    pathname: ctx.pathname,
    pageTitle: ctx.pageTitle,
    entityCode: ctx.entityCode,
    periodLabel: ctx.periodLabel,
    view: ctx.view ?? null,
    accessRole: ctx.accessRole ?? "principal",
  })}

Preloaded tool snapshot (summary — call tools if you need full rows):
${JSON.stringify(summarizeExpertSnapshot(ctx, bundle))}`;
}
