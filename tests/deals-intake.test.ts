import { isValidSpeCode, normalizeSpeCode, suggestSpeCode } from "@/lib/deals/codes";
import { classificationToVaultKind, guessClassification } from "@/lib/deals/files";
import { dollarsToCents, multipleToDscrBps, percentToRateBps } from "@/lib/deals/money";
import { listProviderStatus } from "@/lib/deals/providers";
import { answerOffline } from "@/lib/expert/offline-coach";
import { listNavTargets, readExpertContext } from "@/lib/expert/nav";
import { EXPERT_SYSTEM_PROMPT } from "@/lib/expert/system-prompt";
import { isVaultKind } from "@rcp/documents";
import { describe, expect, it } from "vitest";

const emptyBundle = {
  entity: { ok: false as const, error: "skip" },
  period: { ok: false as const, error: "skip" },
  completeness: { ok: false as const, error: "skip" },
  anomalies: { ok: false as const, error: "skip" },
  kpis: { ok: false as const, error: "skip" },
};

describe("SPE codes", () => {
  it("suggests SPE-XXX from a legal name and avoids collisions", () => {
    expect(suggestSpeCode("Riverside Terrace LLC")).toBe("SPE-RT");
    expect(suggestSpeCode("Harbor Court Residences LLC", ["SPE-HCR"])).toMatch(/^SPE-/);
    expect(suggestSpeCode("Riverside Terrace LLC", ["SPE-RT"])).toBe("SPE-RT2");
    expect(isValidSpeCode("SPE-WBG")).toBe(true);
    expect(isValidSpeCode("wbg")).toBe(false);
    expect(normalizeSpeCode(" spe-abc ")).toBe("SPE-ABC");
  });
});

describe("deal money helpers", () => {
  it("stores integer cents and loan-file bps", () => {
    expect(dollarsToCents("18,500,000.00")).toBe(1_850_000_000n);
    expect(percentToRateBps("5.68")).toBe(568);
    expect(multipleToDscrBps("1.25")).toBe(12_500);
  });
});

describe("intake file classification", () => {
  it("maps classify chips onto vault kinds", () => {
    expect(classificationToVaultKind("rent_roll_csv")).toBe("rent_roll");
    expect(classificationToVaultKind("budget_csv")).toBe("budget");
    expect(classificationToVaultKind("loan_doc")).toBe("loan");
    expect(classificationToVaultKind("om_cim")).toBe("om_cim");
    expect(isVaultKind("rent_roll")).toBe(true);
    expect(isVaultKind("om_cim")).toBe(true);
    expect(guessClassification("willow-rent-roll.csv")).toBe("rent_roll_csv");
    expect(guessClassification("willow-rent-roll.xlsx")).toBe("rent_roll_csv");
    expect(guessClassification("2026-08-budget.csv")).toBe("budget_csv");
    expect(guessClassification("2026-08-budget.xls")).toBe("budget_csv");
  });
});

describe("file providers", () => {
  it("keeps upload live and remote providers honest without secrets", () => {
    const status = listProviderStatus();
    expect(status.find((p) => p.id === "upload")?.configured).toBe(true);
    expect(status.find((p) => p.id === "dropbox")?.configured).toBe(Boolean(process.env.DROPBOX_ACCESS_TOKEN));
    expect(status.find((p) => p.id === "rcp_mailbox")?.message).toMatch(/not decided|connector/i);
  });
});

describe("expert Add Deal knowledge", () => {
  it("lists /deals and /deals/new nav targets", () => {
    const ids = listNavTargets().map((t) => t.id);
    expect(ids).toContain("deals");
    expect(ids).toContain("add_deal");
    expect(listNavTargets().find((t) => t.id === "add_deal")?.href).toBe("/deals/new");
  });

  it("opens Add Deal chips on overview and /deals", () => {
    const overview = readExpertContext("/", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    expect(overview.pageTitle).toBe("Overview");
    const opener = answerOffline("open", overview, emptyBundle);
    expect(opener.chips?.map((c) => c.id)).toEqual(["add_deal", "whats_missing_spe", "import_rent_roll"]);

    const deals = readExpertContext("/deals", new URLSearchParams());
    expect(deals.pageTitle).toBe("Deals");
    const dealOpener = answerOffline("", deals, emptyBundle);
    expect(dealOpener.chips?.some((c) => c.id === "add_deal")).toBe(true);
  });

  it("coaches the Add Deal click path without CLI", () => {
    const ctx = readExpertContext("/deals/new", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    expect(ctx.pageTitle).toBe("Add Deal");
    const reply = answerOffline("Add a new deal", ctx, emptyBundle);
    expect(reply.content).toMatch(/Add Deal/);
    expect(reply.content).toMatch(/\/deals\/new/);
    expect(reply.content).toMatch(/confirm replace/i);
    expect(reply.content).toMatch(/not decided/);
    expect(reply.content).not.toMatch(/npm |npx |\bCLI\b/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/Add Deal/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/\/deals\/new/);
  });
});
