import {
  accessControlEnabled,
  defaultRoleWhenGated,
  isViewerBlockedPath,
  readAccessRole,
  secretsMatch,
  signAccessRole,
  viewerForbiddenApi,
} from "@/lib/access";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

describe("partner viewer access", () => {
  const env = {
    PARTNER_VIEW_TOKEN: "partner-share-token-demo",
    PRINCIPAL_PASSWORD: "principal-unlock-demo",
  };

  it("is off unless a share token or principal password is configured", () => {
    expect(accessControlEnabled({})).toBe(false);
    expect(accessControlEnabled({ PARTNER_VIEW_TOKEN: "short" })).toBe(false);
    expect(accessControlEnabled({ PARTNER_VIEW_TOKEN: undefined, PRINCIPAL_PASSWORD: undefined })).toBe(false);
    expect(accessControlEnabled(env)).toBe(true);
    expect(defaultRoleWhenGated()).toBe("viewer");
  });

  it("signs and verifies role cookies", () => {
    const cookie = signAccessRole("viewer", env);
    expect(readAccessRole(cookie, env)).toBe("viewer");
    expect(readAccessRole(signAccessRole("principal", env), env)).toBe("principal");
    expect(readAccessRole(cookie, { PARTNER_VIEW_TOKEN: "other-token-xx" })).toBeNull();
    expect(secretsMatch("partner-share-token-demo", env.PARTNER_VIEW_TOKEN!)).toBe(true);
    expect(secretsMatch("nope", env.PARTNER_VIEW_TOKEN!)).toBe(false);
  });

  it("blocks Add Deal and seed paths and mutating APIs for viewers", () => {
    expect(isViewerBlockedPath("/deals/new")).toBe(true);
    expect(isViewerBlockedPath("/admin/seed")).toBe(true);
    expect(isViewerBlockedPath("/dashboard/SPE-WBG")).toBe(false);
    expect(viewerForbiddenApi("/api/deals/intake/files", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/expert/chat", "POST")).toBe(false);
    expect(viewerForbiddenApi("/api/access", "POST")).toBe(false);
    expect(viewerForbiddenApi("/api/narratives", "GET")).toBe(false);
  });
});

describe("partner-gate middleware", () => {
  it("is a no-op (does not 500) when PARTNER_VIEW_TOKEN is unset", () => {
    const previousPartner = process.env.PARTNER_VIEW_TOKEN;
    const previousPrincipal = process.env.PRINCIPAL_PASSWORD;
    delete process.env.PARTNER_VIEW_TOKEN;
    delete process.env.PRINCIPAL_PASSWORD;
    try {
      const res = middleware(new NextRequest("http://localhost/dashboard/SPE-WBG?period=2026-08"));
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("x-rcp-role")).toBeNull();
    } finally {
      if (previousPartner === undefined) delete process.env.PARTNER_VIEW_TOKEN;
      else process.env.PARTNER_VIEW_TOKEN = previousPartner;
      if (previousPrincipal === undefined) delete process.env.PRINCIPAL_PASSWORD;
      else process.env.PRINCIPAL_PASSWORD = previousPrincipal;
    }
  });
});
