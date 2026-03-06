import { describe, expect, it } from "vitest";
import {
  evaluateLicensePolicy,
  evaluateSecretPolicy,
} from "@/lib/security-policies";

const basePolicy = {
  enforcementMode: "block" as const,
  secretBlockedTypes: ["aws_access_key"],
  secretMinSeverity: "HIGH" as const,
  licenseAllowedTypes: ["permissive"],
  licenseBlockedLicenses: ["GPL-3.0"],
  isEnabled: true,
};

describe("security policy evaluation", () => {
  it("flags blocked secret type", () => {
    const result = evaluateSecretPolicy(basePolicy, "aws_access_key", "LOW");
    expect(result.violated).toBe(true);
  });

  it("flags secret by severity threshold", () => {
    const result = evaluateSecretPolicy(basePolicy, "generic", "CRITICAL");
    expect(result.violated).toBe(true);
  });

  it("flags blocked license name", () => {
    const result = evaluateLicensePolicy(basePolicy, "copyleft", "LICENSE-GPL-3.0", "License: GPL-3.0");
    expect(result.violated).toBe(true);
  });

  it("flags disallowed license type", () => {
    const result = evaluateLicensePolicy(basePolicy, "copyleft", "LICENSE-MPL-2.0", "License: MPL-2.0");
    expect(result.violated).toBe(true);
  });
});

