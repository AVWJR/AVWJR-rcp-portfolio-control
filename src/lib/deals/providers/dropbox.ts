import type { RemoteFile } from "../types";
import type { DealFileProvider } from "./types";

function accessToken() {
  return process.env.DROPBOX_ACCESS_TOKEN?.trim() || "";
}

export function dropboxConfigured() {
  return Boolean(accessToken());
}

export const dropboxProvider: DealFileProvider = {
  id: "dropbox",
  label: "Import from Dropbox",
  isConfigured: dropboxConfigured,
  unconfiguredMessage() {
    if (process.env.DROPBOX_APP_KEY?.trim() && process.env.DROPBOX_APP_SECRET?.trim()) {
      return "Dropbox app keys are present, but no DROPBOX_ACCESS_TOKEN yet. Complete OAuth, then refresh this page to pick files.";
    }
    return "Connect Dropbox by setting a server-only DROPBOX_ACCESS_TOKEN (or DROPBOX_APP_KEY + DROPBOX_APP_SECRET for OAuth). Upload from this computer still works.";
  },
  async listFiles(query) {
    if (!dropboxConfigured()) {
      throw new Error(dropboxProvider.unconfiguredMessage());
    }
    const res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: query?.startsWith("/") ? query : "",
        recursive: false,
        limit: 50,
        include_non_downloadable_files: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Dropbox list failed (${res.status}): ${text.slice(0, 180)}`);
    }
    const json = (await res.json()) as {
      entries?: { ".tag"?: string; id?: string; name?: string; path_lower?: string; size?: number }[];
    };
    return (json.entries ?? [])
      .filter((row) => row[".tag"] === "file" && row.path_lower)
      .map((row) => ({
        id: row.path_lower ?? row.id ?? row.name ?? "",
        name: row.name ?? "dropbox-file",
        byteSize: row.size,
        path: row.path_lower,
      } satisfies RemoteFile));
  },
  async fetchFile(id) {
    if (!dropboxConfigured()) {
      throw new Error(dropboxProvider.unconfiguredMessage());
    }
    const res = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Dropbox-API-Arg": JSON.stringify({ path: id }),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Dropbox download failed (${res.status}): ${text.slice(0, 180)}`);
    }
    const apiMeta = res.headers.get("dropbox-api-result");
    let name = id.split("/").pop() || "dropbox-file";
    if (apiMeta) {
      try {
        const parsed = JSON.parse(apiMeta) as { name?: string };
        if (parsed.name) name = parsed.name;
      } catch {
        // keep fallback name
      }
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      bytes,
      meta: { id, name, byteSize: bytes.length, mimeType: res.headers.get("content-type") ?? undefined },
    };
  },
};
