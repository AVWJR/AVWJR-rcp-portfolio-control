import { prisma } from "@/lib/prisma";

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

function line(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

export async function buildCloseAudit(entityCode: string, year: number, month: number) {
  const entity = await prisma.entity.findUnique({ where: { code: entityCode } });
  if (!entity) return null;
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId: entity.id, year, month } },
    include: { checklist: { orderBy: { sortOrder: "asc" } }, closeEvents: { orderBy: { createdAt: "asc" } } },
  });
  const events = await prisma.monthEndEvent.findMany({
    where: { entityId: entity.id, year, month },
    orderBy: { createdAt: "asc" },
  });
  const ids = new Set<string>();
  for (const id of [
    period?.preparedByUserId,
    period?.reviewedByUserId,
    ...((period?.checklist ?? []).flatMap((item) => [item.preparedByUserId, item.reviewedByUserId])),
    ...((period?.closeEvents ?? []).map((event) => event.actorUserId)),
    ...events.map((event) => event.actorUserId),
  ]) {
    if (id) ids.add(id);
  }
  const users = ids.size
    ? await prisma.appUser.findMany({ where: { id: { in: [...ids] } } })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  const nameOf = (id: string | null | undefined) => {
    if (!id) return "";
    const user = byId.get(id);
    return user ? `${user.name ?? user.email} <${user.email}>` : id;
  };
  return { entity, period, events, nameOf };
}

export async function closeAuditCsv(entityCode: string, year: number, month: number): Promise<string | null> {
  const audit = await buildCloseAudit(entityCode, year, month);
  if (!audit) return null;
  const rows = [
    line(["record", "code", "label", "prepared_by", "prepared_at", "reviewed_by", "reviewed_at", "owner_self_approve_reason", "action", "detail", "actor", "at"]),
  ];
  const period = audit.period;
  rows.push(
    line([
      "period",
      period?.label ?? `${year}-${String(month).padStart(2, "0")}`,
      audit.entity.code,
      audit.nameOf(period?.preparedByUserId),
      period?.preparedAt?.toISOString() ?? "",
      audit.nameOf(period?.reviewedByUserId),
      period?.reviewedAt?.toISOString() ?? "",
      period?.ownerSelfApproveReason ?? "",
      period?.status ?? "",
      "",
      "",
      "",
    ]),
  );
  for (const item of period?.checklist ?? []) {
    rows.push(
      line([
        "checklist",
        item.code,
        item.label,
        audit.nameOf(item.preparedByUserId),
        item.preparedAt?.toISOString() ?? "",
        audit.nameOf(item.reviewedByUserId),
        item.reviewedAt?.toISOString() ?? "",
        item.ownerSelfApproveReason ?? "",
        item.status,
        item.notes ?? "",
        "",
        "",
      ]),
    );
  }
  for (const event of period?.closeEvents ?? []) {
    rows.push(
      line([
        "close_event",
        event.action,
        "",
        "",
        "",
        "",
        "",
        event.reason ?? "",
        event.action,
        [event.reason, event.ticket].filter(Boolean).join(" · "),
        audit.nameOf(event.actorUserId),
        event.createdAt.toISOString(),
      ]),
    );
  }
  for (const event of audit.events) {
    rows.push(
      line([
        "month_end_event",
        event.action,
        "",
        "",
        "",
        "",
        "",
        "",
        event.action,
        event.detail,
        audit.nameOf(event.actorUserId),
        event.createdAt.toISOString(),
      ]),
    );
  }
  return rows.join("\n");
}
