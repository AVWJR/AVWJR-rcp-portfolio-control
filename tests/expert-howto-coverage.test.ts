import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ALREADY_IN_ARCHIVE_SUFFIX, ALREADY_LIVE_DEAL_SUFFIX, CONFIRM_SPE_CODE_PREFIX, ONLY_SPES, TYPE_SPE_CODE, permanentDemoDeleteMessage } from "@/lib/archive";
import {
  CLOSE_ARCHIVED_POST,
  CLOSE_ARCHIVED_UPLOAD,
  CLOSE_HARD_LOCKED_UPLOAD,
  CLOSE_NOT_OWNED_SUFFIX,
  CLOSE_NOT_OVERWRITTEN,
  CLOSE_SOFT_OVERRIDE,
  DROP_AT_LEAST_ONE_FILE,
  REVERSE_REASON_REQUIRED,
  UNMAPPED_SUSPENSE,
} from "@/lib/close/workspace";
import { HARD_CLOSE_BLOCKED_PREFIX } from "@/lib/close/guards";
import {
  BROKER_T12_WILL_POST,
  DEAL_STATUS_CHOICES,
  DEAL_STATUS_NOT_ARCHIVED,
  DEAL_STATUS_REASON,
  booksLockStatusMessage,
  dealStatusArchivedMessage,
  permanentDemoStatusMessage,
} from "@/lib/deal-status";
import { EXPERT_HOWTOS, howToById, routeMatches } from "@/lib/expert/howtos";
import { PAGE_CATALOG, listPageCatalogPatterns } from "@/lib/expert/nav";
import {
  ALREADY_REVERSED,
  AMOUNT_WHOLE_CENTS,
  CONCURRENT_POST,
  DISTRIBUTION_ARCHIVED,
  DISTRIBUTION_DATE,
  DISTRIBUTION_NOT_OWNED_SUFFIX,
  DISTRIBUTION_PERIOD,
  DISTRIBUTION_SOURCE,
  POSTED_DISTRIBUTION_DELETE,
  POSTED_DISTRIBUTION_EDIT,
  PREVIEW_BEFORE_CONFIRM,
  REVERSE_LATEST_FIRST,
  REVERSING_ROW_LOCKED,
  distributionBeforeLatestMessage,
} from "@/lib/distribution-ledger";
import {
  CANNOT_POST_LOCKED,
  CHECKLIST_EVERY_ITEM,
  CHECKLIST_REQUIRED,
  HARD_LOCK_REQUIRES_SOFT,
  PERIOD_ALREADY_OPEN,
  PERIOD_SOFT_CLOSED,
  REOPEN_REASON_AND_TICKET,
  SOFT_CLOSE_FROM_OPEN,
  SUSPENSE_1999_ZERO,
} from "@rcp/ledger";
import { nonOwnedCloseMessage } from "@/lib/period-close";
import { PICK_WATERFALL_TEMPLATE, WATERFALL_PER_SPE } from "@/lib/waterfall";
import { describe, expect, it } from "vitest";

/**
 * Future authors: when you add a user-facing 400/409 guard, add the exact text to
 * tests/fixtures/expert-guard-messages.json and to a how-to troubleshooting symptom.
 */

const ROOT = process.cwd();

const HOWTO_EXEMPT_ROUTES: Record<string, string> = {};

const HOWTO_EXEMPT_API: Record<string, string> = {
  "/api/expert/chat": "Expert chat is the coach itself, not a product how-to.",
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

function pageRoute(file: string): string {
  const rel = toPosix(path.relative(path.join(ROOT, "src/app"), file)).replace(/(^|\/)page\.tsx$/, "");
  const cleaned = rel.replace(/\/\([^/]+\)/g, "").replace(/^\([^/]+\)\/?/, "");
  return cleaned ? `/${cleaned}` : "/";
}

function apiRoute(file: string): string {
  const rel = toPosix(path.relative(path.join(ROOT, "src/app"), file)).replace(/\/route\.ts$/, "");
  return `/${rel}`;
}

function coveredByHowTo(route: string, field: "routes" | "apiRoutes"): boolean {
  return EXPERT_HOWTOS.some((entry) => (entry[field] ?? []).some((pattern) => pattern === route || routeMatches(pattern, route)));
}

function refFile(ref: string): string {
  const match = ref.match(/^(.*):\d/);
  return match?.[1] ?? ref;
}

describe("Expert how-to coverage", () => {
  it("covers every page or records an exemption reason", () => {
    const pages = walk(path.join(ROOT, "src/app")).filter((file) => file.endsWith(`${path.sep}page.tsx`) || file.endsWith("/page.tsx"));
    const missing = pages
      .map(pageRoute)
      .filter((route) => !coveredByHowTo(route, "routes") && !HOWTO_EXEMPT_ROUTES[route]);
    expect(missing, `Uncovered pages: ${missing.join(", ")}`).toEqual([]);
    for (const [route, reason] of Object.entries(HOWTO_EXEMPT_ROUTES)) {
      expect(reason.trim().length, route).toBeGreaterThan(0);
    }
  });

  it("covers every mutating API or records an exemption reason", () => {
    const routes = walk(path.join(ROOT, "src/app/api")).filter((file) => file.endsWith(`${path.sep}route.ts`) || file.endsWith("/route.ts"));
    const missing: string[] = [];
    for (const file of routes) {
      const source = readFileSync(file, "utf8");
      const mutates = /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b/.test(source) || /export\s+const\s+(?:POST|PUT|PATCH|DELETE)\b/.test(source);
      if (!mutates) continue;
      const route = apiRoute(file);
      if (!coveredByHowTo(route, "apiRoutes") && !HOWTO_EXEMPT_API[route]) missing.push(route);
    }
    expect(missing, `Uncovered APIs: ${missing.join(", ")}`).toEqual([]);
    for (const [route, reason] of Object.entries(HOWTO_EXEMPT_API)) {
      expect(reason.trim().length, route).toBeGreaterThan(0);
    }
  });

  it("gives each Models screen its own how-to", () => {
    expect(howToById("models.list")?.routes).toContain("/models");
    expect(howToById("models.detail")?.routes).toContain("/models/[id]");
    expect(howToById("models.compare")?.routes).toContain("/models/compare");
    expect(howToById("models.assumptions")?.routes).toContain("/models/[id]/assumptions");
    expect(howToById("models.fees")?.routes).toContain("/models/fees");
    const screens = ["/models", "/models/compare", "/models/fees", "/models/[id]", "/models/[id]/assumptions"];
    for (const route of screens) {
      const owners = EXPERT_HOWTOS.filter((entry) => entry.routes.includes(route));
      expect(owners, route).toHaveLength(1);
    }
  });

  it("covers every PAGE_CATALOG pattern", () => {
    expect(listPageCatalogPatterns()).toEqual(PAGE_CATALOG.map((row) => row.pattern));
    const missing = listPageCatalogPatterns().filter((pattern) => !coveredByHowTo(pattern, "routes"));
    expect(missing, `Uncovered catalog patterns: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives every how-to steps, facts, troubleshooting, a real source file, and a unique id", () => {
    const ids = new Set<string>();
    for (const entry of EXPERT_HOWTOS) {
      expect(ids.has(entry.id), entry.id).toBe(false);
      ids.add(entry.id);
      expect(entry.steps.length, entry.id).toBeGreaterThan(0);
      expect(entry.facts.length, entry.id).toBeGreaterThan(0);
      expect(entry.troubleshooting.length, entry.id).toBeGreaterThan(0);
      expect(entry.sourceRefs.length, entry.id).toBeGreaterThan(0);
      for (const ref of entry.sourceRefs) {
        const file = path.join(ROOT, refFile(ref));
        expect(statSync(file).isFile(), ref).toBe(true);
      }
    }
  });

  it("keeps guard messages in how-to symptoms", () => {
    const fixture = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/expert-guard-messages.json"), "utf8")) as {
      messages: string[];
    };
    const symptoms = EXPERT_HOWTOS.flatMap((entry) => entry.troubleshooting.map((row) => row.symptom.toLowerCase()));
    for (const message of fixture.messages) {
      expect(
        symptoms.some((symptom) => symptom.includes(message.toLowerCase())),
        message,
      ).toBe(true);
    }
    const exported = [
      POSTED_DISTRIBUTION_EDIT,
      POSTED_DISTRIBUTION_DELETE,
      CONCURRENT_POST,
      AMOUNT_WHOLE_CENTS,
      PREVIEW_BEFORE_CONFIRM,
      distributionBeforeLatestMessage("2026-08"),
      DISTRIBUTION_ARCHIVED,
      DISTRIBUTION_NOT_OWNED_SUFFIX,
      REVERSING_ROW_LOCKED,
      ALREADY_REVERSED,
      REVERSE_LATEST_FIRST,
      DISTRIBUTION_SOURCE,
      DISTRIBUTION_PERIOD,
      DISTRIBUTION_DATE,
      DEAL_STATUS_CHOICES,
      DEAL_STATUS_NOT_ARCHIVED,
      DEAL_STATUS_REASON,
      dealStatusArchivedMessage("SPE-X"),
      permanentDemoStatusMessage("SPE-WBG"),
      permanentDemoDeleteMessage("SPE-WBG"),
      booksLockStatusMessage("SPE-X"),
      BROKER_T12_WILL_POST,
      TYPE_SPE_CODE,
      CONFIRM_SPE_CODE_PREFIX,
      ALREADY_IN_ARCHIVE_SUFFIX,
      ALREADY_LIVE_DEAL_SUFFIX,
      ONLY_SPES,
      HARD_CLOSE_BLOCKED_PREFIX,
      CLOSE_SOFT_OVERRIDE,
      CLOSE_NOT_OWNED_SUFFIX,
      nonOwnedCloseMessage("SPE-X", "PIPELINE"),
      UNMAPPED_SUSPENSE,
      SUSPENSE_1999_ZERO,
      HARD_LOCK_REQUIRES_SOFT,
      CHECKLIST_REQUIRED,
      CHECKLIST_EVERY_ITEM,
      REOPEN_REASON_AND_TICKET,
      CLOSE_NOT_OVERWRITTEN,
      CLOSE_HARD_LOCKED_UPLOAD,
      CANNOT_POST_LOCKED,
      PERIOD_SOFT_CLOSED,
      SOFT_CLOSE_FROM_OPEN,
      PERIOD_ALREADY_OPEN,
      REVERSE_REASON_REQUIRED,
      CLOSE_ARCHIVED_POST,
      CLOSE_ARCHIVED_UPLOAD,
      DROP_AT_LEAST_ONE_FILE,
      PICK_WATERFALL_TEMPLATE,
      WATERFALL_PER_SPE,
    ];
    for (const message of exported) {
      const linked = fixture.messages.some(
        (row) => message.toLowerCase().includes(row.toLowerCase()) || row.toLowerCase().includes(message.toLowerCase()),
      );
      expect(linked, message).toBe(true);
    }
  });

  it("rejects the stale roll-up and naming phrases", () => {
    const files = [
      "src/lib/expert/system-prompt.ts",
      "src/lib/expert/nav.ts",
      "src/lib/expert/offline-coach.ts",
      "src/lib/expert/howtos.ts",
    ];
    const banned = /every live SPE|each live SPE|Live SPE list|not posted to the GL|Canyon View/i;
    for (const file of files) {
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).not.toMatch(banned);
    }
  });
});
