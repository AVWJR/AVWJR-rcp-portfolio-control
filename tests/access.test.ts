import {
  accessControlEnabled,
  defaultRoleWhenGated,
  isViewerBlockedPath,
  partnerSharePath,
  readAccessRole,
  secretsMatch,
  signAccessRole,
  viewerForbiddenApi,
} from "@/lib/access";
import { describe, expect, it } from "vitest";

describe("partner viewer access", () => {
  const env = {
    PARTNER_VIEW_TOKEN: "partner-share-token-demo",
    PRINCIPAL_PASSWORD: "principal-unlock-demo",
  } as NodeJS.ProcessEnv;

  it("is off unless a share token or principal password is configured", () => {
    expect(accessControlEnabled({})).toBe(false);
    expect(accessControlEnabled({ PARTNER_VIEW_TOKEN: "short" } as NodeJS.ProcessEnv)).toBe(false);
    expect(accessControlEnabled(env)).toBe(true);
    expect(defaultRoleWhenGated()).toBe("viewer");
  });

  it("signs and verifies role cookies", () => {
    const cookie = signAccessRole("viewer", env);
    expect(readAccessRole(cookie, env)).toBe("viewer");
    expect(readAccessRole(signAccessRole("principal", env), env)).toBe("principal");
    expect(readAccessRole(cookie, { PARTNER_VIEW_TOKEN: "other-token-xx" } as NodeJS.ProcessEnv)).toBeNull();
    expect(secretsMatch("partner-share-token-demo", env.PARTNER_VIEW_TOKEN!)).toBe(true);
    expect(secretsMatch("nope", env.PARTNER_VIEW_TOKEN!)).toBe(false);
  });

  it("blocks Add Deal and seed paths and mutating APIs for viewers", () => {
    expect(isViewerBlockedPath("/deals/new")).toBe(true);
    expect(isViewerBlockedPath("/admin/seed")).toBe(true);
    expect(isViewerBlockedPath("/archive")).toBe(true);
    expect(isViewerBlockedPath("/dashboard/SPE-WBG")).toBe(false);
    expect(isViewerBlockedPath("/narratives")).toBe(false);
    expect(viewerForbiddenApi("/api/deals/SPE-WBG/archive", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/archive", "GET")).toBe(true);
    expect(viewerForbiddenApi("/api/archive/SPE-WBG/restore", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/deals/intake/files", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/deals/intake/blob", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/deals/intake/import", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/deals/intake", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/admin/seed", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/vault", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/vault/blob", "POST")).toBe(true);
    expect(viewerForbiddenApi("/api/expert/chat", "POST")).toBe(false);
    expect(viewerForbiddenApi("/api/access", "POST")).toBe(false);
    expect(viewerForbiddenApi("/api/narratives", "GET")).toBe(false);
    expect(partnerSharePath("https://demo.example", "abc123token")).toContain("share=abc123token");
  });
});
