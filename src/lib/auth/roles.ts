export const APP_ROLES = [
  "OWNER",
  "CONTROLLER",
  "PREPARER",
  "REVIEWER",
  "LP_VIEWER",
  "LENDER_VIEWER",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type Capability =
  | "users.admin"
  | "close.upload"
  | "close.map"
  | "close.post"
  | "close.override"
  | "close.soft"
  | "close.hard"
  | "close.reopen"
  | "close.sign_prepare"
  | "close.sign_review"
  | "ledger.post"
  | "waterfall.write"
  | "upload.write"
  | "archive.write"
  | "deals.write"
  | "scheduler.run"
  | "read";

const ALL_CAPABILITIES: Capability[] = [
  "users.admin",
  "close.upload",
  "close.map",
  "close.post",
  "close.override",
  "close.soft",
  "close.hard",
  "close.reopen",
  "close.sign_prepare",
  "close.sign_review",
  "ledger.post",
  "waterfall.write",
  "upload.write",
  "archive.write",
  "deals.write",
  "scheduler.run",
  "read",
];

export const ROLE_CAPABILITIES: Record<AppRole, Capability[]> = {
  OWNER: ALL_CAPABILITIES,
  CONTROLLER: ALL_CAPABILITIES.filter((capability) => capability !== "users.admin"),
  PREPARER: [
    "read",
    "close.upload",
    "close.map",
    "close.post",
    "close.soft",
    "close.sign_prepare",
    "ledger.post",
    "upload.write",
  ],
  REVIEWER: ["read", "close.sign_review"],
  LP_VIEWER: ["read"],
  LENDER_VIEWER: ["read"],
};

export const SCOPED_ROLES: AppRole[] = ["LP_VIEWER", "LENDER_VIEWER"];

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

export function roleAllows(role: AppRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function roleLabel(role: AppRole | null | undefined): string {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "CONTROLLER":
      return "Controller";
    case "PREPARER":
      return "Preparer";
    case "REVIEWER":
      return "Reviewer";
    case "LP_VIEWER":
      return "LP viewer";
    case "LENDER_VIEWER":
      return "Lender viewer";
    default:
      return "This account";
  }
}

export function capabilityVerb(capability: Capability): string {
  switch (capability) {
    case "users.admin":
      return "manage users";
    case "close.upload":
      return "upload a month-end file";
    case "close.map":
      return "map an account";
    case "close.post":
      return "post a month-end package";
    case "close.override":
      return "override a soft-closed month";
    case "close.soft":
      return "soft-close a month";
    case "close.hard":
      return "hard-lock a month";
    case "close.reopen":
      return "reopen a locked month";
    case "close.sign_prepare":
      return "sign as preparer";
    case "close.sign_review":
      return "sign as reviewer";
    case "ledger.post":
      return "post a journal";
    case "waterfall.write":
      return "change the waterfall";
    case "upload.write":
      return "upload files";
    case "archive.write":
      return "archive or restore a deal";
    case "deals.write":
      return "create a deal";
    case "scheduler.run":
      return "run a scheduled pack";
    case "read":
      return "open this";
  }
}

export function closeActionCapabilities(action: string, controllerOverride: boolean): Capability[] {
  switch (action) {
    case "upload":
      return ["close.upload"];
    case "map":
      return ["close.map"];
    case "post":
    case "reverse-operating":
      return controllerOverride ? ["close.post", "close.override"] : ["close.post"];
    case "set-tolerance":
      return ["close.post"];
    case "soft":
      return ["close.soft"];
    case "hard":
      return ["close.hard"];
    case "reopen":
      return ["close.reopen"];
    case "sign-prepare":
    case "sign-prepare-all":
      return ["close.sign_prepare"];
    case "sign-review":
    case "sign-review-all":
      return ["close.sign_review"];
    default:
      return ["close.upload"];
  }
}
