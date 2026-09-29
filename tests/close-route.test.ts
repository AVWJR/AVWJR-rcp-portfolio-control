import { POST } from "@/app/api/deals/[code]/close/route";
import { createEntityWithCoa } from "@/lib/entities";
import { completeChecklist } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";
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
});
