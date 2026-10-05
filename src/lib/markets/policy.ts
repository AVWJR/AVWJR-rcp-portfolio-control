import type { AccessRole } from "@/lib/access";
import { accessControlEnabled } from "@/lib/access";
import type { AppEnv } from "@/lib/env";
import {
  MARKETS_LOOPNET,
  MARKETS_NAME,
  MARKETS_NO_CREDENTIALS,
  MARKETS_PUBLISHER,
  MARKETS_PUBLIC_SOURCE,
  MARKETS_URL,
  type LicenseBasis,
  type SourceStatus,
} from "./types";

export class MarketsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MarketsError";
    this.status = status;
  }
}

const CREDENTIAL_KEYS = new Set([
  "apikey",
  "api_key",
  "password",
  "secret",
  "token",
  "credential",
  "credentials",
  "key",
]);

const EXCLUDED_NAME = /loop\s*net/i;

export function marketsRoleAllowed(role: AccessRole | null, controlEnabled: boolean): boolean {
  if (!controlEnabled) return true;
  return role === "principal";
}

export function marketsAccessDenied(role: AccessRole, env: AppEnv = process.env): boolean {
  return !marketsRoleAllowed(role, accessControlEnabled(env));
}

/** Preview shares the production database and must not write tables this deploy did not add. */
export function marketSeedWritesAllowed(env: AppEnv = process.env): boolean {
  if (env.VERCEL === "1" && env.VERCEL_ENV !== "production") return false;
  return true;
}

/** The official score reads public active series only. Inactive and license-required rows stay out. */
export function sourceFeedsOfficialScore(source: { licenseBasis: string; status: string }): boolean {
  return source.licenseBasis === "public" && source.status === "active";
}

export type PaidSourceInput = {
  name: string;
  publisher: string;
  url: string;
  termsUrl: string;
  costNotes: string;
  licenseStatus: SourceStatus;
};

export function assertNoCredentialFields(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) {
    const normalized = key.toLowerCase().replace(/-/g, "_");
    if (CREDENTIAL_KEYS.has(normalized)) {
      throw new MarketsError(MARKETS_NO_CREDENTIALS, 400);
    }
  }
}

function cleanLink(raw: string, label: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value) || value.includes(" ") || /:\/\/[^/]*@/.test(value)) {
    throw new MarketsError(label, 400);
  }
  return value;
}

export function parsePaidSourceInput(body: Record<string, unknown>): PaidSourceInput {
  assertNoCredentialFields(body);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const publisher = typeof body.publisher === "string" ? body.publisher.trim() : "";
  const url = typeof body.url === "string" ? body.url : "";
  const termsUrl = typeof body.termsUrl === "string" ? body.termsUrl : "";
  const costNotes = typeof body.costNotes === "string" ? body.costNotes.trim() : "";
  if (!name) throw new MarketsError(MARKETS_NAME, 400);
  if (name.length > 160) throw new MarketsError(MARKETS_NAME, 400);
  if (!publisher) throw new MarketsError(MARKETS_PUBLISHER, 400);
  if (publisher.length > 160) throw new MarketsError(MARKETS_PUBLISHER, 400);
  if (costNotes.length > 500) throw new MarketsError("Cost notes are too long.", 400);
  const blob = `${name} ${publisher} ${url} ${termsUrl}`;
  if (EXCLUDED_NAME.test(blob)) throw new MarketsError(MARKETS_LOOPNET, 400);
  const statusRaw = typeof body.licenseStatus === "string" ? body.licenseStatus : "inactive";
  const licenseStatus: SourceStatus = statusRaw === "pending_license" ? "pending_license" : "inactive";
  return {
    name,
    publisher,
    url: cleanLink(url, MARKETS_URL),
    termsUrl: cleanLink(termsUrl, MARKETS_URL),
    costNotes,
    licenseStatus,
  };
}

export function paidRegistrationFields(input: PaidSourceInput): {
  licenseBasis: LicenseBasis;
  status: SourceStatus;
  automationAllowed: false;
  paywalled: true;
} {
  return {
    licenseBasis: "license_required",
    status: input.licenseStatus === "pending_license" ? "pending_license" : "inactive",
    automationAllowed: false,
    paywalled: true,
  };
}

export function refuseProtectedPublicSource(source: { licenseBasis: string }): void {
  if (source.licenseBasis !== "license_required") throw new MarketsError(MARKETS_PUBLIC_SOURCE, 409);
}
