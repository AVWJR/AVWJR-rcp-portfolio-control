import type { DealFileSource } from "../types";
import { dropboxProvider } from "./dropbox";
import { emailAttachmentProvider } from "./email";
import { rcpMailboxProvider } from "./rcp-mailbox";
import type { DealFileProvider, ProviderStatus } from "./types";
import { uploadProvider } from "./upload";

export const DEAL_FILE_PROVIDERS: DealFileProvider[] = [
  uploadProvider,
  dropboxProvider,
  emailAttachmentProvider,
  rcpMailboxProvider,
];

export function getDealFileProvider(id: DealFileSource) {
  return DEAL_FILE_PROVIDERS.find((p) => p.id === id);
}

export function listProviderStatus(): ProviderStatus[] {
  return DEAL_FILE_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: provider.isConfigured(),
    message: provider.isConfigured()
      ? `${provider.label} is connected.`
      : provider.unconfiguredMessage(),
  }));
}

export { dropboxProvider, emailAttachmentProvider, rcpMailboxProvider, uploadProvider };
export { extractEmlAttachments } from "./email";
export { rcpMailboxAddress } from "./rcp-mailbox";
export type { DealFileProvider, ProviderStatus } from "./types";
