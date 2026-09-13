import type { ExpertStreamEvent } from "./types";

export const EXPERT_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export function encodeExpertStream(events: AsyncIterable<ExpertStreamEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export function parseExpertStreamLine(line: string): ExpertStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as ExpertStreamEvent;
    if (parsed && typeof parsed === "object" && "type" in parsed) return parsed;
  } catch {
    return null;
  }
  return null;
}
