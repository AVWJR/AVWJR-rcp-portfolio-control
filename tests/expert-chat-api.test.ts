import { POST } from "@/app/api/expert/chat/route";
import { validateChatBody } from "@/lib/expert/chat";
import { describe, expect, it } from "vitest";

describe("expert chat API validation", () => {
  it("rejects a missing JSON body", () => {
    expect(validateChatBody(null).ok).toBe(false);
    expect(validateChatBody("nope").ok).toBe(false);
  });

  it("rejects a malformed messages field", () => {
    const result = validateChatBody({ messages: "nope", context: { entityCode: "SPE-WBG" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/messages/i);
  });

  it("returns 400 when the POST body is not JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/JSON/i);
  });

  it("returns 400 when messages is not an array", async () => {
    const res = await POST(
      new Request("http://localhost/api/expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: { role: "user" }, context: { entityCode: "SPE-WBG" } }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/messages/i);
  });
});
