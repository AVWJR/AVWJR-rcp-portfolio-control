import type { DealFileProvider } from "./types";
import { emailConnectorConfigured } from "./email";

export function rcpMailboxAddress() {
  return process.env.RCP_INGEST_MAILBOX?.trim() || "";
}

export function rcpMailboxConfigured() {
  return Boolean(rcpMailboxAddress()) && emailConnectorConfigured();
}

export const rcpMailboxProvider: DealFileProvider = {
  id: "rcp_mailbox",
  label: "RCP mailbox auto-ingest",
  isConfigured: rcpMailboxConfigured,
  unconfiguredMessage() {
    const box = rcpMailboxAddress();
    if (!box) {
      return "The RCP-owned ingest mailbox address is not decided yet. When it exists, set RCP_INGEST_MAILBOX (server-only). Do not hardcode an address. Upload still works.";
    }
    return `Mailbox ${box} is recorded, but no Gmail/Microsoft connector token is configured. Scan is a no-op until a connector is added.`;
  },
};
