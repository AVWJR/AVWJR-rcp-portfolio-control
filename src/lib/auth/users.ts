import { assertSignedInOwner } from "@/lib/auth/actor";
import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/lib/auth/roles";
import { isAppRole, SCOPED_ROLES } from "@/lib/auth/roles";
import { assertPasswordStrength, hashPassword, verifyPassword } from "@/lib/auth/passwords";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function authenticateCredentials(email: string, password: string) {
  const user = await prisma.appUser.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user?.active || !user.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function bootstrapOwner(input: { email: string; password: string; name?: string }) {
  const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL ?? "");
  if (!ownerEmail) {
    throw new Error("OWNER_EMAIL is not set. Add the owner's email in Vercel, then redeploy.");
  }
  const email = normalizeEmail(input.email);
  if (email !== ownerEmail) {
    throw new Error("That email is not the owner email configured for first-time setup.");
  }
  assertPasswordStrength(input.password);
  const existing = await prisma.appUser.count();
  if (existing > 0) {
    throw new Error("An owner account already exists. Sign in instead.");
  }
  return prisma.appUser.create({
    data: {
      email,
      name: input.name?.trim() || "Owner",
      passwordHash: hashPassword(input.password),
      role: "OWNER",
      active: true,
    },
  });
}

async function replaceScopes(userId: string, role: AppRole, entityIds: string[]) {
  await prisma.userEntityScope.deleteMany({ where: { userId } });
  if (!SCOPED_ROLES.includes(role) || entityIds.length === 0) return;
  await prisma.userEntityScope.createMany({
    data: entityIds.map((entityId) => ({ userId, entityId })),
  });
}

export async function inviteUser(input: {
  email: string;
  name?: string;
  role: AppRole;
  password: string;
  entityIds?: string[];
}) {
  await assertSignedInOwner();
  if (!isAppRole(input.role)) throw new Error("Choose a role.");
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new Error("Enter a real email address.");
  assertPasswordStrength(input.password);
  const entityIds = input.entityIds ?? [];
  if (SCOPED_ROLES.includes(input.role) && entityIds.length === 0) {
    throw new Error("LP and lender viewers need at least one deal.");
  }
  const existing = await prisma.appUser.findUnique({ where: { email } });
  if (existing) throw new Error("That email already has an account.");
  const user = await prisma.appUser.create({
    data: {
      email,
      name: input.name?.trim() || email,
      passwordHash: hashPassword(input.password),
      role: input.role,
      active: true,
    },
  });
  await replaceScopes(user.id, input.role, entityIds);
  return user;
}

async function assertKeepsAnOwner(userId: string, nextRole: AppRole, nextActive: boolean) {
  if (nextActive && nextRole === "OWNER") return;
  const others = await prisma.appUser.count({
    where: { role: "OWNER", active: true, NOT: { id: userId } },
  });
  if (others === 0) throw new Error("Keep at least one active owner.");
}

export async function updateUser(input: {
  id: string;
  actorId: string;
  role?: AppRole;
  active?: boolean;
  password?: string;
  name?: string;
  entityIds?: string[];
}) {
  await assertSignedInOwner();
  const user = await prisma.appUser.findUnique({ where: { id: input.id } });
  if (!user) throw new Error("That user was not found.");
  if (input.active === false && input.id === input.actorId) {
    throw new Error("You cannot deactivate your own account.");
  }
  const nextRole = input.role ?? user.role;
  const nextActive = input.active ?? user.active;
  await assertKeepsAnOwner(user.id, nextRole, nextActive);
  if (input.password) assertPasswordStrength(input.password);
  const entityIds = input.entityIds;
  if (entityIds && SCOPED_ROLES.includes(nextRole) && entityIds.length === 0) {
    throw new Error("LP and lender viewers need at least one deal.");
  }
  const updated = await prisma.appUser.update({
    where: { id: user.id },
    data: {
      role: nextRole,
      active: nextActive,
      name: input.name?.trim() || undefined,
      passwordHash: input.password ? hashPassword(input.password) : undefined,
      deactivatedAt: nextActive ? null : user.deactivatedAt ?? new Date(),
    },
  });
  if (entityIds) await replaceScopes(user.id, nextRole, entityIds);
  return updated;
}

export async function listUsers() {
  return prisma.appUser.findMany({
    include: { scopes: { include: { entity: true } } },
    orderBy: [{ active: "desc" }, { email: "asc" }],
  });
}
