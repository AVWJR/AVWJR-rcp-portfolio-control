import { currentAccessRole } from "@/lib/access-server";
import {
  ACCESS_COOKIE,
  accessControlEnabled,
  defaultRoleWhenGated,
  partnerViewToken,
  principalPassword,
  secretsMatch,
  signAccessRole,
  type AccessRole,
} from "@/lib/access";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const role = await currentAccessRole();
  return NextResponse.json({
    role,
    gated: accessControlEnabled(),
    partnerShareEnabled: Boolean(partnerViewToken()),
  });
}

export async function POST(request: Request) {
  if (!accessControlEnabled()) {
    return NextResponse.json({ role: "principal" as AccessRole, gated: false });
  }
  const body = (await request.json().catch(() => ({}))) as { share?: string; unlock?: string; action?: string };
  if (body.action === "signout") {
    const res = NextResponse.json({ role: defaultRoleWhenGated(), gated: true });
    res.cookies.delete(ACCESS_COOKIE);
    return res;
  }
  let role: AccessRole | null = null;
  if (body.unlock && secretsMatch(body.unlock, principalPassword())) role = "principal";
  else if (body.share && secretsMatch(body.share, partnerViewToken())) role = "viewer";
  if (!role) {
    return NextResponse.json({ error: "That password or share token is not valid." }, { status: 401 });
  }
  const res = NextResponse.json({ role, gated: true });
  res.cookies.set(ACCESS_COOKIE, signAccessRole(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
