import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/users";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_AFTER = 5;

export class LoginLockedError extends Error {
  readonly status = 429;
  constructor() {
    super("Too many failed sign-in attempts. Wait 15 minutes and try again.");
    this.name = "LoginLockedError";
  }
}

function emailBucket(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

function ipBucket(ip: string): string {
  return `ip:${ip.trim() || "unknown"}`;
}

export function clientIpFrom(request: Request | undefined): string {
  if (!request) return "unknown";
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function recentFailures(bucket: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS);
  return prisma.authLoginFailure.count({ where: { bucket, createdAt: { gte: since } } });
}

export async function assertLoginAllowed(email: string, ip: string): Promise<void> {
  const [byEmail, byIp] = await Promise.all([recentFailures(emailBucket(email)), recentFailures(ipBucket(ip))]);
  if (byEmail >= LOCK_AFTER || byIp >= LOCK_AFTER) throw new LoginLockedError();
}

export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await prisma.authLoginFailure.createMany({
    data: [{ bucket: emailBucket(email) }, { bucket: ipBucket(ip) }],
  });
}

export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  await prisma.authLoginFailure.deleteMany({
    where: { bucket: { in: [emailBucket(email), ipBucket(ip)] } },
  });
}
