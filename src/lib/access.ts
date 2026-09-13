function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function hexHmac(secret: string, value: string): string {
  const key = new TextEncoder().encode(secret);
  const msg = new TextEncoder().encode(value);
  let hash = 2166136261;
  for (const byte of [...key, ...msg]) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(4).slice(0, 32);
}

export const ACCESS_COOKIE = "rcp_access";
export type AccessRole = "principal" | "viewer";

export function partnerViewToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.PARTNER_VIEW_TOKEN?.trim() || env.VIEWER_PASSWORD?.trim() || "";
  return token.length >= 8 ? token : null;
}

export function principalPassword(env: NodeJS.ProcessEnv = process.env): string | null {
  const password = env.PRINCIPAL_PASSWORD?.trim() || "";
  return password.length >= 8 ? password : null;
}

export function accessControlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(partnerViewToken(env) || principalPassword(env));
}

function signingSecret(env: NodeJS.ProcessEnv = process.env): string {
  return principalPassword(env) || partnerViewToken(env) || "rcp-access-disabled";
}

export function signAccessRole(role: AccessRole, env: NodeJS.ProcessEnv = process.env): string {
  return `${role}.${hexHmac(signingSecret(env), role)}`;
}

export function readAccessRole(cookieValue: string | undefined | null, env: NodeJS.ProcessEnv = process.env): AccessRole | null {
  if (!cookieValue) return null;
  const [role] = cookieValue.split(".");
  if (role !== "principal" && role !== "viewer") return null;
  const expected = signAccessRole(role, env);
  return safeEqual(cookieValue, expected) ? role : null;
}

export function secretsMatch(provided: string, expected: string | null): boolean {
  if (!expected) return false;
  return safeEqual(provided, expected);
}

export function defaultRoleWhenGated(): AccessRole {
  return "viewer";
}

export function isMutatingMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function isViewerBlockedPath(pathname: string): boolean {
  if (pathname === "/deals/new" || pathname.startsWith("/deals/new/")) return true;
  if (pathname === "/admin/seed" || pathname.startsWith("/admin/")) return true;
  return false;
}

export function isViewerAllowedMutation(pathname: string): boolean {
  return pathname === "/api/access" || pathname.startsWith("/api/expert/");
}

export function viewerForbiddenApi(pathname: string, method: string): boolean {
  if (!isMutatingMethod(method)) return false;
  if (isViewerAllowedMutation(pathname)) return false;
  return true;
}

export function partnerSharePath(origin: string, token: string): string {
  const url = new URL("/", origin);
  url.searchParams.set("share", token);
  return url.toString();
}
