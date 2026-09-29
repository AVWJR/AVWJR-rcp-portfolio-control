import { GET as accessGet } from "@/app/api/access/route";
import { GET as seedGet } from "@/app/api/admin/seed/route";
import { POST as adminUsersPost } from "@/app/api/admin/users/route";
import { GET as archiveGet } from "@/app/api/archive/route";
import { GET as budgetsGet } from "@/app/api/budgets/route";
import { GET as capexGet } from "@/app/api/capex/route";
import { GET as auditGet } from "@/app/api/close/audit/route";
import { GET as closeGet } from "@/app/api/close/route";
import { GET as dashboardGet } from "@/app/api/dashboard/route";
import { GET as waterfallGet } from "@/app/api/deals/[code]/waterfall/route";
import { GET as dealsGet } from "@/app/api/deals/route";
import { GET as dropboxGet } from "@/app/api/deals/intake/from-dropbox/route";
import { GET as emailGet } from "@/app/api/deals/intake/from-email/route";
import { GET as intakeGet } from "@/app/api/deals/intake/route";
import { GET as mailboxGet } from "@/app/api/deals/intake/scan-mailbox/route";
import { GET as providersGet } from "@/app/api/deals/providers/route";
import { GET as debtGet } from "@/app/api/debt/route";
import { GET as entitiesGet } from "@/app/api/entities/route";
import { POST as expertChatPost } from "@/app/api/expert/chat/route";
import { GET as expertContextGet } from "@/app/api/expert/context/route";
import { GET as narrativesGet } from "@/app/api/narratives/route";
import { GET as packGet } from "@/app/api/packs/[packId]/route";
import { GET as packsGet } from "@/app/api/packs/route";
import { GET as ratiosGet } from "@/app/api/ratios/route";
import { GET as rentRollGet } from "@/app/api/rent-roll/route";
import { GET as statementGet } from "@/app/api/reports/[statement]/route";
import { GET as schedulerGet } from "@/app/api/scheduler/route";
import { GET as bridgeGet } from "@/app/api/tax/bridge/route";
import { GET as k1Get } from "@/app/api/tax/k1/route";
import { GET as vaultFileGet } from "@/app/api/vault/[id]/route";
import { GET as vaultGet } from "@/app/api/vault/route";
import { GET as form1099Get } from "@/app/api/vendors/1099/route";
import { middleware } from "@/middleware";
import { setTestActor } from "@/lib/auth/actor";
import { assertLoginAllowed, LoginLockedError, recordLoginFailure } from "@/lib/auth/lockout";
import { readValidSessionUserId } from "@/lib/auth/session-cookie";
import { prisma } from "@/lib/prisma";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const REFUSED = new Set([401, 403, 405]);

function anonymousEnv() {
  vi.stubEnv("LEGACY_PARTNER_TOKEN", "off");
  vi.stubEnv("PARTNER_VIEW_TOKEN", "");
  vi.stubEnv("VIEWER_PASSWORD", "");
  vi.stubEnv("PRINCIPAL_PASSWORD", "");
  setTestActor(null);
}

afterEach(() => {
  setTestActor(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("anonymous access without the legacy partner flag", () => {
  it("refuses every GET route", async () => {
    anonymousEnv();
    const calls: Array<[string, Promise<Response>]> = [
      ["debt", debtGet()],
      ["1099", form1099Get(new Request("http://localhost/api/vendors/1099"))],
      ["k1", k1Get(new Request("http://localhost/api/tax/k1"))],
      ["bridge", bridgeGet(new Request("http://localhost/api/tax/bridge"))],
      ["ratios", ratiosGet()],
      ["capex", capexGet()],
      ["close", closeGet()],
      ["packs", packsGet()],
      ["scheduler", schedulerGet()],
      ["entities", entitiesGet()],
      ["providers", providersGet()],
      ["expert-context", expertContextGet(new Request("http://localhost/api/expert/context"))],
      ["access", accessGet()],
      ["deals", dealsGet(new Request("http://localhost/api/deals"))],
      ["intake", intakeGet(new Request("http://localhost/api/deals/intake"))],
      ["dropbox", dropboxGet()],
      ["email", emailGet()],
      ["mailbox", mailboxGet()],
      ["archive", archiveGet(new Request("http://localhost/api/archive"))],
      ["dashboard", dashboardGet(new Request("http://localhost/api/dashboard"))],
      ["narratives", narrativesGet(new Request("http://localhost/api/narratives"))],
      ["reports", statementGet(new Request("http://localhost/api/reports/is"), { params: Promise.resolve({ statement: "is" }) })],
      ["pack", packGet(new Request("http://localhost/api/packs/monthly_investor"), { params: Promise.resolve({ packId: "monthly_investor" }) })],
      ["rent-roll", rentRollGet(new Request("http://localhost/api/rent-roll"))],
      ["budgets", budgetsGet(new Request("http://localhost/api/budgets"))],
      ["audit", auditGet(new Request("http://localhost/api/close/audit"))],
      ["vault", vaultGet(new Request("http://localhost/api/vault"))],
      ["vault-file", vaultFileGet(new Request("http://localhost/api/vault/missing"), { params: Promise.resolve({ id: "missing" }) })],
      ["waterfall", waterfallGet(new Request("http://localhost/api/deals/SPE-WBG/waterfall"), { params: Promise.resolve({ code: "SPE-WBG" }) })],
      ["seed", seedGet()],
    ];
    for (const [name, pending] of calls) {
      const response = await pending;
      expect(REFUSED.has(response.status), `${name} returned ${response.status}`).toBe(true);
    }
  });

  it("refuses expert chat without a login", async () => {
    anonymousEnv();
    const response = await expertChatPost(
      new Request("http://localhost/api/expert/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: { entityCode: "SPE-WBG" }, messages: [] }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("refuses the zero-user owner invite with no environment variables", async () => {
    vi.stubEnv("LEGACY_PARTNER_TOKEN", "");
    vi.stubEnv("OWNER_EMAIL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("PARTNER_VIEW_TOKEN", "");
    vi.stubEnv("VIEWER_PASSWORD", "");
    vi.stubEnv("PRINCIPAL_PASSWORD", "");
    setTestActor(null);
    const count = vi.spyOn(prisma.appUser, "count").mockResolvedValue(0);
    const email = `attacker-${Date.now().toString(36)}@outside.test`;
    const response = await adminUsersPost(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "correct-horse", role: "OWNER" }),
      }),
    );
    count.mockRestore();
    expect(response.status).toBe(403);
    const created = await prisma.appUser.findUnique({ where: { email } });
    expect(created).toBeNull();
  });
});

describe("failed sign-in lockout", () => {
  it("locks an email and an IP after five failures", async () => {
    const email = `lock-${Date.now().toString(36)}@rcp.test`;
    const ip = `198.51.100.${Date.now() % 200}`;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await recordLoginFailure(email, ip);
    }
    await assertLoginAllowed(email, ip);
    await recordLoginFailure(email, ip);
    await expect(assertLoginAllowed(email, "203.0.113.50")).rejects.toBeInstanceOf(LoginLockedError);
    await expect(assertLoginAllowed(`other-${email}`, ip)).rejects.toBeInstanceOf(LoginLockedError);
    await prisma.authLoginFailure.deleteMany({ where: { bucket: { in: [`email:${email}`, `ip:${ip}`] } } });
  });
});

describe("session cookie", () => {
  it("accepts a signed session and ignores a cookie that is only present", async () => {
    const secret = "test-auth-secret-value";
    vi.stubEnv("AUTH_SECRET", secret);
    vi.stubEnv("LEGACY_PARTNER_TOKEN", "on");
    vi.stubEnv("PARTNER_VIEW_TOKEN", "partner-share-token");
    const token = await encode({
      token: { sub: "user-abc" },
      secret,
      salt: "authjs.session-token",
    });
    const signed = new Request("http://localhost/", {
      headers: { cookie: `authjs.session-token=${token}` },
    });
    expect(await readValidSessionUserId(signed)).toBe("user-abc");
    const forged = new Request("http://localhost/", {
      headers: { cookie: "authjs.session-token=not-a-real-session" },
    });
    expect(await readValidSessionUserId(forged)).toBeNull();

    const blocked = await middleware(
      new NextRequest("http://localhost/api/deals", {
        method: "POST",
        headers: { cookie: "authjs.session-token=not-a-real-session" },
      }),
    );
    expect(blocked.status).toBe(403);

    const allowed = await middleware(
      new NextRequest("http://localhost/api/deals", {
        method: "POST",
        headers: { cookie: `authjs.session-token=${token}` },
      }),
    );
    expect(allowed.status).toBe(200);
  });
});
