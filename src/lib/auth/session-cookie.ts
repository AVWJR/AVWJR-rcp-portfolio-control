import { authSecretConfigured } from "@/lib/auth/policy";
import { getToken } from "next-auth/jwt";

/** Decrypts the Auth.js session cookie. A present but forged cookie is not a session. */
export async function readValidSessionUserId(request: Request): Promise<string | null> {
  if (!authSecretConfigured()) return null;
  const secret = (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  const secure = new URL(request.url).protocol === "https:";
  const token = await getToken({
    req: request,
    secret,
    secureCookie: secure,
  });
  const sub = token?.sub?.trim();
  return sub || null;
}
