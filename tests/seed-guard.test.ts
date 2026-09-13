import { describe, expect, it } from "vitest";
import {
  authorizeSeedRequest,
  configuredSeedSecret,
  readSeedSecretFromRequest,
  SEED_SECRET_MIN_LENGTH,
  secretsEqual,
} from "../src/lib/seed-guard";

const secret = "a".repeat(SEED_SECRET_MIN_LENGTH);

function request(init: { secret?: string; bearer?: string }) {
  const headers = new Headers();
  if (init.secret) headers.set("x-seed-secret", init.secret);
  if (init.bearer) headers.set("authorization", `Bearer ${init.bearer}`);
  return new Request("http://localhost/api/admin/seed", { method: "POST", headers });
}

describe("production seed guard", () => {
  it("treats missing or short SEED_SECRET as unconfigured", () => {
    expect(configuredSeedSecret({})).toBeNull();
    expect(configuredSeedSecret({ SEED_SECRET: "short" })).toBeNull();
    expect(configuredSeedSecret({ SEED_SECRET: secret })).toBe(secret);
  });

  it("compares secrets in constant time", () => {
    expect(secretsEqual(secret, secret)).toBe(true);
    expect(secretsEqual(secret, "b".repeat(SEED_SECRET_MIN_LENGTH))).toBe(false);
    expect(secretsEqual("abc", secret)).toBe(false);
  });

  it("reads Bearer or x-seed-secret", () => {
    expect(readSeedSecretFromRequest(request({ secret }))).toBe(secret);
    expect(readSeedSecretFromRequest(request({ bearer: secret }))).toBe(secret);
  });

  it("returns 404 when the server secret is missing so the route is not advertised", () => {
    const result = authorizeSeedRequest(request({ secret }), {});
    expect(result).toEqual({ ok: false, status: 404, error: "Not found" });
  });

  it("rejects a wrong secret", () => {
    const result = authorizeSeedRequest(request({ secret: "b".repeat(SEED_SECRET_MIN_LENGTH) }), {
      SEED_SECRET: secret,
    });
    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("accepts the configured secret", () => {
    expect(authorizeSeedRequest(request({ secret }), { SEED_SECRET: secret })).toEqual({ ok: true });
    expect(authorizeSeedRequest(request({ bearer: secret }), { SEED_SECRET: secret })).toEqual({ ok: true });
  });
});
