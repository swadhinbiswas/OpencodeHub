import { describe, expect, it } from "vitest";
import {
  buildRunnerRegistrationTokenName,
  createRunnerRegistrationSecret,
  getRunnerRegistrationTokenTtlDays,
  isRunnerRegistrationTokenName,
} from "@/lib/runner-registration-token";

describe("runner registration tokens", () => {
  it("builds and recognizes registration token names", () => {
    const tokenName = buildRunnerRegistrationTokenName("token-123");
    expect(tokenName).toBe("ACTIONS_RUNNER_TOKEN:token-123");
    expect(isRunnerRegistrationTokenName(tokenName)).toBe(true);
    expect(isRunnerRegistrationTokenName("ACTIONS_RUNNER_TOKEN")).toBe(true);
    expect(isRunnerRegistrationTokenName("OTHER_TOKEN")).toBe(false);
  });

  it("generates reasonably strong secrets", () => {
    const secret = createRunnerRegistrationSecret();
    expect(secret.length).toBeGreaterThanOrEqual(48);
  });

  it("uses positive TTL defaults", () => {
    delete process.env.RUNNER_REGISTRATION_TOKEN_TTL_DAYS;
    expect(getRunnerRegistrationTokenTtlDays()).toBeGreaterThan(0);
  });
});
