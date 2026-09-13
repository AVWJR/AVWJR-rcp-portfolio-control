import type { DealFileSource, RemoteFile } from "../types";

export interface DealFileProvider {
  id: DealFileSource;
  label: string;
  isConfigured(): boolean;
  unconfiguredMessage(): string;
  listFiles?(query?: string): Promise<RemoteFile[]>;
  fetchFile?(id: string): Promise<{ bytes: Buffer; meta: RemoteFile }>;
}

export type ProviderStatus = {
  id: DealFileSource;
  label: string;
  configured: boolean;
  message: string;
};
