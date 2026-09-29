import { accessControlEnabled } from "@/lib/access";
import type { AppEnv } from "@/lib/env";

export type LegacyFlagMode = "on" | "off" | "auto";

export type AccessDecision = "session" | "legacy-principal" | "legacy-viewer" | "anonymous";

export function legacyFlagMode(env: AppEnv = process.env): LegacyFlagMode {
  const flag = (env.LEGACY_PARTNER_TOKEN ?? "").trim().toLowerCase();
  if (["1", "true", "on", "yes", "enabled"].includes(flag)) return "on";
  if (["0", "false", "off", "no", "disabled"].includes(flag)) return "off";
  return "auto";
}

export function ownerBootstrapConfigured(env: AppEnv = process.env): boolean {
  const email = env.OWNER_EMAIL?.trim() ?? "";
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim() || "";
  return email.includes("@") && secret.length >= 16;
}

export function authSecretConfigured(env: AppEnv = process.env): boolean {
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim() || "";
  return secret.length >= 16;
}

/**
 * Who is allowed when there is no Auth.js session yet.
 * The old partner token stays on until a user exists, unless the flag forces it.
 */
export function decideAccess(input: {
  flag: LegacyFlagMode;
  userCount: number;
  bootstrapConfigured: boolean;
  partnerGateConfigured: boolean;
  hasSession: boolean;
  legacyRole: "principal" | "viewer" | null;
}): AccessDecision {
  if (input.hasSession) return "session";
  const legacyOn = input.flag === "on" ? true : input.flag === "off" ? false : input.userCount === 0;
  if (!legacyOn) return "anonymous";
  if (input.flag === "auto" && input.userCount === 0 && input.bootstrapConfigured && !input.partnerGateConfigured) {
    return "anonymous";
  }
  if (!input.partnerGateConfigured) return "legacy-principal";
  if (input.legacyRole === "principal") return "legacy-principal";
  return "legacy-viewer";
}

export function partnerGateConfigured(env: AppEnv = process.env): boolean {
  return accessControlEnabled(env);
}
