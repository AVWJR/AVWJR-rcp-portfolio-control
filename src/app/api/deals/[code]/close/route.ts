import {
  postCloseToBooks,
  rememberMap,
  reverseOperatingJournals,
  setTieOutTolerance,
  storeCloseUpload,
  transitionClose,
} from "@/lib/close/workspace";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function optionalBigint(value: unknown): bigint | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return BigInt(text);
}

function optionalInt(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed)) throw new Error("Tolerance bps and days must be whole numbers.");
  return parsed;
}

async function speOrThrow(code: string) {
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity || entity.type !== "SPE") {
    throw new Error("Month-end close is for a property SPE.");
  }
  return entity;
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
  const contentType = request.headers.get("content-type") ?? "";
  let year = 0;
  let month = 0;
  const back = (error?: string) => {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const url = new URL(`/deals/${code}/close`, request.url);
    url.searchParams.set("entity", code);
    url.searchParams.set("period", period);
    if (error) url.searchParams.set("error", error);
    return NextResponse.redirect(url, 303);
  };
  try {
    const entity = await speOrThrow(code);
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        action?: string;
        year?: number;
        month?: number;
        label?: string;
        sourceAccountNo?: string;
        accountCode?: string;
        reason?: string;
        ticket?: string;
        filename?: string;
        text?: string;
        mimeType?: string;
        key?: string;
        cents?: string | number | null;
        bps?: string | number | null;
        days?: string | number | null;
        confirm?: boolean | string;
      };
      year = Number(body.year);
      month = Number(body.month);
      if (!year || !month) throw new Error("Pick a period first.");
      if (body.action === "upload") {
        if (!body.filename || body.text == null) throw new Error("Drop at least one file.");
        const stored = await storeCloseUpload({
          entityId: entity.id,
          entityCode: code,
          year,
          month,
          filename: body.filename,
          mimeType: body.mimeType || "text/csv",
          bytes: Buffer.from(body.text, "utf8"),
        });
        return NextResponse.json({ ok: true, files: [stored] });
      }
      if (body.action === "map") {
        if (!body.label || !body.accountCode) throw new Error("Choose an RCP account.");
        await rememberMap({
          entityId: entity.id,
          sourceSystem: code,
          sourceAccountNo: body.sourceAccountNo ?? "",
          label: body.label,
          accountCode: body.accountCode,
          year,
          month,
        });
        return NextResponse.json({ ok: true });
      }
      if (body.action === "post") {
        await postCloseToBooks({ entityId: entity.id, year, month });
        return NextResponse.json({ ok: true });
      }
      if (body.action === "reverse-operating") {
        if (body.confirm !== true && body.confirm !== "yes") {
          throw new Error("Confirm the journals listed on the close page before reversing.");
        }
        const reversed = await reverseOperatingJournals({
          entityId: entity.id,
          year,
          month,
          reason: body.reason ?? "",
        });
        return NextResponse.json({ ok: true, reversed: reversed.reversed });
      }
      if (body.action === "set-tolerance") {
        await setTieOutTolerance({
          entityId: entity.id,
          key: body.key ?? "",
          cents: optionalBigint(body.cents),
          bps: optionalInt(body.bps),
          days: optionalInt(body.days),
          year,
          month,
        });
        return NextResponse.json({ ok: true });
      }
      if (body.action === "soft" || body.action === "hard" || body.action === "reopen") {
        await transitionClose({
          entityId: entity.id,
          year,
          month,
          action: body.action,
          reason: body.reason,
          ticket: body.ticket,
        });
        return NextResponse.json({ ok: true });
      }
      throw new Error("Unknown action.");
    }

    const form = await request.formData();
    year = Number(form.get("year"));
    month = Number(form.get("month"));
    if (!year || !month) throw new Error("Pick a period first.");
    const action = String(form.get("action") ?? "upload");
    if (action === "map") {
      await rememberMap({
        entityId: entity.id,
        sourceSystem: code,
        sourceAccountNo: String(form.get("sourceAccountNo") ?? ""),
        label: String(form.get("label") ?? ""),
        accountCode: String(form.get("accountCode") ?? ""),
        year,
        month,
      });
      return wantsHtml ? back() : NextResponse.json({ ok: true });
    }
    if (action === "post") {
      await postCloseToBooks({ entityId: entity.id, year, month });
      return wantsHtml ? back() : NextResponse.json({ ok: true });
    }
    if (action === "reverse-operating") {
      if (String(form.get("confirm") ?? "") !== "yes") {
        throw new Error("Confirm the journals listed on the close page before reversing.");
      }
      await reverseOperatingJournals({
        entityId: entity.id,
        year,
        month,
        reason: String(form.get("reason") ?? ""),
      });
      return wantsHtml ? back() : NextResponse.json({ ok: true });
    }
    if (action === "set-tolerance") {
      await setTieOutTolerance({
        entityId: entity.id,
        key: String(form.get("key") ?? ""),
        cents: optionalBigint(form.get("cents")),
        bps: optionalInt(form.get("bps")),
        days: optionalInt(form.get("days")),
        year,
        month,
      });
      return wantsHtml ? back() : NextResponse.json({ ok: true });
    }
    if (action === "soft" || action === "hard" || action === "reopen") {
      await transitionClose({
        entityId: entity.id,
        year,
        month,
        action,
        reason: String(form.get("reason") ?? ""),
        ticket: String(form.get("ticket") ?? ""),
      });
      return wantsHtml ? back() : NextResponse.json({ ok: true });
    }
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) throw new Error("Drop at least one file.");
    const stored = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      stored.push(
        await storeCloseUpload({
          entityId: entity.id,
          entityCode: code,
          year,
          month,
          filename: file.name,
          mimeType: file.type,
          bytes,
        }),
      );
    }
    return NextResponse.json({ ok: true, files: stored });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Month-end close failed.";
    if (wantsHtml && !contentType.includes("application/json") && year && month) return back(message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
