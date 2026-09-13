import type { DealFileProvider } from "./types";

export const uploadProvider: DealFileProvider = {
  id: "upload",
  label: "Upload files",
  isConfigured() {
    return true;
  },
  unconfiguredMessage() {
    return "Upload from this computer is ready. Drop files or use Choose files.";
  },
};
