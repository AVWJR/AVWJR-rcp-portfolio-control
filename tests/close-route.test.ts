import { readFileSync } from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/deals/[code]/close/route";
import { openPeriod } from "@/lib/deals/periods";
import { createEntityWithCoa } from "@/lib/entities";
import { completeChecklist } from "@/lib/period-close";
import { postJournal } from "@/lib/post-journal";
import { prisma } from "@/lib/prisma";
import { dollars } from "@rcp/ledger";
import { afterAll, describe, expect, it } from "vitest";

const ids: string[] = [];

afterAll(async () => {
  for (const id of ids) {
    await prisma.journalLine.deleteMany({ where: { journal: { entityId: id } } });
    await prisma.journal.deleteMany({ where: { entityId: id } });
    await prisma.leasePeriodSnapshot.deleteMany({ where: { entityId: id } });
    await prisma.monthEndUpload.deleteMany({ where: { entityId: id } });
    await prisma.monthEndEvent.deleteMany({ where: { entityId: id } });
    await prisma.tieOutTolerance.deleteMany({ where: { entityId: id } });
    await prisma.vendorAccountMap.deleteMany({ where: { entityId: id } });
    await prisma.vaultDocument.deleteMany({ where: { entityId: id } });
    await prisma.unit.deleteMany({ where: { entityId: id } });
    await prisma.budgetLine.deleteMany({ where: { entityId: id } });
    await prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: id } } });
    await prisma.periodCloseEvent.deleteMany({ where: { period: { entityId: id } } });
    await prisma.period.deleteMany({ where: { entityId: id } });
    await prisma.account.deleteMany({ where: { entityId: id } });
    await prisma.entity.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

function pnl(noi = "4,000.00") {
  return ["Account,Actual", 'Gross Potential Rent,"12,000.00"', 'Vacancy Loss,"(5,000.00)"', 'Payroll,"3,000.00"', `Net Operating Income,"${noi}"`].join("\n");
}

function roll(asOf: string) {
  return `As of ${asOf}\nunit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent\n101,A1,1,1,700,OCCUPIED,500.00,500.00\n`;
}

function endpoint(code: string) {
  return `http://localhost/api/deals/${code}/close`;
}

async function call(code: string, request: Request) {
  return POST(request, { params: Promise.resolve({ code }) });
}

describe("POST /api/deals/[code]/close", () => {
  it("accepts upload, map, post, soft, hard, and reopen as form and JSON, and redirects form errors", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO first");
    const entity = await createEntityWithCoa({
      code: `SPE-QRT${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: "QC Route LLC",
      type: "SPE",
      parentId: opco.id,
      unitCount: 1,
    });
    ids.push(entity.id);

    const formUpload = new FormData();
    formUpload.set("year", "2026");
    formUpload.set("month", "8");
    formUpload.append("files", new File([pnl()], "profit.csv", { type: "text/csv" }));
    formUpload.append("files", new File([roll("2026-08-31")], "rent-roll.csv", { type: "text/csv" }));
    const uploaded = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", body: formUpload }),
    );
    expect(uploaded.status).toBe(200);
    const uploadedJson = (await uploaded.json()) as { ok: boolean; files: { classification: string }[] };
    expect(uploadedJson.ok).toBe(true);
    expect(uploadedJson.files.map((file) => file.classification).sort()).toEqual(["income_statement", "rent_roll"]);

    const jsonUpload = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upload",
          year: 2026,
          month: 6,
          filename: "profit.csv",
          text: pnl(),
          mimeType: "text/csv",
        }),
      }),
    );
    expect(jsonUpload.status).toBe(200);
    expect(((await jsonUpload.json()) as { ok: boolean }).ok).toBe(true);
    const jsonRoll = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upload",
          year: 2026,
          month: 6,
          filename: "rent-roll.csv",
          text: roll("2026-06-30"),
          mimeType: "text/csv",
        }),
      }),
    );
    expect(jsonRoll.status).toBe(200);

    const formMap = new FormData();
    formMap.set("action", "map");
    formMap.set("year", "2026");
    formMap.set("month", "8");
    formMap.set("label", "Mystery fee");
    formMap.set("accountCode", "5990");
    const mapped = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formMap }),
    );
    expect(mapped.status).toBe(303);
    expect(mapped.headers.get("location") ?? "").not.toMatch(/error=/);

    const jsonMap = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "map", year: 2026, month: 6, label: "Mystery fee", accountCode: "5990" }),
      }),
    );
    expect(jsonMap.status).toBe(200);

    const formPost = new FormData();
    formPost.set("action", "post");
    formPost.set("year", "2026");
    formPost.set("month", "8");
    const posted = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formPost }),
    );
    expect(posted.status).toBe(303);
    expect(posted.headers.get("location") ?? "").not.toMatch(/error=/);

    const jsonPost = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "post", year: 2026, month: 6 }),
      }),
    );
    expect(jsonPost.status).toBe(200);

    const formSoft = new FormData();
    formSoft.set("action", "soft");
    formSoft.set("year", "2026");
    formSoft.set("month", "8");
    const softened = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formSoft }),
    );
    expect(softened.status).toBe(303);
    expect(softened.headers.get("location") ?? "").not.toMatch(/error=/);

    const jsonSoft = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "soft", year: 2026, month: 6 }),
      }),
    );
    expect(jsonSoft.status).toBe(200);

    for (const month of [8, 6]) {
      const period = await prisma.period.findUniqueOrThrow({
        where: { entityId_year_month: { entityId: entity.id, year: 2026, month } },
      });
      await completeChecklist(period.id);
    }

    const formHard = new FormData();
    formHard.set("action", "hard");
    formHard.set("year", "2026");
    formHard.set("month", "8");
    const locked = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formHard }),
    );
    expect(locked.status).toBe(303);
    expect(locked.headers.get("location") ?? "").not.toMatch(/error=/);

    const jsonHard = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "hard", year: 2026, month: 6 }),
      }),
    );
    expect(jsonHard.status).toBe(200);

    const formReopen = new FormData();
    formReopen.set("action", "reopen");
    formReopen.set("year", "2026");
    formReopen.set("month", "8");
    formReopen.set("reason", "Controller correction");
    formReopen.set("ticket", "QC-ROUTE");
    const reopened = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formReopen }),
    );
    expect(reopened.status).toBe(303);
    expect(reopened.headers.get("location") ?? "").not.toMatch(/error=/);

    const jsonReopen = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reopen",
          year: 2026,
          month: 6,
          reason: "Controller correction",
          ticket: "QC-ROUTE-JSON",
        }),
      }),
    );
    expect(jsonReopen.status).toBe(200);
    const august = await prisma.period.findUniqueOrThrow({
      where: { entityId_year_month: { entityId: entity.id, year: 2026, month: 8 } },
    });
    const june = await prisma.period.findUniqueOrThrow({
      where: { entityId_year_month: { entityId: entity.id, year: 2026, month: 6 } },
    });
    expect(august.status).toBe("OPEN");
    expect(june.status).toBe("OPEN");

    const missing = new FormData();
    missing.set("year", "2026");
    missing.set("month", "8");
    const rejected = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: missing }),
    );
    expect(rejected.status).toBe(303);
    expect(decodeURIComponent(rejected.headers.get("location") ?? "")).toMatch(/error=/);

    const badJson = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "post" }),
      }),
    );
    expect(badJson.status).toBe(400);
    const badBody = (await badJson.json()) as { ok: boolean; error: string };
    expect(badBody.ok).toBe(false);
    expect(badBody.error).toMatch(/period/i);
  });

  it("refuses reverse-operating without confirm=yes or a reason, and accepts form and JSON when both are present", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO first");
    const entity = await createEntityWithCoa({
      code: `SPE-QRV${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: "QC Reverse Route LLC",
      type: "SPE",
      parentId: opco.id,
      unitCount: 1,
    });
    ids.push(entity.id);

    async function seedOperating(month: number) {
      const period = await openPeriod(entity.id, 2026, month);
      await postJournal({
        entityId: entity.id,
        periodId: period.id,
        date: new Date(Date.UTC(2026, month - 1, 28, 16, 0, 0)),
        memo: `Seeded operating ${month}`,
        source: "seed",
        lines: [
          { accountCode: "1110", debit: dollars(100), credit: 0n },
          { accountCode: "4010", debit: 0n, credit: dollars(100) },
        ],
      });
    }
    await seedOperating(8);
    await seedOperating(6);

    const formNoConfirm = new FormData();
    formNoConfirm.set("action", "reverse-operating");
    formNoConfirm.set("year", "2026");
    formNoConfirm.set("month", "8");
    formNoConfirm.set("reason", "Replace seeded books");
    const refusedConfirm = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formNoConfirm }),
    );
    expect(refusedConfirm.status).toBe(303);
    expect(decodeURIComponent(refusedConfirm.headers.get("location") ?? "")).toMatch(/confirm/i);

    const jsonNoConfirm = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reverse-operating", year: 2026, month: 8, reason: "Replace seeded books" }),
      }),
    );
    expect(jsonNoConfirm.status).toBe(400);
    expect(((await jsonNoConfirm.json()) as { ok: boolean; error: string }).error).toMatch(/confirm/i);

    const formBlank = new FormData();
    formBlank.set("action", "reverse-operating");
    formBlank.set("year", "2026");
    formBlank.set("month", "8");
    formBlank.set("confirm", "yes");
    formBlank.set("reason", "   ");
    const refusedReason = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formBlank }),
    );
    expect(refusedReason.status).toBe(303);
    expect(decodeURIComponent(refusedReason.headers.get("location") ?? "")).toMatch(/reason/i);

    const jsonBlank = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reverse-operating", year: 2026, month: 6, confirm: "yes", reason: "" }),
      }),
    );
    expect(jsonBlank.status).toBe(400);
    expect(((await jsonBlank.json()) as { ok: boolean; error: string }).error).toMatch(/reason/i);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "operating_reversal" } })).toBe(0);

    const formYes = new FormData();
    formYes.set("action", "reverse-operating");
    formYes.set("year", "2026");
    formYes.set("month", "8");
    formYes.set("confirm", "yes");
    formYes.set("reason", "Replace seeded August books");
    const formOk = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formYes }),
    );
    expect(formOk.status).toBe(303);
    expect(formOk.headers.get("location") ?? "").not.toMatch(/error=/);

    const jsonOk = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reverse-operating",
          year: 2026,
          month: 6,
          confirm: "yes",
          reason: "Replace seeded June books",
        }),
      }),
    );
    expect(jsonOk.status).toBe(200);
    const jsonBody = (await jsonOk.json()) as { ok: boolean; reversed: number };
    expect(jsonBody.ok).toBe(true);
    expect(jsonBody.reversed).toBe(1);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "operating_reversal" } })).toBe(2);
  });

  it("requires a controller override and reason on form and JSON before a soft-closed post or reversal", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO first");
    const entity = await createEntityWithCoa({
      code: `SPE-QOV${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: "QC Soft Override LLC",
      type: "SPE",
      parentId: opco.id,
      unitCount: 1,
    });
    ids.push(entity.id);
    const profit = readFileSync(path.join(process.cwd(), "tests/fixtures/wbg-2026-08-profit.csv"), "utf8");

    const uploaded = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upload",
          year: 2026,
          month: 8,
          filename: "wbg-2026-08-profit.csv",
          text: profit,
          mimeType: "text/csv",
        }),
      }),
    );
    expect(uploaded.status).toBe(200);
    const posted = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "post", year: 2026, month: 8 }),
      }),
    );
    expect(posted.status).toBe(200);
    const softened = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "soft", year: 2026, month: 8 }),
      }),
    );
    expect(softened.status).toBe(200);

    const jsonRefused = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "post", year: 2026, month: 8 }),
      }),
    );
    expect(jsonRefused.status).toBe(400);
    expect(((await jsonRefused.json()) as { error: string }).error).toMatch(/soft-closed|controller override/i);

    const formRefused = new FormData();
    formRefused.set("action", "post");
    formRefused.set("year", "2026");
    formRefused.set("month", "8");
    const formNo = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formRefused }),
    );
    expect(formNo.status).toBe(303);
    expect(decodeURIComponent(formNo.headers.get("location") ?? "")).toMatch(/soft-closed|controller override/i);
    expect(await prisma.monthEndEvent.count({ where: { entityId: entity.id, action: "CONTROLLER_OVERRIDE" } })).toBe(0);

    const jsonBlank = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "post", year: 2026, month: 8, controllerOverride: "yes", reason: "  " }),
      }),
    );
    expect(jsonBlank.status).toBe(400);
    expect(((await jsonBlank.json()) as { error: string }).error).toMatch(/reason/i);

    const jsonYes = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "post",
          year: 2026,
          month: 8,
          controllerOverride: "yes",
          reason: "JSON controller post",
        }),
      }),
    );
    expect(jsonYes.status).toBe(200);

    const formYes = new FormData();
    formYes.set("action", "post");
    formYes.set("year", "2026");
    formYes.set("month", "8");
    formYes.set("controllerOverride", "yes");
    formYes.set("reason", "Form controller post");
    const formOk = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formYes }),
    );
    expect(formOk.status).toBe(303);
    expect(formOk.headers.get("location") ?? "").not.toMatch(/error=/);
    const reasons = await prisma.monthEndEvent.findMany({
      where: { entityId: entity.id, action: "CONTROLLER_OVERRIDE" },
      orderBy: { createdAt: "asc" },
    });
    expect(reasons.map((row) => row.detail)).toEqual(["JSON controller post", "Form controller post"]);

    async function seedOperating(month: number) {
      const period = await openPeriod(entity.id, 2026, month);
      await postJournal({
        entityId: entity.id,
        periodId: period.id,
        date: new Date(Date.UTC(2026, month - 1, 28, 16, 0, 0)),
        memo: `Seeded operating ${month}`,
        source: "seed",
        lines: [
          { accountCode: "1110", debit: dollars(100), credit: 0n },
          { accountCode: "4010", debit: 0n, credit: dollars(100) },
        ],
      });
      const soft = await call(
        entity.code,
        new Request(endpoint(entity.code), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "soft", year: 2026, month }),
        }),
      );
      expect(soft.status).toBe(200);
    }
    await seedOperating(4);
    await seedOperating(5);

    const jsonReverseNo = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reverse-operating",
          year: 2026,
          month: 4,
          confirm: "yes",
          reason: "Replace seeded books",
        }),
      }),
    );
    expect(jsonReverseNo.status).toBe(400);
    expect(((await jsonReverseNo.json()) as { error: string }).error).toMatch(/soft-closed|controller override/i);

    const formReverseNo = new FormData();
    formReverseNo.set("action", "reverse-operating");
    formReverseNo.set("year", "2026");
    formReverseNo.set("month", "5");
    formReverseNo.set("confirm", "yes");
    formReverseNo.set("reason", "Replace seeded books");
    const formReverseRefused = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formReverseNo }),
    );
    expect(formReverseRefused.status).toBe(303);
    expect(decodeURIComponent(formReverseRefused.headers.get("location") ?? "")).toMatch(/soft-closed|controller override/i);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "operating_reversal" } })).toBe(0);

    const jsonReverseYes = await call(
      entity.code,
      new Request(endpoint(entity.code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reverse-operating",
          year: 2026,
          month: 4,
          confirm: true,
          reason: "JSON controller reversal",
          controllerOverride: true,
        }),
      }),
    );
    expect(jsonReverseYes.status).toBe(200);

    const formReverseYes = new FormData();
    formReverseYes.set("action", "reverse-operating");
    formReverseYes.set("year", "2026");
    formReverseYes.set("month", "5");
    formReverseYes.set("confirm", "yes");
    formReverseYes.set("reason", "Form controller reversal");
    formReverseYes.set("controllerOverride", "yes");
    const formReverseOk = await call(
      entity.code,
      new Request(endpoint(entity.code), { method: "POST", headers: { accept: "text/html" }, body: formReverseYes }),
    );
    expect(formReverseOk.status).toBe(303);
    expect(formReverseOk.headers.get("location") ?? "").not.toMatch(/error=/);
    const reversalReasons = await prisma.monthEndEvent.findMany({
      where: { entityId: entity.id, action: "CONTROLLER_OVERRIDE", month: { in: [4, 5] } },
      orderBy: { month: "asc" },
    });
    expect(reversalReasons.map((row) => row.detail)).toEqual(["JSON controller reversal", "Form controller reversal"]);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "operating_reversal" } })).toBe(2);
  });
});
