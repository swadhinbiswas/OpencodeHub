import {
  embedToken,
  getUrlOrigin,
  validateFederationSourceUrl,
} from "@/lib/federation";
import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_FEDERATION_ALLOW_LOCALHOST = process.env.FEDERATION_ALLOW_LOCALHOST;

afterEach(() => {
  if (ORIGINAL_FEDERATION_ALLOW_LOCALHOST === undefined) {
    delete process.env.FEDERATION_ALLOW_LOCALHOST;
  } else {
    process.env.FEDERATION_ALLOW_LOCALHOST = ORIGINAL_FEDERATION_ALLOW_LOCALHOST;
  }
});

describe("validateFederationSourceUrl", () => {
  it("blocks localhost when federation localhost is disabled", async () => {
    process.env.FEDERATION_ALLOW_LOCALHOST = "false";
    const result = await validateFederationSourceUrl(
      "http://localhost:4322/bob/fedbase.git",
    );
    expect(result.valid).toBe(false);
  });

  it("allows localhost when federation localhost is enabled", async () => {
    process.env.FEDERATION_ALLOW_LOCALHOST = "true";
    const result = await validateFederationSourceUrl(
      "http://localhost:4322/bob/fedbase.git",
    );
    expect(result).toEqual({ valid: true });
  });

  it("blocks non-http(s) schemes", async () => {
    const result = await validateFederationSourceUrl(
      "file:///etc/passwd",
    );
    expect(result.valid).toBe(false);
  });

  it("allows public https URLs", async () => {
    const result = await validateFederationSourceUrl(
      "https://github.com/owner/repo.git",
    );
    expect(result).toEqual({ valid: true });
  });

  it("allows scp-style git URLs", async () => {
    const result = await validateFederationSourceUrl(
      "git@github.com:owner/repo.git",
    );
    expect(result).toEqual({ valid: true });
  });
});

describe("getUrlOrigin", () => {
  it("derives origin from a clone URL", () => {
    expect(getUrlOrigin("http://localhost:4321/swadhinbiswas/fedbase.git")).toBe(
      "http://localhost:4321",
    );
  });

  it("returns null for invalid URLs", () => {
    expect(getUrlOrigin("not-a-url")).toBeNull();
  });
});

describe("embedToken", () => {
  it("embeds the token with the provided username", () => {
    const url = embedToken(
      "http://localhost:4321/owner/repo.git",
      "och_pat_123",
      "bob",
    );
    const parsed = new URL(url);
    expect(parsed.username).toBe("bob");
    expect(parsed.password).toBe("och_pat_123");
  });

  it("defaults to the oauth2 username", () => {
    const url = embedToken(
      "https://example.com/owner/repo.git",
      "och_pat_123",
    );
    const parsed = new URL(url);
    expect(parsed.username).toBe("oauth2");
    expect(parsed.password).toBe("och_pat_123");
  });

  it("uses x-access-token for github.com and bitbucket.org", () => {
    const url = embedToken("https://github.com/owner/repo.git", "pat");
    const parsed = new URL(url);
    expect(parsed.username).toBe("x-access-token");
    expect(parsed.password).toBe("pat");
  });
});