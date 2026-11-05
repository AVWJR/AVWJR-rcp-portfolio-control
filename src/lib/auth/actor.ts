import { ACCESS_COOKIE, readAccessRole } from "@/lib/access";
import type { AppRole, Capability } from "@/lib/auth/roles";
import { capabilityVerb, roleAllows, roleLabel, SCOPED_ROLES } from "@/lib/auth/roles";
import { decideAccess, legacyFlagMode, ownerBootstrapConfigured, partnerGateConfigured } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export type ActorKind = "user" | "legacy-principal" | "legacy-viewer" | "deactivated" | "anonymous";

export type Actor = {
  kind: ActorKind;
  userId: string | null;
  email: string | null;
  name: string | null;
  role: AppRole | null;
  /** null means every entity. An array is the allow-list for LP and lender viewers. */
  entityIds: string[] | null;
};

export class AuthzError extends Error {
  readonly status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
  }
}

type Denial = { status: 401 | 403; message: string };

let testActorId: string | null = null;

export function setTestActor(userId: string | null): void {
  if (process.env.VITEST !== "true" || process.env.NODE_ENV === "production") {
    throw new Error("Test actors are only available under Vitest.");
  }
  testActorId = userId;
}

function anonymous(): Actor {
  return { kind: "anonymous", userId: null, email: null, name: null, role: null, entityIds: null };
}

function legacyPrincipal(): Actor {
  return { kind: "legacy-principal", userId: null, email: null, name: "Principal", role: null, entityIds: null };
}

function legacyViewer(): Actor {
  return { kind: "legacy-viewer", userId: null, email: null, name: "Partner view", role: null, entityIds: null };
}

function userActor(user: {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  active: boolean;
  scopes: { entityId: string }[];
}): Actor {
  if (!user.active) {
    return {
      kind: "deactivated",
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      entityIds: null,
    };
  }
  const scoped = SCOPED_ROLES.includes(user.role);
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    entityIds: scoped ? user.scopes.map((scope) => scope.entityId) : null,
  };
}

export function denialFor(actor: Actor, capability: Capability, entityId: string | null): Denial | null {
  if (actor.kind === "anonymous") {
    return { status: 401, message: "Sign in is required." };
  }
  if (actor.kind === "deactivated") {
    return { status: 403, message: "This account is deactivated. Ask the owner to turn it back on." };
  }
  if (actor.kind === "legacy-principal") {
    if (capability === "users.admin") {
      return { status: 403, message: "Only a signed-in owner can manage users." };
    }
    return null;
  }
  if (actor.kind === "legacy-viewer") {
    if (capability === "read") return null;
    return { status: 403, message: "Partner view is read-only." };
  }
  if (!actor.role || !roleAllows(actor.role, capability)) {
    return { status: 403, message: `${roleLabel(actor.role)} cannot ${capabilityVerb(capability)}.` };
  }
  if (entityId && actor.entityIds && !actor.entityIds.includes(entityId)) {
    return { status: 403, message: "This account is not allowed to open that deal." };
  }
  return null;
}

export function canSeeEntity(actor: Actor, entityId: string): boolean {
  return denialFor(actor, "read", entityId) === null;
}

async function readLegacyRole(): Promise<"principal" | "viewer" | null> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return readAccessRole(jar.get(ACCESS_COOKIE)?.value);
  } catch {
    return null;
  }
}

async function sessionActor(): Promise<Actor | null> {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return null;
    const user = await prisma.appUser.findUnique({ where: { id }, include: { scopes: true } });
    if (!user) return null;
    return userActor(user);
  } catch {
    return null;
  }
}

export async function resolveActor(): Promise<Actor> {
  if (process.env.VITEST === "true" && testActorId) {
    const user = await prisma.appUser.findUnique({ where: { id: testActorId }, include: { scopes: true } });
    if (!user) return anonymous();
    return userActor(user);
  }

  if (process.env.VITEST !== "true") {
    const session = await sessionActor();
    if (session) return session;
  }

  const userCount = await prisma.appUser.count();
  const decision = decideAccess({
    flag: legacyFlagMode(),
    userCount,
    bootstrapConfigured: ownerBootstrapConfigured(),
    partnerGateConfigured: partnerGateConfigured(),
    hasSession: false,
    legacyRole: await readLegacyRole(),
  });
  if (decision === "legacy-principal") return legacyPrincipal();
  if (decision === "legacy-viewer") return legacyViewer();
  return anonymous();
}

export async function actingUserId(): Promise<string | null> {
  const actor = await resolveActor();
  return actor.kind === "user" ? actor.userId : null;
}

/** Owner actions require a real account. The shared partner principal cannot invite anyone. */
export async function assertSignedInOwner(): Promise<Actor> {
  const actor = await resolveActor();
  if (actor.kind !== "user" || actor.role !== "OWNER" || !actor.userId) {
    const status = actor.kind === "anonymous" ? 401 : 403;
    throw new AuthzError("Only a signed-in owner can manage users.", status);
  }
  return actor;
}

export async function visibleEntityCodes(actor: Actor): Promise<Set<string> | null> {
  if (!actor.entityIds) return null;
  if (actor.entityIds.length === 0) return new Set();
  const rows = await prisma.entity.findMany({
    where: { id: { in: actor.entityIds } },
    select: { code: true },
  });
  return new Set(rows.map((row) => row.code));
}

export async function assertCan(capability: Capability, entityId?: string | null): Promise<Actor> {
  const actor = await resolveActor();
  const denial = denialFor(actor, capability, entityId ?? null);
  if (denial) throw new AuthzError(denial.message, denial.status);
  return actor;
}

export async function assertCanAll(capabilities: Capability[], entityId?: string | null): Promise<Actor> {
  let actor: Actor | null = null;
  for (const capability of capabilities) {
    actor = await assertCan(capability, entityId);
  }
  return actor ?? (await resolveActor());
}

export async function enforce(capability: Capability, entityId?: string | null): Promise<Response | null> {
  try {
    await assertCan(capability, entityId);
    return null;
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function enforceAll(capabilities: Capability[], entityId?: string | null): Promise<Response | null> {
  for (const capability of capabilities) {
    const denied = await enforce(capability, entityId);
    if (denied) return denied;
  }
  return null;
}

export function isAuthzError(error: unknown): error is AuthzError {
  return error instanceof AuthzError;
}
