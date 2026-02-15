import { describe, expect, it } from "vitest";
import {
  getTokenPrefixForDisplay,
  hashPersonalAccessToken,
  isHashedPersonalAccessToken,
  verifyPersonalAccessTokenValue,
} from "@/lib/personal-access-token";

describe("personal-access-token helpers", () => {
  it("hashes and verifies hashed token values", () => {
    const token = "och_example_token_value";
    const stored = hashPersonalAccessToken(token);

    expect(isHashedPersonalAccessToken(stored)).toBe(true);
    expect(verifyPersonalAccessTokenValue(stored, token)).toBe(true);
    expect(verifyPersonalAccessTokenValue(stored, "och_other_token")).toBe(false);
  });

  it("supports legacy plaintext token rows", () => {
    const token = "och_legacy_plain";
    expect(verifyPersonalAccessTokenValue(token, token)).toBe(true);
    expect(verifyPersonalAccessTokenValue(token, "och_other")).toBe(false);
  });

  it("returns safe display prefixes", () => {
    expect(getTokenPrefixForDisplay("och_1234567890abcd")).toBe("och_12345678...");
    expect(getTokenPrefixForDisplay("pat_sha256:abc")).toBe("och_********");
  });
});
