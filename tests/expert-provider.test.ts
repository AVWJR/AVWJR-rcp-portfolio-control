import { POST } from "@/app/api/expert/chat/route";
import { mergeSuggestedActions, rankSuggestedActions, sanitizeSuggestedActions } from "@/lib/expert/actions";
import {
  DEFAULT_GROK_DIRECT_MODEL,
  DEFAULT_GROK_GATEWAY_MODEL,
  expertAiEnabled,
  expertBannerCopy,
  expertModelId,
  gatewayModelCandidates,
  liveFallbackReason,
  publicErrorMessage,
  resolveExpertProvider,
  toDirectXaiModelId,
  toGatewayModelId,
} from "@/lib/expert/ai-enabled";
import { runExpertChat, validateChatBody } from "@/lib/expert/chat";
import { readExpertContext } from "@/lib/expert/nav";
import { answerOffline, buildOpener, type OfflineBundle } from "@/lib/expert/offline-coach";
import { parseExpertStreamLine } from "@/lib/expert/stream";
import { EXPERT_SYSTEM_PROMPT } from "@/lib/expert/system-prompt";
import { describe, expect, it } from "vitest";

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

function bareEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    AI_GATEWAY_API_KEY: "",
    VERCEL_OIDC_TOKEN: "",
    XAI_API_KEY: "",
    GROK_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    EXPERT_MODEL: "",
    ...extra,
  };
}

describe("expert model provider selection", () => {
  it("uses direct xAI grok-4.6 when XAI_API_KEY is present", () => {
    const resolved = resolveExpertProvider(bareEnv({ XAI_API_KEY: "xai_test" }));
    expect(resolved.provider).toBe("xai");
    expect(resolved.modelId).toBe(DEFAULT_GROK_DIRECT_MODEL);
    expect(resolved.modelId).toBe("grok-4.6");
    expect(resolved.banner).toBe("grok");
    expect(expertAiEnabled(bareEnv({ XAI_API_KEY: "xai_test" }))).toBe(true);
    expect(expertModelId(bareEnv({ XAI_API_KEY: "xai_test" }))).toBe("grok-4.6");
  });

  it("accepts GROK_API_KEY as an xAI alias and maps Gateway slugs", () => {
    const resolved = resolveExpertProvider(
      bareEnv({ GROK_API_KEY: "grok_test", EXPERT_MODEL: "xai/grok-4.5" }),
    );
    expect(resolved.provider).toBe("xai");
    expect(resolved.modelId).toBe("grok-4.5");
    expect(toDirectXaiModelId("xai/grok-3-mini")).toBe("grok-3-mini");
    expect(toDirectXaiModelId("spacexai/grok-4.6")).toBe("grok-4.6");
    expect(toGatewayModelId("xai/grok-4.6")).toBe("spacexai/grok-4.6");
    expect(toGatewayModelId("grok-4.6")).toBe("spacexai/grok-4.6");
    expect(toGatewayModelId("spacexai/grok-4.6")).toBe("spacexai/grok-4.6");
    expect(toGatewayModelId("openai/gpt-5.4")).toBe("openai/gpt-5.4");
    expect(gatewayModelCandidates("xai/grok-4.6")).toEqual(["spacexai/grok-4.6", "xai/grok-4.6"]);
  });

  it("honors EXPERT_MODEL on the direct xAI path", () => {
    const resolved = resolveExpertProvider(bareEnv({ XAI_API_KEY: "xai_test", EXPERT_MODEL: "grok-4.6" }));
    expect(resolved.provider).toBe("xai");
    expect(resolved.modelId).toBe("grok-4.6");
  });

  it("uses Gateway spacexai/grok-4.6 when AI_GATEWAY_API_KEY is present", () => {
    const resolved = resolveExpertProvider(bareEnv({ AI_GATEWAY_API_KEY: "gw_test" }));
    expect(resolved.provider).toBe("gateway");
    expect(resolved.modelId).toBe(DEFAULT_GROK_GATEWAY_MODEL);
    expect(resolved.modelId).toBe("spacexai/grok-4.6");
    expect(resolved.banner).toBe("grok");
    expect(expertAiEnabled(bareEnv({ AI_GATEWAY_API_KEY: "gw_test" }))).toBe(true);
    expect(expertModelId(bareEnv({ AI_GATEWAY_API_KEY: "gw_test" }))).toBe("spacexai/grok-4.6");
  });

  it("does not treat VERCEL_OIDC_TOKEN alone as live Grok", () => {
    const resolved = resolveExpertProvider(bareEnv({ VERCEL_OIDC_TOKEN: "oidc_jwt" }));
    expect(resolved.provider).toBe("none");
    expect(resolved.banner).toBe("offline");
    expect(expertAiEnabled(bareEnv({ VERCEL_OIDC_TOKEN: "oidc_jwt" }))).toBe(false);
  });

  it("is offline when no server key is present", () => {
    const resolved = resolveExpertProvider(bareEnv());
    expect(resolved.provider).toBe("none");
    expect(resolved.banner).toBe("offline");
    expect(resolved.modelId).toBe("spacexai/grok-4.6");
    expect(expertAiEnabled(bareEnv())).toBe(false);
    expect(expertBannerCopy("grok")).toBe("Grok connected");
    expect(expertBannerCopy("live")).toBe("Grok connected");
    expect(expertBannerCopy("offline")).toBe("Offline coach — add key");
  });

  it("prefers Gateway over a direct xAI key", () => {
    const resolved = resolveExpertProvider(
      bareEnv({ AI_GATEWAY_API_KEY: "gw", XAI_API_KEY: "xai" }),
    );
    expect(resolved.provider).toBe("gateway");
    expect(resolved.modelId).toBe("spacexai/grok-4.6");
  });

  it("honors an explicit Gateway EXPERT_MODEL", () => {
    const resolved = resolveExpertProvider(
      bareEnv({ AI_GATEWAY_API_KEY: "gw", EXPERT_MODEL: "spacexai/grok-4.6" }),
    );
    expect(resolved.provider).toBe("gateway");
    expect(resolved.modelId).toBe("spacexai/grok-4.6");
  });

  it("rewrites a docs-era xai/ Gateway slug to the current catalog id", () => {
    const resolved = resolveExpertProvider(
      bareEnv({ AI_GATEWAY_API_KEY: "gw", EXPERT_MODEL: "xai/grok-4.6" }),
    );
    expect(resolved.provider).toBe("gateway");
    expect(resolved.modelId).toBe(DEFAULT_GROK_GATEWAY_MODEL);
    expect(resolved.modelId).toBe("spacexai/grok-4.6");
  });
});

describe("expert live fallback copy", () => {
  it("redacts secrets and maps Gateway failures to one line", () => {
    expect(publicErrorMessage(new Error("AI_GATEWAY_API_KEY=sk-secret"))).toMatch(/could not read live books/i);
    expect(publicErrorMessage(new Error("404 model not found"))).toMatch(/EXPERT_MODEL=spacexai\/grok-4\.6/);
    expect(publicErrorMessage(new Error("401 Unauthorized"))).toMatch(/rejected the key/i);
    expect(publicErrorMessage(new Error("No output generated. Check the stream for errors."))).toMatch(
      /Gateway returned no text/,
    );
    expect(expertBannerCopy("grok", { degraded: true })).toMatch(/Live Grok failed/i);
    const reason = liveFallbackReason(new Error("unknown model spacexai/nope"), "spacexai/nope");
    expect(reason).toMatch(/Live Grok \(spacexai\/nope\) failed/);
    expect(reason).toMatch(/offline coach/i);
  });
});

describe("expert offline fallback", () => {
  it("answers from the offline coach without a model key", () => {
    const ctx = readExpertContext("/dashboard/SPE-WBG", new URLSearchParams("entity=SPE-WBG&period=2026-08"));
    const reply = answerOffline("What's missing for this SPE?", ctx, emptyBundle);
    expect(reply.role).toBe("expert");
    expect(reply.content).toMatch(/completeness|cannot score/i);
    expect(reply.chips?.length).toBeGreaterThan(0);
    expect(reply.actions?.length).toBeGreaterThan(0);
  });

  it("builds an opener with ranked chips and suggested actions", () => {
    const ctx = readExpertContext("/", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const opener = buildOpener(ctx, emptyBundle);
    expect(opener.chips?.map((c) => c.id)).toEqual(["add_deal", "whats_missing_spe", "import_rent_roll"]);
    expect(opener.actions?.some((a) => a.kind === "navigate" && a.href?.includes("/deals/new"))).toBe(true);
  });

  it("stays offline in runExpertChat when keys are unset (mocked provider)", async () => {
    const previous = {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
      XAI_API_KEY: process.env.XAI_API_KEY,
      GROK_API_KEY: process.env.GROK_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.XAI_API_KEY;
    delete process.env.GROK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(expertAiEnabled()).toBe(false);
      try {
        const result = await runExpertChat({
          intent: "open",
          context: { pathname: "/", entityCode: "RCP-OPCO", periodLabel: "2026-08" },
        });
        expect(result.mode).toBe("offline");
        expect(result.aiEnabled).toBe(false);
        expect(result.banner).toBe("offline");
        expect(result.message.content.length).toBeGreaterThan(20);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/Prisma|datasource|SQLITE|P100|database|Unable to (open|connect)/i.test(message)) {
          throw error;
        }
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("expert suggested actions + stream parse", () => {
  it("sanitizes and merges action objects", () => {
    const cleaned = sanitizeSuggestedActions([
      { kind: "navigate", label: "Open debt", href: "/debt?entity=SPE-WBG&period=2026-08" },
      { kind: "navigate", label: "bad", href: "https://evil.example" },
      { kind: "confirm_mutation", label: "Re-apply", mutation: "Replace Unit rows" },
    ]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].kind).toBe("navigate");
    const merged = mergeSuggestedActions(cleaned, rankSuggestedActions(
      readExpertContext("/narratives", new URLSearchParams("entity=SPE-WBG&period=2026-08")),
      emptyBundle,
    ));
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.length).toBeLessThanOrEqual(3);
  });

  it("parses NDJSON stream lines", () => {
    expect(parseExpertStreamLine("")).toBeNull();
    const start = parseExpertStreamLine(
      JSON.stringify({
        type: "start",
        aiEnabled: true,
        provider: "gateway",
        modelId: "grok-4.6",
        banner: "grok",
        mode: "ai",
      }),
    );
    expect(start?.type).toBe("start");
    if (start?.type === "start") expect(start.modelId).toBe("grok-4.6");
    const err = parseExpertStreamLine(JSON.stringify({ type: "error", message: "Live Grok failed — using offline coach." }));
    expect(err?.type).toBe("error");
    if (err?.type === "error") expect(err.message).toMatch(/offline coach/i);
  });
});

describe("expert chat API validation (still 400 on bad body)", () => {
  it("rejects a missing JSON body", () => {
    expect(validateChatBody(null).ok).toBe(false);
    expect(validateChatBody("nope").ok).toBe(false);
  });

  it("returns 400 when the POST body is not JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/JSON/i);
  });

  it("returns 400 when messages is not an array", async () => {
    const res = await POST(
      new Request("http://localhost/api/expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: { role: "user" }, context: { entityCode: "SPE-WBG" } }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/messages/i);
  });
});

describe("expert system prompt mastery", () => {
  it("locks Grok coach rules and the CRE audience matrix", () => {
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/spacexai\/grok-4\.6/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/grok-4\.6/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/api\.x\.ai/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/read-only/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/LP/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/Lender/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/redIQ/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/Harrington|SPE-HRP/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/does \*\*not\*\* file taxes/);
  });
});
