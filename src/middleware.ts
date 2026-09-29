import {
  ACCESS_COOKIE,
  accessControlEnabled,
  defaultRoleWhenGated,
  isViewerBlockedPath,
  partnerViewToken,
  principalPassword,
  readAccessRole,
  secretsMatch,
  signAccessRole,
  viewerForbiddenApi,
} from "@/lib/access";
import { legacyFlagMode } from "@/lib/auth/policy";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function hasUserSession(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get("authjs.session-token")?.value ||
      request.cookies.get("__Secure-authjs.session-token")?.value,
  );
}

function nextWithPath(request: NextRequest, role?: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-rcp-path", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (role) response.headers.set("x-rcp-role", role);
  return response;
}

function withRoleCookie(response: NextResponse, role: "principal" | "viewer") {
  response.cookies.set(ACCESS_COOKIE, signAccessRole(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (
    legacyFlagMode() === "off" ||
    hasUserSession(request) ||
    !accessControlEnabled() ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth")
  ) {
    return nextWithPath(request);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/unlock" ||
    pathname === "/partner"
  ) {
    return nextWithPath(request);
  }

  const share = searchParams.get("share") ?? searchParams.get("partner");
  const unlock = searchParams.get("unlock");
  if (share && secretsMatch(share, partnerViewToken())) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("share");
    clean.searchParams.delete("partner");
    return withRoleCookie(NextResponse.redirect(clean), "viewer");
  }
  if (unlock && secretsMatch(unlock, principalPassword())) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("unlock");
    return withRoleCookie(NextResponse.redirect(clean), "principal");
  }

  const role = readAccessRole(request.cookies.get(ACCESS_COOKIE)?.value) ?? defaultRoleWhenGated();
  if (role === "principal") return nextWithPath(request, "principal");

  if (isViewerBlockedPath(pathname)) {
    const dest = request.nextUrl.clone();
    dest.pathname = pathname.startsWith("/archive") ? "/" : "/deals";
    dest.searchParams.set("denied", pathname.startsWith("/archive") ? "archive" : "add_deal");
    if (pathname.startsWith("/admin")) dest.pathname = "/";
    return NextResponse.redirect(dest);
  }

  if (pathname.startsWith("/api/") && viewerForbiddenApi(pathname, request.method)) {
    return NextResponse.json(
      {
        error:
          "Partner view is read-only. Add Deal, delete/restore, seed, and uploads are disabled on this link.",
      },
      { status: 403 },
    );
  }

  return nextWithPath(request, "viewer");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
