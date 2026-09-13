import type { RemoteFile } from "../types";
import type { DealFileProvider } from "./types";

function gmailToken() {
  return process.env.GMAIL_ACCESS_TOKEN?.trim() || process.env.GOOGLE_ACCESS_TOKEN?.trim() || "";
}

function microsoftToken() {
  return process.env.MICROSOFT_ACCESS_TOKEN?.trim() || process.env.MS_GRAPH_ACCESS_TOKEN?.trim() || "";
}

export function emailConnectorConfigured() {
  return Boolean(gmailToken() || microsoftToken());
}

export const emailAttachmentProvider: DealFileProvider = {
  id: "email_attachment",
  label: "Email attachment",
  isConfigured: emailConnectorConfigured,
  unconfiguredMessage() {
    return "No mailbox connector is configured. Upload the attachment files (or a .eml message) here. To fetch from Gmail or Microsoft, set a server-only GMAIL_ACCESS_TOKEN or MICROSOFT_ACCESS_TOKEN.";
  },
  async listFiles(query) {
    const gmail = gmailToken();
    if (gmail) return listGmail(gmail, query);
    const ms = microsoftToken();
    if (ms) return listMicrosoft(ms, query);
    throw new Error(emailAttachmentProvider.unconfiguredMessage());
  },
  async fetchFile(id) {
    const gmail = gmailToken();
    if (gmail) return fetchGmail(gmail, id);
    const ms = microsoftToken();
    if (ms) return fetchMicrosoft(ms, id);
    throw new Error(emailAttachmentProvider.unconfiguredMessage());
  },
};

async function listGmail(token: string, query?: string): Promise<RemoteFile[]> {
  const q = encodeURIComponent(query?.trim() || "has:attachment");
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=15`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail list failed (${res.status}). Re-authorize the mailbox connector.`);
  }
  const json = (await res.json()) as { messages?: { id: string }[] };
  const out: RemoteFile[] = [];
  for (const msg of json.messages ?? []) {
    const detail = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!detail.ok) continue;
    const body = (await detail.json()) as {
      payload?: { headers?: { name: string; value: string }[] };
    };
    const subject = body.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? msg.id;
    out.push({ id: msg.id, name: subject, mimeType: "message/rfc822" });
  }
  return out;
}

async function fetchGmail(token: string, id: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail fetch failed (${res.status}).`);
  const json = (await res.json()) as { raw?: string };
  if (!json.raw) throw new Error("Gmail message had no raw payload.");
  const bytes = Buffer.from(json.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return { bytes, meta: { id, name: `${id}.eml`, mimeType: "message/rfc822", byteSize: bytes.length } };
}

async function listMicrosoft(token: string, query?: string): Promise<RemoteFile[]> {
  const filter = query?.trim()
    ? `$search="${query.replace(/"/g, "")}"`
    : "$filter=hasAttachments eq true";
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${filter}&$top=15&$select=id,subject`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Microsoft mail list failed (${res.status}). Re-authorize the mailbox connector.`);
  const json = (await res.json()) as { value?: { id: string; subject?: string }[] };
  return (json.value ?? []).map((row) => ({
    id: row.id,
    name: row.subject || row.id,
    mimeType: "message/rfc822",
  }));
}

async function fetchMicrosoft(token: string, id: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${id}/$value`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Microsoft mail fetch failed (${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, meta: { id, name: `${id}.eml`, mimeType: "message/rfc822", byteSize: bytes.length } };
}

/** Best-effort .eml attachment extraction (multipart + base64). */
export function extractEmlAttachments(raw: Buffer): { filename: string; mimeType: string; bytes: Buffer }[] {
  const text = raw.toString("utf8");
  const parts = text.split(/\n--[^\n]+/);
  const out: { filename: string; mimeType: string; bytes: Buffer }[] = [];
  for (const part of parts) {
    const nameMatch = /filename\*?=(?:UTF-8''|"?)([^";\r\n]+)"?/i.exec(part);
    if (!nameMatch) continue;
    const filename = decodeURIComponent(nameMatch[1].replace(/"/g, "").trim());
    const mime = /Content-Type:\s*([^;\r\n]+)/i.exec(part)?.[1]?.trim() || "application/octet-stream";
    const encoded = part.split(/\r?\n\r?\n/).slice(1).join("\n").replace(/\s+/g, "");
    if (!encoded) continue;
    try {
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length > 0) out.push({ filename, mimeType: mime, bytes });
    } catch {
      // skip malformed part
    }
  }
  return out;
}
