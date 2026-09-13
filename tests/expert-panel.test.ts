import { formatContextChip, parsePeriodLabel } from "@/lib/expert/period";
import { nextPanelState, panelIsExpanded } from "@/lib/expert/panel-state";
import { parseInline, parseMarkdownLite } from "@/lib/expert/markdown-lite";
import { readExpertContext, withContext } from "@/lib/expert/nav";
import { describe, expect, it } from "vitest";

describe("expert panel state", () => {
  it("opens and closes", () => {
    expect(nextPanelState("closed", "open")).toBe("open");
    expect(nextPanelState("open", "close")).toBe("closed");
    expect(nextPanelState("open", "toggle")).toBe("closed");
    expect(nextPanelState("closed", "toggle")).toBe("open");
    expect(nextPanelState("open", "minimize")).toBe("minimized");
    expect(nextPanelState("minimized", "toggle")).toBe("open");
    expect(panelIsExpanded("open")).toBe(true);
    expect(panelIsExpanded("closed")).toBe(false);
  });

  it("formats the context chip as entity · period", () => {
    expect(formatContextChip("SPE-WBG", "2026-08")).toBe("SPE-WBG · 2026-08");
    expect(parsePeriodLabel("2026-08")).toEqual({ year: 2026, month: 8 });
    expect(parsePeriodLabel("nope")).toBeNull();
  });
});

describe("expert context from the URL", () => {
  it("reads entity and period from search params and path", () => {
    const fromQuery = readExpertContext("/debt", new URLSearchParams("entity=SPE-WBG&period=2026-08"));
    expect(fromQuery.entityCode).toBe("SPE-WBG");
    expect(fromQuery.periodLabel).toBe("2026-08");
    expect(fromQuery.pageTitle).toBe("Debt");

    const fromPath = readExpertContext("/dashboard/SPE-WBG", new URLSearchParams());
    expect(fromPath.entityCode).toBe("SPE-WBG");
    expect(fromPath.periodLabel).toBe("2026-08");
  });

  it("keeps in-app deep links with entity and period", () => {
    expect(withContext("/narratives", "SPE-WBG", "2026-08")).toBe(
      "/narratives?entity=SPE-WBG&period=2026-08",
    );
  });
});

describe("expert markdown-lite", () => {
  it("parses bold, lists, and in-app links only", () => {
    const blocks = parseMarkdownLite("See **NOI** on [OS](/reports/operating-statement?entity=SPE-WBG&period=2026-08)");
    expect(blocks[0].type).toBe("p");
    const inline = parseInline("bad [x](https://evil.example) and [ok](/vault)");
    expect(inline.some((p) => p.type === "link" && p.href === "/vault")).toBe(true);
    expect(inline.some((p) => p.type === "link" && p.href.startsWith("http"))).toBe(false);
  });
});
