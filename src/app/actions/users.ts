"use server";

import { assertCan } from "@/lib/auth/actor";
import { isAppRole } from "@/lib/auth/roles";
import { inviteUser, updateUser } from "@/lib/auth/users";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function entityIds(formData: FormData): Promise<string[]> {
  const codes = formData
    .getAll("entityCode")
    .map((value) => String(value).trim().toUpperCase())
    .filter(Boolean);
  if (!codes.length) return [];
  const rows = await prisma.entity.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  if (rows.length !== codes.length) throw new Error("One of those deal codes was not found.");
  return rows.map((row) => row.id);
}

export async function inviteUserAction(formData: FormData) {
  const actor = await assertCan("users.admin");
  if (!actor.userId) throw new Error("Sign in as the owner.");
  const role = String(formData.get("role") ?? "");
  if (!isAppRole(role)) throw new Error("Choose a role.");
  await inviteUser({
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    role,
    password: String(formData.get("password") ?? ""),
    entityIds: await entityIds(formData),
  });
  revalidatePath("/admin/users");
}

export async function updateUserAction(formData: FormData) {
  const actor = await assertCan("users.admin");
  if (!actor.userId) throw new Error("Sign in as the owner.");
  const roleRaw = String(formData.get("role") ?? "");
  const active = String(formData.get("active") ?? "yes") === "yes";
  const password = String(formData.get("password") ?? "");
  await updateUser({
    id: String(formData.get("id") ?? ""),
    actorId: actor.userId,
    role: isAppRole(roleRaw) ? roleRaw : undefined,
    active,
    password: password.trim() ? password : undefined,
    name: String(formData.get("name") ?? ""),
    entityIds: await entityIds(formData),
  });
  revalidatePath("/admin/users");
}
