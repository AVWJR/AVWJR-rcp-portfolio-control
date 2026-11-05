import { assertSignedInOwner, AuthzError } from "@/lib/auth/actor";
import { isAppRole } from "@/lib/auth/roles";
import { inviteUser, listUsers, updateUser } from "@/lib/auth/users";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof AuthzError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 400 });
}

async function entityIdsFromCodes(codes: unknown): Promise<string[]> {
  const list = Array.isArray(codes) ? codes.map((code) => String(code).trim().toUpperCase()).filter(Boolean) : [];
  if (!list.length) return [];
  const rows = await prisma.entity.findMany({ where: { code: { in: list } }, select: { id: true } });
  if (rows.length !== list.length) throw new Error("One of those deal codes was not found.");
  return rows.map((row) => row.id);
}

export async function GET() {
  try {
    await assertSignedInOwner();
    const users = await listUsers();
    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        active: user.active,
        entities: user.scopes.map((scope) => scope.entity.code),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSignedInOwner();
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      role?: string;
      password?: string;
      entityCodes?: string[];
    };
    if (!body.role || !isAppRole(body.role)) throw new Error("Choose a role.");
    const user = await inviteUser({
      email: body.email ?? "",
      name: body.name,
      role: body.role,
      password: body.password ?? "",
      entityIds: await entityIdsFromCodes(body.entityCodes),
    });
    return NextResponse.json({ ok: true, id: user.id, email: user.email, role: user.role });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await assertSignedInOwner();
    const body = (await request.json()) as {
      id?: string;
      role?: string;
      active?: boolean;
      password?: string;
      name?: string;
      entityCodes?: string[];
    };
    if (!body.id) throw new Error("Missing user.");
    if (body.role && !isAppRole(body.role)) throw new Error("Choose a role.");
    const user = await updateUser({
      id: body.id,
      actorId: actor.userId ?? "",
      role: body.role && isAppRole(body.role) ? body.role : undefined,
      active: body.active,
      password: body.password,
      name: body.name,
      entityIds: body.entityCodes ? await entityIdsFromCodes(body.entityCodes) : undefined,
    });
    return NextResponse.json({ ok: true, id: user.id, role: user.role, active: user.active });
  } catch (error) {
    return jsonError(error);
  }
}
