import { preferHowToChrome, rankChips, rankSuggestedActions } from "@/lib/expert/actions";
import {
  HOW_TO_SYSTEM_SECTION,
  isT12UploadQuery,
  matchHowTo,
} from "@/lib/expert/how-to-playbook";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { readExpertContext } from "@/lib/expert/nav";
import { buildSystemForTurn } from "@/lib/expert/snapshot";
import { EXPERT_SYSTEM_PROMPT } from "@/lib/expert/system-prompt";
import { describe, expect, it } from "vitest";

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

function packCtx() {
  return readExpertContext(
    "/narratives/packs/monthly_investor",
    new URLSearchParams("entity=SPE-HMTOS&period=2026-08"),
  );
}

function chromeLabels(reply: { actions?: { label: string; href?: string }[]; chips?: { label: string }[] }) {
  return [...(reply.actions ?? []), ...(reply.chips ?? [])].map((row) => row.label);
}

function chromeHrefs(reply: { actions?: { href?: string }[] }) {
  return (reply.actions ?? []).map((row) => row.href ?? "");
}

describe("Expert how-to playbook", () => {
  it("matches T12 re-upload variants and not pack-metric wording", () => {
    const uploads = [
      "how do I reupload the T12?",
      "How do I re-upload the T12?",
      "how do I reupload the t12",
      "replace the T12",
      "upload a new T12",
      "how do I upload the P&L",
      "re-upload the T-12 workbook",
    ];
    for (const q of uploads) {
      expect(isT12UploadQuery(q), q).toBe(true);
      expect(matchHowTo(q), q).toBe("reupload_t12");
    }
    expect(matchHowTo("what is T12 NOI on this pack?")).toBe("t12_incomplete_metric");
    expect(matchHowTo("why is T12 incomplete 2/12?")).toBe("t12_incomplete_metric");
    expect(isT12UploadQuery("what is T12 NOI on this pack?")).toBe(false);
  });

  it("answers T12 reupload from a Monthly Investor Pack page without pack export copy", () => {
    const ctx = packCtx();
    const reply = answerOffline("how do I reupload the T12?", ctx, emptyBundle);
    expect(reply.content).toMatch(/Store in vault/i);
    expect(reply.content).toMatch(/Add Deal/);
    expect(reply.content).toMatch(/Upload files/);
    expect(reply.content).toMatch(/Kind/);
    expect(reply.content).toMatch(/Other/);
    expect(reply.content).toMatch(/could not map columns/i);
    expect(reply.content).toMatch(/2\/12/);
    expect(reply.content).toMatch(/does \*\*not\*\* turn two demo months|not\*\* turn two demo months|does \*\*not\*\* turn/i);
    expect(reply.content).not.toMatch(/generate the PDF|PDF or PPTX from this page|tighten the thesis|LP narrative/i);
    expect(reply.content).not.toMatch(/cover →/);
    expect(chromeHrefs(reply).some((href) => href.includes("/vault"))).toBe(true);
    expect(chromeHrefs(reply).some((href) => href.includes("/deals/new"))).toBe(true);
    expect(chromeLabels(reply).every((label) => !/lp narrative|investor pack|audience|operating statement/i.test(label))).toBe(
      true,
    );
  });

  it("answers close T12 variants the same way", () => {
    const ctx = packCtx();
    for (const q of ["How do I re-upload the T12?", "replace the T12", "how do I upload the P&L"]) {
      const reply = answerOffline(q, ctx, emptyBundle);
      expect(reply.content, q).toMatch(/Vault/);
      expect(reply.content, q).toMatch(/Add Deal/);
      expect(reply.content, q).not.toMatch(/Monthly Investor Pack PDF|tighten the thesis/i);
    }
  });

  it("answers rent-roll re-apply including Kind Other *RR*", () => {
    const ctx = packCtx();
    const reply = answerOffline("how do I re-apply the rent roll?", ctx, emptyBundle);
    expect(reply.content).toMatch(/Re-apply/);
    expect(reply.content).toMatch(/Import/);
    expect(reply.content).toMatch(/Kind \*\*Other\*\*|Kind \*\*Other\*\*|Other/);
    expect(reply.content).toMatch(/RR/);
    expect(reply.content).toMatch(/Properties/);
    expect(reply.content).toMatch(/Vault/);
    expect(reply.content).toMatch(/dialect/i);
    expect(reply.content).toMatch(/units written/i);
    expect(reply.content).not.toMatch(/generate the PDF|LP narrative/i);
    expect(chromeHrefs(reply).some((href) => href.includes("/properties"))).toBe(true);
    expect(chromeHrefs(reply).some((href) => href.includes("/vault"))).toBe(true);
  });

  it("answers delete deal with archive restore path", () => {
    const ctx = packCtx();
    const reply = answerOffline("how do I delete a deal?", ctx, emptyBundle);
    expect(reply.content).toMatch(/\*\*Delete\*\*/);
    expect(reply.content).toMatch(/Deal Archive/);
    expect(reply.content).toMatch(/soft-archive/i);
    expect(reply.content).toMatch(/type the SPE code/i);
    expect(reply.content).toMatch(/Restore/);
    expect(chromeHrefs(reply).some((href) => href.includes("/deals"))).toBe(true);
    expect(chromeHrefs(reply).some((href) => href.includes("/archive"))).toBe(true);
  });

  it("maps vault vs deals vs properties vs narratives", () => {
    const ctx = packCtx();
    const reply = answerOffline("what's the difference between Vault and Deals and Properties?", ctx, emptyBundle);
    expect(reply.content).toMatch(/Vault/);
    expect(reply.content).toMatch(/Deals/);
    expect(reply.content).toMatch(/Properties/);
    expect(reply.content).toMatch(/Dashboard/);
    expect(reply.content).toMatch(/Narratives/);
    expect(reply.content).toMatch(/Not\*\* where you upload a T12|not where you upload a T12/i);
  });

  it("walks canonical / original workbook downloads", () => {
    const ctx = readExpertContext("/properties/SPE-HMTOS", new URLSearchParams("entity=SPE-HMTOS&period=2026-08"));
    const reply = answerOffline("how do I download the canonical XLSX?", ctx, emptyBundle);
    expect(reply.content).toMatch(/Download canonical XLSX/);
    expect(reply.content).toMatch(/Download original workbook/);
    expect(reply.content).toMatch(/Properties/);
  });

  it("tells partners they cannot upload a T12", () => {
    const ctx = { ...packCtx(), accessRole: "viewer" as const };
    const reply = answerOffline("how do I reupload the T12?", ctx, emptyBundle);
    expect(reply.content).toMatch(/partner view/i);
    expect(reply.content).toMatch(/\/unlock/);
    expect(chromeHrefs(reply).some((href) => href.includes("/deals/new"))).toBe(false);
    expect(chromeHrefs(reply).some((href) => href.includes("/vault"))).toBe(true);
  });

  it("injects the T12 playbook into the live Grok system turn even on a pack page", () => {
    const ctx = packCtx();
    const packed = buildSystemForTurn(ctx, emptyBundle, "how do I reupload the T12?");
    expect(packed).toMatch(/This turn is a how-to/i);
    expect(packed).toMatch(/Store in vault/i);
    expect(packed).toMatch(/Add Deal/);
    expect(packed).not.toMatch(/If the strip looks right, generate the PDF/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/how do I reupload the T12/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/getHowToPlaybook/);
    expect(HOW_TO_SYSTEM_SECTION).toMatch(/Kind \*\*Other\*\*/);
  });

  it("drops pack chips when ranking T12 how-to chrome", () => {
    const ctx = packCtx();
    const ranked = rankSuggestedActions(ctx, emptyBundle, "how do I reupload the T12?");
    expect(ranked.some((a) => a.href?.includes("/vault"))).toBe(true);
    expect(ranked.every((a) => !a.href?.includes("/narratives"))).toBe(true);
    const chips = rankChips(ctx, emptyBundle, "how do I reupload the T12?");
    expect(chips.every((c) => !/audience|investor pack|lp narrative/i.test(c.label))).toBe(true);
    const chrome = preferHowToChrome(ctx, emptyBundle, "how do I reupload the T12?", [
      {
        id: "bad_pack",
        kind: "navigate",
        label: "Open LP narrative",
        href: "/narratives?entity=SPE-HMTOS&period=2026-08",
      },
    ]);
    expect(chrome.actions.every((a) => !/lp narrative/i.test(a.label))).toBe(true);
    expect(chrome.actions.some((a) => a.href?.includes("/vault"))).toBe(true);
  });
});
