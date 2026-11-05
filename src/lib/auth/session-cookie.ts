import { authSecretConfigured } from "@/lib/auth/policy";
import { getToken } from "next-auth/jwt";

export type SignedSession = { id: string; role: string | null };

async function readSessionToken(request: Request) {
  if (!authSecretConfigured()) return null;
  const secret = (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  const secure = new URL(request.url).protocol === "https:";
  return getToken({
    req: request,
    secret,
    secureCookie: secure,
  });
}

/** Decrypts the Auth.js session cookie. A present but forged cookie is not a session. */
export async function readValidSession(request: Request): Promise<SignedSession | null> {
  const token = await readSessionToken(request);
  const id = token?.sub?.trim();
  if (!id) return null;
  const role = typeof token?.role === "string" ? token.role.trim() : "";
  return { id, role: role || null };
}

export async function readValidSessionUserId(request: Request): Promise<string | null> {
  const session = await readValidSession(request);
  return session?.id ?? null;
}
