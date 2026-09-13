import { XAI_API_BASE } from "./ai-enabled";

export type XaiChatMessage = { role: "system" | "user" | "assistant"; content: string };

function readSseDataLines(chunk: string): string[] {
  return chunk
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
}

function deltaFromPayload(raw: string): string {
  if (!raw || raw === "[DONE]") return "";
  try {
    const json = JSON.parse(raw) as {
      choices?: { delta?: { content?: string }; message?: { content?: string } }[];
    };
    return json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

export async function completeXai(opts: {
  apiKey: string;
  model: string;
  messages: XaiChatMessage[];
}): Promise<string> {
  const res = await fetch(`${XAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`xAI request failed (${res.status})`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function* streamXai(opts: {
  apiKey: string;
  model: string;
  messages: XaiChatMessage[];
}): AsyncGenerator<string> {
  const res = await fetch(`${XAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`xAI stream failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const data of readSseDataLines(part)) {
        const delta = deltaFromPayload(data);
        if (delta) yield delta;
      }
    }
  }
  if (buffer.trim()) {
    for (const data of readSseDataLines(buffer)) {
      const delta = deltaFromPayload(data);
      if (delta) yield delta;
    }
  }
}
