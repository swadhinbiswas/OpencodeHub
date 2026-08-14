/**
 * Contract: OAuth provider primitives (WS4-02)
 *
 * Guards the token/code hashing + access-token issuance used by the
 * authorization-code flow.
 */
import { describe, expect, it } from "vitest";
import {
  hashClientSecret,
  generateClientCredentials,
  generateAuthCode,
  issueAccessToken,
  verifyAccessToken,
  OAUTH_SCOPES,
} from "@/lib/oauth-provider";

describe("OAuth provider contract", () => {
  it("exposes a stable scope vocabulary", () => {
    expect(OAUTH_SCOPES).toContain("user:read");
    expect(OAUTH_SCOPES).toContain("repo:read");
    expect(OAUTH_SCOPES).toContain("repo:write");
    expect(OAUTH_SCOPES).toContain("notifications");
  });

  it("client credentials are unique and secrets are not stored in plaintext", () => {
    const a = generateClientCredentials();
    const b = generateClientCredentials();
    expect(a.clientId).not.toBe(b.clientId);
    expect(a.clientSecret).not.toBe(b.clientSecret);
    expect(a.clientSecret.length).toBeGreaterThanOrEqual(32);
    const hash = hashClientSecret(a.clientSecret);
    expect(hash).not.toContain(a.clientSecret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClientSecret(a.clientSecret)).toBe(hash); // deterministic
    expect(hashClientSecret(a.clientSecret)).not.toBe(hashClientSecret(b.clientSecret));
  });

  it("authorization codes are high-entropy and unique", () => {
    const a = generateAuthCode();
    const b = generateAuthCode();
    expect(a).not.toBe(b);
    expect(Buffer.byteLength(a)).toBeGreaterThanOrEqual(32);
  });

  it("issues verifiable access tokens with scope + app claims", async () => {
    process.env.JWT_SECRET = "test-secret-for-oauth-contract";
    const token = await issueAccessToken({
      userId: "user-1",
      appId: "app-1",
      scopes: ["repo:read"],
    });
    expect(token.split(".")).toHaveLength(3);

    const payload = await verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-1");
    expect(payload!.appId).toBe("app-1");
    expect(payload!.scopes).toEqual(["repo:read"]);
  });

  it("rejects tampered or foreign tokens", async () => {
    process.env.JWT_SECRET = "test-secret-for-oauth-contract";
    const token = await issueAccessToken({
      userId: "user-2",
      appId: "app-2",
      scopes: [],
    });
    // Tamper with the payload
    const [h, p, s] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", type: "oauth_access", appId: "app-2", scopes: [] }),
    ).toString("base64url");
    const tampered = `${h}.${tamperedPayload}.${s}`;
    expect(await verifyAccessToken(tampered)).toBeNull();
    // Non-oauth JWT should be rejected
    expect(await verifyAccessToken("not-a-jwt")).toBeNull();
  });
});
