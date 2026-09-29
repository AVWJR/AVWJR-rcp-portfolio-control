import { placeInServiceAction } from "@/app/actions/capex";
import { hardLockAction, reopenAction, softCloseAction } from "@/app/actions/close";
import { POST as inviteUserRoute } from "@/app/api/admin/users/route";
import { POST as restorePost } from "@/app/api/archive/[code]/restore/route";
import { POST as budgetsPost } from "@/app/api/budgets/route";
import { GET as dashboardGet } from "@/app/api/dashboard/route";
import { POST as archiveDelete } from "@/app/api/deals/[code]/delete/route";
import { POST as closePost } from "@/app/api/deals/[code]/close/route";
import { GET as waterfallGet, PUT as waterfallPut } from "@/app/api/deals/[code]/waterfall/route";
import { POST as dealsPost } from "@/app/api/deals/route";
import { POST as intakeBlobPost } from "@/app/api/deals/intake/blob/route";
import { DELETE as intakeFileDelete, PATCH as intakeFilePatch, POST as intakeFilePost } from "@/app/api/deals/intake/files/route";
import { POST as dropboxPost } from "@/app/api/deals/intake/from-dropbox/route";
import { POST as emailPost } from "@/app/api/deals/intake/from-email/route";
import { POST as importPost } from "@/app/api/deals/intake/import/route";
import { POST as intakePost } from "@/app/api/deals/intake/route";
import { POST as mailboxPost } from "@/app/api/deals/intake/scan-mailbox/route";
import { GET as narrativesGet } from "@/app/api/narratives/route";
import { POST as rentRollPost } from "@/app/api/rent-roll/route";
import { POST as schedulerPost } from "@/app/api/scheduler/run/route";
import { POST as vaultBlobPost } from "@/app/api/vault/blob/route";
import { DELETE as vaultDelete } from "@/app/api/vault/[id]/route";
import { POST as vaultPost } from "@/app/api/vault/route";
import { postJournalAction } from "@/app/actions/journal";
import { setTestActor } from "@/lib/auth/actor";
import { decideAccess } from "@/lib/auth/policy";
import { hashPassword } from "@/lib/auth/passwords";
import { roleAllows } from "@/lib/auth/roles";
import { bootstrapOwner } from "@/lib/auth/users";
import { openPeriod } from "@/lib/deals/periods";
import { createEntityWithCoa } from "@/lib/entities";
import { closeAuditCsv } from "@/lib/close/audit-export";
import { completeChecklist, hardLockPeriod, softClosePeriod } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";
import { dollars } from "@rcp/ledger";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const entityIds: string[] = [];
const userIds: string[] = [];

afterEach(() => {
  setTestActor(null);
});

afterAll(async () => {
  setTestActor(null);
  if (userIds.length) {
    await prisma.userEntityScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
  }
  for (const id of entityIds) {
    await prisma.journalLine.deleteMany({ where: { journal: { entityId: id } } });
    await prisma.journal.deleteMany({ where: { entityId: id } });
    await prisma.monthEndUpload.deleteMany({ where: { entityId: id } });
    await prisma.monthEndEvent.deleteMany({ where: { entityId: id } });
    await prisma.vendorAccountMap.deleteMany({ where: { entityId: id } });
    await prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: id } } });
    await prisma.periodCloseEvent.deleteMany({ where: { period: { entityId: id } } });
    await prisma.period.deleteMany({ where: { entityId: id } });
    await prisma.account.deleteMany({ where: { entityId: id } });
    await prisma.entity.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

async function makeUser(role: "OWNER" | "CONTROLLER" | "PREPARER" | "REVIEWER" | "LP_VIEWER" | "LENDER_VIEWER", email: string) {
  const user = await prisma.appUser.create({
    data: {
      email,
      name: role,
      passwordHash: hashPassword("correct-horse"),
      role,
      active: true,
    },
  });
  userIds.push(user.id);
  return user;
}

async function makeSpe(suffix: string) {
  const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
  if (!opco) throw new Error("Seed RCP-OPCO first");
  const entity = await createEntityWithCoa({
    code: `SPE-IC${suffix}${Date.now().toString(36).slice(-3).toUpperCase()}`,
    name: `Controls ${suffix}`,
    type: "SPE",
    parentId: opco.id,
    unitCount: 1,
  });
  entityIds.push(entity.id);
  return entity;
}

function closeRequest(code: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/deals/${code}/close`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("access policy", () => {
  it("keeps the partner gate until a user exists, then requires a person", () => {
    expect(
      decideAccess({
        flag: "auto",
        userCount: 0,
        bootstrapConfigured: false,
        partnerGateConfigured: false,
        hasSession: false,
        legacyRole: null,
      }),
    ).toBe("legacy-principal");
    expect(
      decideAccess({
        flag: "auto",
        userCount: 0,
        bootstrapConfigured: true,
        partnerGateConfigured: false,
        hasSession: false,
        legacyRole: null,
      }),
    ).toBe("anonymous");
    expect(
      decideAccess({
        flag: "auto",
        userCount: 2,
        bootstrapConfigured: true,
        partnerGateConfigured: true,
        hasSession: false,
        legacyRole: "principal",
      }),
    ).toBe("anonymous");
    expect(
      decideAccess({
        flag: "on",
        userCount: 2,
        bootstrapConfigured: true,
        partnerGateConfigured: false,
        hasSession: false,
        legacyRole: null,
      }),
    ).toBe("legacy-principal");
    expect(
      decideAccess({
        flag: "off",
        userCount: 0,
        bootstrapConfigured: false,
        partnerGateConfigured: true,
        hasSession: false,
        legacyRole: "principal",
      }),
    ).toBe("anonymous");
    expect(
      decideAccess({
        flag: "off",
        userCount: 0,
        bootstrapConfigured: false,
        partnerGateConfigured: false,
        hasSession: true,
        legacyRole: null,
      }),
    ).toBe("session");
  });

  it("gives each role only its own powers", () => {
    expect(roleAllows("OWNER", "users.admin")).toBe(true);
    expect(roleAllows("CONTROLLER", "users.admin")).toBe(false);
    expect(roleAllows("CONTROLLER", "close.hard")).toBe(true);
    expect(roleAllows("PREPARER", "close.post")).toBe(true);
    expect(roleAllows("PREPARER", "close.override")).toBe(false);
    expect(roleAllows("PREPARER", "close.hard")).toBe(false);
    expect(roleAllows("PREPARER", "close.reopen")).toBe(false);
    expect(roleAllows("PREPARER", "waterfall.write")).toBe(false);
    expect(roleAllows("PREPARER", "archive.write")).toBe(false);
    expect(roleAllows("REVIEWER", "close.sign_review")).toBe(true);
    expect(roleAllows("REVIEWER", "close.upload")).toBe(false);
    expect(roleAllows("REVIEWER", "ledger.post")).toBe(false);
    expect(roleAllows("LP_VIEWER", "read")).toBe(true);
    expect(roleAllows("LP_VIEWER", "close.post")).toBe(false);
    expect(roleAllows("LENDER_VIEWER", "upload.write")).toBe(false);
  });
});

describe("bootstrap", () => {
  it("creates the owner from OWNER_EMAIL once, then turns the shared gate off", async () => {
    await prisma.userEntityScope.deleteMany({ where: { user: { email: { endsWith: "@rcp.test" } } } });
    await prisma.appUser.deleteMany({ where: { email: { endsWith: "@rcp.test" } } });
    vi.stubEnv("OWNER_EMAIL", "vance-bootstrap@rcp.test");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-value");
    vi.stubEnv("LEGACY_PARTNER_TOKEN", "");
    const others = await prisma.appUser.count({ where: { NOT: { email: { endsWith: "@rcp.test" } } } });
    if (others > 0) {
      await expect(
        bootstrapOwner({ email: "vance-bootstrap@rcp.test", password: "correct-horse", name: "Vance" }),
      ).rejects.toThrow(/already exists/i);
      return;
    }
    await expect(bootstrapOwner({ email: "someone-else@rcp.test", password: "correct-horse" })).rejects.toThrow(/not the owner/i);
    const owner = await bootstrapOwner({
      email: "Vance-Bootstrap@rcp.test",
      password: "correct-horse",
      name: "Vance",
    });
    userIds.push(owner.id);
    expect(owner.role).toBe("OWNER");
    await expect(bootstrapOwner({ email: "vance-bootstrap@rcp.test", password: "correct-horse" })).rejects.toThrow(/already exists/i);
    const { resolveActor } = await import("@/lib/auth/actor");
    const actor = await resolveActor();
    expect(actor.kind).toBe("anonymous");
  });
});

describe("role enforcement, stamps, scope, and segregation", () => {
  it("refuses the wrong role on close, ledger, waterfall, upload, and archive", async () => {
    const stamp = Date.now().toString(36);
    const [owner, controller, preparer, reviewer, lp] = await Promise.all([
      makeUser("OWNER", `owner-${stamp}@rcp.test`),
      makeUser("CONTROLLER", `controller-${stamp}@rcp.test`),
      makeUser("PREPARER", `preparer-${stamp}@rcp.test`),
      makeUser("REVIEWER", `reviewer-${stamp}@rcp.test`),
      makeUser("LP_VIEWER", `lp-${stamp}@rcp.test`),
    ]);
    const entity = await makeSpe("A");
    const other = await makeSpe("B");
    await prisma.userEntityScope.create({ data: { userId: lp.id, entityId: entity.id } });
    const period = await openPeriod(entity.id, 2026, 3);

    setTestActor(reviewer.id);
    for (const action of ["upload", "map", "post", "reverse-operating", "set-tolerance", "soft", "hard", "reopen"]) {
      const response = await closePost(closeRequest(entity.code, { action, year: 2026, month: 3, reason: "x", ticket: "T-1" }), {
        params: Promise.resolve({ code: entity.code }),
      });
      expect(response.status, action).toBe(403);
    }

    setTestActor(preparer.id);
    for (const action of ["hard", "reopen"]) {
      const response = await closePost(closeRequest(entity.code, { action, year: 2026, month: 3, reason: "x", ticket: "T-1" }), {
        params: Promise.resolve({ code: entity.code }),
      });
      expect(response.status, action).toBe(403);
    }
    const override = await closePost(
      closeRequest(entity.code, { action: "post", year: 2026, month: 3, controllerOverride: true, reason: "change it" }),
      { params: Promise.resolve({ code: entity.code }) },
    );
    expect(override.status).toBe(403);

    setTestActor(lp.id);
    const lpClose = await closePost(closeRequest(entity.code, { action: "upload", year: 2026, month: 3 }), {
      params: Promise.resolve({ code: entity.code }),
    });
    expect(lpClose.status).toBe(403);

    setTestActor(reviewer.id);
    await expect(
      postJournalAction({
        entityId: entity.id,
        periodId: period.id,
        date: "2026-03-28",
        memo: "Reviewer journal",
        lines: [
          { accountCode: "1110", debit: dollars(10), credit: 0n },
          { accountCode: "4010", debit: 0n, credit: dollars(10) },
        ],
      }),
    ).rejects.toThrow(/cannot post a journal/i);

    setTestActor(preparer.id);
    const waterfallDenied = await waterfallPut(
      new Request(`http://localhost/api/deals/${entity.code}/waterfall`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: "look_through_100" }),
      }),
      { params: Promise.resolve({ code: entity.code }) },
    );
    expect(waterfallDenied.status).toBe(403);

    setTestActor(reviewer.id);
    const uploadDenied = await vaultPost(
      new Request("http://localhost/api/vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: entity.code, filename: "note.pdf", blobUrl: "https://example.com/nope" }),
      }),
    );
    expect(uploadDenied.status).toBe(403);

    const archiveDenied = await archiveDelete(
      new Request(`http://localhost/api/deals/${entity.code}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmCode: entity.code }),
      }),
      { params: Promise.resolve({ code: entity.code }) },
    );
    expect(archiveDenied.status).toBe(403);

    setTestActor(preparer.id);
    const adminDenied = await inviteUserRoute(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `extra-${stamp}@rcp.test`,
          role: "REVIEWER",
          password: "correct-horse",
        }),
      }),
    );
    expect(adminDenied.status).toBe(403);

    setTestActor(owner.id);
    const invited = await inviteUserRoute(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `extra-${stamp}@rcp.test`,
          name: "Extra",
          role: "REVIEWER",
          password: "correct-horse",
        }),
      }),
    );
    expect(invited.status).toBe(200);
    const extra = await prisma.appUser.findUnique({ where: { email: `extra-${stamp}@rcp.test` } });
    if (extra) userIds.push(extra.id);

    setTestActor(lp.id);
    const inside = await dashboardGet(new Request(`http://localhost/api/dashboard?entity=${entity.code}&period=2026-03`));
    const outside = await dashboardGet(new Request(`http://localhost/api/dashboard?entity=${other.code}&period=2026-03`));
    const outsideNarrative = await narrativesGet(new Request(`http://localhost/api/narratives?entity=${other.code}&period=2026-03`));
    const outsideWaterfall = await waterfallGet(
      new Request(`http://localhost/api/deals/${other.code}/waterfall`),
      { params: Promise.resolve({ code: other.code }) },
    );
    expect(inside.status).not.toBe(403);
    expect(outside.status).toBe(403);
    expect(outsideNarrative.status).toBe(403);
    expect(outsideWaterfall.status).toBe(403);

    setTestActor(preparer.id);
    const uploaded = await closePost(
      closeRequest(entity.code, {
        action: "upload",
        year: 2026,
        month: 3,
        filename: "profit.csv",
        text: ["Account,Actual", 'Gross Potential Rent,"1,000.00"', 'Payroll,"200.00"', 'Net Operating Income,"800.00"'].join("\n"),
        mimeType: "text/csv",
      }),
      { params: Promise.resolve({ code: entity.code }) },
    );
    expect(uploaded.status).toBe(200);
    const uploadRow = await prisma.monthEndUpload.findFirst({ where: { entityId: entity.id, filename: "profit.csv" } });
    expect(uploadRow?.uploadedByUserId).toBe(preparer.id);
    const uploadEvent = await prisma.monthEndEvent.findFirst({ where: { entityId: entity.id, action: "UPLOAD" } });
    expect(uploadEvent?.actorUserId).toBe(preparer.id);

    const mapped = await closePost(
      closeRequest(entity.code, { action: "map", year: 2026, month: 3, label: "Payroll", accountCode: "5110" }),
      { params: Promise.resolve({ code: entity.code }) },
    );
    expect(mapped.status).toBe(200);
    const mapRow = await prisma.vendorAccountMap.findFirst({ where: { entityId: entity.id, accountCode: "5110" } });
    expect(mapRow?.updatedByUserId).toBe(preparer.id);

    const journal = await postJournalAction({
      entityId: entity.id,
      periodId: period.id,
      date: "2026-03-28",
      memo: "Preparer journal",
      lines: [
        { accountCode: "1110", debit: dollars(25), credit: 0n },
        { accountCode: "4010", debit: 0n, credit: dollars(25) },
      ],
    });
    expect(journal.postedByUserId).toBe(preparer.id);

    setTestActor(controller.id);
    const archived = await archiveDelete(
      new Request(`http://localhost/api/deals/${other.code}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmCode: other.code }),
      }),
      { params: Promise.resolve({ code: other.code }) },
    );
    expect(archived.status).toBe(200);
    const archivedRow = await prisma.entity.findUnique({ where: { id: other.id } });
    expect(archivedRow?.archivedByUserId).toBe(controller.id);
    expect(archivedRow?.lifecycleStatus).toBe("ARCHIVED");

    const protectedDemo = await archiveDelete(
      new Request("http://localhost/api/deals/SPE-WBG/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmCode: "SPE-WBG" }),
      }),
      { params: Promise.resolve({ code: "SPE-WBG" }) },
    );
    expect(protectedDemo.status).toBe(400);

    await prisma.appUser.update({ where: { id: preparer.id }, data: { active: false, deactivatedAt: new Date() } });
    setTestActor(preparer.id);
    const deactivated = await closePost(closeRequest(entity.code, { action: "upload", year: 2026, month: 3 }), {
      params: Promise.resolve({ code: entity.code }),
    });
    expect(deactivated.status).toBe(403);
    expect(await deactivated.json()).toMatchObject({ error: expect.stringMatching(/deactivated/i) });
  });

  it("refuses the wrong role on every other mutating upload, deal, archive, and ledger path", async () => {
    const stamp = Date.now().toString(36);
    const [reviewer, preparer, lender] = await Promise.all([
      makeUser("REVIEWER", `sweep-reviewer-${stamp}@rcp.test`),
      makeUser("PREPARER", `sweep-preparer-${stamp}@rcp.test`),
      makeUser("LENDER_VIEWER", `sweep-lender-${stamp}@rcp.test`),
    ]);
    const entity = await makeSpe("L");
    const other = await makeSpe("M");
    await prisma.userEntityScope.create({ data: { userId: lender.id, entityId: entity.id } });
    const deniedRequest = (url: string, method = "POST") =>
      new Request(url, {
        method,
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.44",
        },
        body: method === "GET" || method === "HEAD" ? undefined : "{}",
      });

    setTestActor(reviewer.id);
    const reviewerRoutes: Array<[string, Promise<Response>]> = [
      ["restore", restorePost(deniedRequest("http://localhost/api/archive/SPE-WBG/restore"), { params: Promise.resolve({ code: "SPE-WBG" }) })],
      ["deals", dealsPost(deniedRequest("http://localhost/api/deals"))],
      ["intake", intakePost(deniedRequest("http://localhost/api/deals/intake"))],
      ["intake-files", intakeFilePost(deniedRequest("http://localhost/api/deals/intake/files"))],
      ["intake-files-patch", intakeFilePatch(deniedRequest("http://localhost/api/deals/intake/files", "PATCH"))],
      ["intake-files-delete", intakeFileDelete(deniedRequest("http://localhost/api/deals/intake/files?id=missing", "DELETE"))],
      ["dropbox", dropboxPost(deniedRequest("http://localhost/api/deals/intake/from-dropbox"))],
      ["email", emailPost(deniedRequest("http://localhost/api/deals/intake/from-email"))],
      ["mailbox", mailboxPost(deniedRequest("http://localhost/api/deals/intake/scan-mailbox"))],
      ["import", importPost(deniedRequest("http://localhost/api/deals/intake/import"))],
      ["intake-blob", intakeBlobPost(deniedRequest("http://localhost/api/deals/intake/blob"))],
      ["rent-roll", rentRollPost(deniedRequest("http://localhost/api/rent-roll"))],
      ["budgets", budgetsPost(deniedRequest("http://localhost/api/budgets"))],
      ["vault-delete", vaultDelete(deniedRequest("http://localhost/api/vault/missing", "DELETE"), { params: Promise.resolve({ id: "missing" }) })],
      ["vault-blob", vaultBlobPost(deniedRequest("http://localhost/api/vault/blob"))],
    ];
    for (const [name, pending] of reviewerRoutes) {
      const response = await pending;
      expect(response.status, name).toBe(403);
    }
    await expect(softCloseAction(new FormData())).rejects.toThrow(/soft-close/i);
    await expect(placeInServiceAction(new FormData())).rejects.toThrow(/post a journal/i);

    setTestActor(preparer.id);
    const createDeal = await dealsPost(deniedRequest("http://localhost/api/deals"));
    expect(createDeal.status).toBe(403);
    const scheduled = await schedulerPost(deniedRequest("http://localhost/api/scheduler/run"));
    expect(scheduled.status).toBe(403);
    await expect(hardLockAction(new FormData())).rejects.toThrow(/hard-lock/i);
    await expect(reopenAction(new FormData())).rejects.toThrow(/reopen/i);
    await expect(
      postJournalAction({
        entityId: entity.id,
        periodId: "unused",
        date: "2026-03-28",
        memo: "Override",
        allowControllerAdjustment: true,
        lines: [],
      }),
    ).rejects.toThrow(/override/i);

    setTestActor(lender.id);
    const inside = await dashboardGet(new Request(`http://localhost/api/dashboard?entity=${entity.code}&period=2026-03`));
    const outside = await dashboardGet(new Request(`http://localhost/api/dashboard?entity=${other.code}&period=2026-03`));
    expect(inside.status).not.toBe(403);
    expect(outside.status).toBe(403);
  });

  it("requires a different reviewer before hard lock, and logs an owner self-approval", async () => {
    const stamp = Date.now().toString(36);
    const [owner, controller, preparer, reviewer] = await Promise.all([
      makeUser("OWNER", `sod-owner-${stamp}@rcp.test`),
      makeUser("CONTROLLER", `sod-controller-${stamp}@rcp.test`),
      makeUser("PREPARER", `sod-preparer-${stamp}@rcp.test`),
      makeUser("REVIEWER", `sod-reviewer-${stamp}@rcp.test`),
    ]);
    const entity = await makeSpe("S");
    const period = await openPeriod(entity.id, 2026, 4);
    await completeChecklist(period.id);

    setTestActor(controller.id);
    await softClosePeriod(period.id);
    await expect(hardLockPeriod(period.id)).rejects.toThrow(/reviewer/i);

    setTestActor(preparer.id);
    const prepared = await closePost(closeRequest(entity.code, { action: "sign-prepare-all", year: 2026, month: 4 }), {
      params: Promise.resolve({ code: entity.code }),
    });
    expect(prepared.status).toBe(200);
    const selfReview = await closePost(
      closeRequest(entity.code, { action: "sign-review-all", year: 2026, month: 4, reason: "I did both" }),
      { params: Promise.resolve({ code: entity.code }) },
    );
    expect(selfReview.status).toBe(403);

    setTestActor(reviewer.id);
    const reviewed = await closePost(closeRequest(entity.code, { action: "sign-review-all", year: 2026, month: 4 }), {
      params: Promise.resolve({ code: entity.code }),
    });
    expect(reviewed.status).toBe(200);
    setTestActor(controller.id);
    const locked = await hardLockPeriod(period.id);
    expect(locked.status).toBe("CLOSED");
    const trail = await prisma.period.findUnique({ where: { id: period.id }, include: { checklist: true } });
    expect(trail?.preparedByUserId).toBe(preparer.id);
    expect(trail?.reviewedByUserId).toBe(reviewer.id);
    expect(trail?.checklist.every((item) => item.preparedByUserId === preparer.id && item.reviewedByUserId === reviewer.id)).toBe(true);
    const closeEvent = await prisma.periodCloseEvent.findFirst({ where: { periodId: period.id, action: "HARD_LOCK" } });
    expect(closeEvent?.actorUserId).toBe(controller.id);

    const ownerEntity = await makeSpe("O");
    const ownerPeriod = await openPeriod(ownerEntity.id, 2026, 4);
    await completeChecklist(ownerPeriod.id);
    setTestActor(owner.id);
    await softClosePeriod(ownerPeriod.id);
    const ownerPrepared = await closePost(
      closeRequest(ownerEntity.code, { action: "sign-prepare-all", year: 2026, month: 4 }),
      { params: Promise.resolve({ code: ownerEntity.code }) },
    );
    expect(ownerPrepared.status).toBe(200);
    const ownerBare = await closePost(
      closeRequest(ownerEntity.code, { action: "sign-review-all", year: 2026, month: 4 }),
      { params: Promise.resolve({ code: ownerEntity.code }) },
    );
    expect(ownerBare.status).toBe(403);
    const ownerReview = await closePost(
      closeRequest(ownerEntity.code, { action: "sign-review-all", year: 2026, month: 4, reason: "Owner traveling, no second signer" }),
      { params: Promise.resolve({ code: ownerEntity.code }) },
    );
    expect(ownerReview.status).toBe(200);
    const ownerLocked = await hardLockPeriod(ownerPeriod.id);
    expect(ownerLocked.status).toBe("CLOSED");
    const ownerTrail = await prisma.period.findUnique({ where: { id: ownerPeriod.id } });
    expect(ownerTrail?.ownerSelfApproveReason).toMatch(/no second signer/i);

    const csv = await closeAuditCsv(entity.code, 2026, 4);
    expect(csv).toContain(preparer.email);
    expect(csv).toContain(reviewer.email);
    expect(csv).toContain("HARD_LOCK");
    const ownerCsv = await closeAuditCsv(ownerEntity.code, 2026, 4);
    expect(ownerCsv).toContain("no second signer");
  });
});
