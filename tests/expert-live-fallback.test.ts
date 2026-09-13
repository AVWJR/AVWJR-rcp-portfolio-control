import { streamExpertChat, runExpertChat } from "@/lib/expert/chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  streamText: () => {
    throw new Error("unknown model spacexai/grok-4.6");
  },
  tool: (def: unknown) => def,
  stepCountIs: () => 6,
  gateway: (id: string) => id,
}));

vi.mock("@/lib/expert/tools", () => {
  const skip = { ok: false as const, error: "skip" };
  const bundle = {
    entity: skip,
    period: skip,
    completeness: skip,
    anomalies: skip,
    kpis: skip,
  };
  return {
    runExpertTools: async () => bundle,
    getAnomalies: async () => skip,
    getDataCompleteness: async () => skip,
    getDealIntakeStatus: async () => skip,
    getEntitySummary: async () => skip,
    getKpiSnapshot: async () => skip,
    getPeriodStatus: async () => skip,
    listNavTargets: async () => [],
  };
});

describe("expert live Gateway fallback is visible", () => {
  const previous: Record<string, string | undefined> = {};
  const keys = [
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
    "XAI_API_KEY",
    "GROK_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "EXPERT_MODEL",
  ];

  beforeEach(() => {
    for (const key of keys) {
      previous[key] = process.env[key];
      delete process.env[key];
    }
    process.env.AI_GATEWAY_API_KEY = "gw_test_invalid";
    process.env.EXPERT_MODEL = "spacexai/grok-4.6";
  });

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it("returns offline coach plus fallbackReason when Gateway throws", async () => {
    const result = await runExpertChat({
      messages: [{ role: "user", content: "What does NOI mean on this OpCo card?" }],
      context: { pathname: "/", entityCode: "RCP-OPCO", periodLabel: "2026-08" },
    });
    expect(result.aiEnabled).toBe(true);
    expect(result.banner).toBe("grok");
    expect(result.mode).toBe("offline");
    expect(result.modelId).toBe("spacexai/grok-4.6");
    expect(result.fallbackReason).toMatch(/Live Grok \(spacexai\/grok-4\.6\) failed/);
    expect(result.fallbackReason).toMatch(/offline coach/i);
    expect(result.message.sources?.join(" ")).toMatch(/offline coach/i);
  });

  it("streams an error event before the offline last-resort reply", async () => {
    const events: { type: string; message?: string; response?: { fallbackReason?: string; mode?: string } }[] = [];
    for await (const event of streamExpertChat({
      messages: [{ role: "user", content: "What is missing?" }],
      context: { pathname: "/", entityCode: "RCP-OPCO", periodLabel: "2026-08" },
      stream: true,
    })) {
      events.push(event);
    }
    expect(events.some((event) => event.type === "error" && event.message?.includes("Live Grok"))).toBe(true);
    const done = events.find((event) => event.type === "done");
    expect(done?.response?.mode).toBe("offline");
    expect(done?.response?.fallbackReason).toMatch(/Live Grok/);
  });
});
