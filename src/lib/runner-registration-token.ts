import crypto from "node:crypto";

export const RUNNER_REGISTRATION_TOKEN_PREFIX = "ACTIONS_RUNNER_TOKEN:";
export const LEGACY_RUNNER_REGISTRATION_TOKEN_NAME = "ACTIONS_RUNNER_TOKEN";

export function getRunnerRegistrationTokenTtlDays(): number {
  const parsed = Number(process.env.RUNNER_REGISTRATION_TOKEN_TTL_DAYS || "90");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

export function getRunnerRegistrationTokenTtlMs(): number {
  return getRunnerRegistrationTokenTtlDays() * 24 * 60 * 60 * 1000;
}

export function createRunnerRegistrationTokenId(): string {
  return crypto.randomUUID();
}

export function createRunnerRegistrationSecret(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function buildRunnerRegistrationTokenName(tokenId: string): string {
  return `${RUNNER_REGISTRATION_TOKEN_PREFIX}${tokenId}`;
}

export function isRunnerRegistrationTokenName(name: string): boolean {
  return (
    name === LEGACY_RUNNER_REGISTRATION_TOKEN_NAME ||
    name.startsWith(RUNNER_REGISTRATION_TOKEN_PREFIX)
  );
}
