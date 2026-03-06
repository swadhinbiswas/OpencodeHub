import { describe, expect, it } from "vitest";
import {
  decryptWorkflowSecret,
  encryptWorkflowSecret,
  isEncryptedWorkflowSecret,
} from "@/lib/workflow-secret-crypto";

describe("workflow secret crypto", () => {
  it("encrypts and decrypts values", () => {
    process.env.WORKFLOW_SECRET_ENCRYPTION_KEY =
      "workflow-secret-encryption-key-for-tests-32+";
    const plain = "runner-registration-token-123";
    const encrypted = encryptWorkflowSecret(plain);

    expect(isEncryptedWorkflowSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain(plain);
    expect(decryptWorkflowSecret(encrypted)).toBe(plain);
  });

  it("supports legacy plaintext values for backward compatibility", () => {
    const plain = "legacy-plaintext-secret";
    expect(isEncryptedWorkflowSecret(plain)).toBe(false);
    expect(decryptWorkflowSecret(plain)).toBe(plain);
  });
});
