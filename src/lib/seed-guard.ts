import { timingSafeEqual } from "node:crypto";

export const SEED_SECRET_MIN_LENGTH = 16;

export function configuredSeedSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.SEED_SECRET?.trim() ?? "";
  if (secret.length < SEED_SECRET_MIN_LENGTH) return null;
  return secret;
}

export function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function readSeedSecretFromRequest(request: Request): string {
  const headerSecret = request.headers.get("x-seed-secret")?.trim();
  if (headerSecret) return headerSecret;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1]?.trim() ?? "";
}

export type SeedAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 404; error: string };

/**
 * Reject when SEED_SECRET is missing/too short or the caller secret is wrong.
 * A missing server secret returns 404 so the route is not advertised.
 */
export function authorizeSeedRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): SeedAuthResult {
  const expected = configuredSeedSecret(env);
  if (!expected) {
    return { ok: false, status: 404, error: "Not found" };
  }
  const provided = readSeedSecretFromRequest(request);
  if (!provided || !secretsEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
