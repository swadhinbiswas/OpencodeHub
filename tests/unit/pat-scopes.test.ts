import { describe, expect, it } from "vitest";
import {
  hasPatScope,
  hasRepoWriteScope,
  PAT_SCOPES,
} from "@/lib/permissions";

describe("fine-grained PAT scope enforcement", () => {
  it("legacy tokens (no scopes) keep full access", () => {
    expect(hasPatScope(undefined, "repo:write")).toBe(true);
    expect(hasPatScope([], "admin")).toBe(true);
  });

  it("allows when the required scope is present", () => {
    expect(hasPatScope(["repo:write"], "repo:write")).toBe(true);
    expect(hasPatScope(["repo:read", "notifications"], "notifications")).toBe(
      true,
    );
  });

  it("blocks when the required scope is absent", () => {
    expect(hasPatScope(["repo:read"], "repo:write")).toBe(false);
    expect(hasPatScope(["repo:read"], "admin")).toBe(false);
    expect(hasPatScope(["notifications"], "repo:read")).toBe(false);
  });

  it("admin scope implies all other scopes", () => {
    expect(hasPatScope(["admin"], "repo:write")).toBe(true);
    expect(hasPatScope(["admin"], "notifications")).toBe(true);
    expect(hasPatScope(["admin"], ["repo:read", "repo:write"])).toBe(true);
  });

  it("requires ALL scopes when an array is given", () => {
    expect(
      hasPatScope(["repo:read", "repo:write"], ["repo:read", "repo:write"]),
    ).toBe(true);
    expect(hasPatScope(["repo:read"], ["repo:read", "repo:write"])).toBe(false);
  });

  it("hasRepoWriteScope blocks read-only tokens from writes", () => {
    expect(hasRepoWriteScope(undefined)).toBe(true);
    expect(hasRepoWriteScope(["repo:write"])).toBe(true);
    expect(hasRepoWriteScope(["repo:read"])).toBe(false);
    expect(hasRepoWriteScope(["notifications"])).toBe(false);
  });

  it("exposes a stable scope vocabulary", () => {
    expect(PAT_SCOPES).toContain("repo:read");
    expect(PAT_SCOPES).toContain("repo:write");
    expect(PAT_SCOPES).toContain("admin");
    expect(PAT_SCOPES).toContain("notifications");
  });
});
