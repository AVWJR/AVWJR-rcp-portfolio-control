import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 10;

export function assertPasswordStrength(password: string): void {
  if (password.trim().length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
}

export function hashPassword(password: string): string {
  assertPasswordStrength(password);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
