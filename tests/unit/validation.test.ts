import {
  BranchProtectionSchema,
  CreateIssueSchema,
  CreatePullRequestSchema,
  CreateRepositorySchema,
  GeneralConfigSchema,
  RegisterUserSchema,
  StorageConfigSchema,
  WebhookConfigSchema,
} from "@/lib/validation";
import { describe, expect, it } from "vitest";

describe("RegisterUserSchema", () => {
  it("accepts a valid registration", () => {
    const result = RegisterUserSchema.safeParse({
      username: "testuser",
      email: "test@example.com",
      password: "StrongP@ss123",
      displayName: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing username", () => {
    const result = RegisterUserSchema.safeParse({
      email: "test@example.com",
      password: "StrongP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = RegisterUserSchema.safeParse({
      username: "testuser",
      email: "notanemail",
      password: "StrongP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = RegisterUserSchema.safeParse({
      username: "testuser",
      email: "test@example.com",
      password: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty username", () => {
    const result = RegisterUserSchema.safeParse({
      username: "",
      email: "test@example.com",
      password: "StrongP@ss123",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateRepositorySchema", () => {
  it("accepts minimal valid repo", () => {
    const result = CreateRepositorySchema.safeParse({
      name: "my-repo",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full valid repo", () => {
    const result = CreateRepositorySchema.safeParse({
      name: "my-repo",
      description: "A test repository",
      visibility: "public",
      defaultBranch: "main",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = CreateRepositorySchema.safeParse({
      description: "A test repository",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateRepositorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid visibility", () => {
    const result = CreateRepositorySchema.safeParse({
      name: "my-repo",
      visibility: "invalid-mode",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateIssueSchema", () => {
  it("accepts a valid issue", () => {
    const result = CreateIssueSchema.safeParse({
      title: "Bug report",
      body: "Something is broken",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = CreateIssueSchema.safeParse({
      title: "",
      body: "Something is broken",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = CreateIssueSchema.safeParse({
      body: "Something is broken",
    });
    expect(result.success).toBe(false);
  });

  it("sanitizes HTML in body", () => {
    const result = CreateIssueSchema.safeParse({
      title: "XSS test",
      body: '<script>alert("xss")</script>normal text',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).not.toContain("<script");
    }
  });
});

describe("CreatePullRequestSchema", () => {
  it("accepts a valid pull request", () => {
    const result = CreatePullRequestSchema.safeParse({
      title: "New feature",
      body: "Adds cool stuff",
      head: "feature-branch",
      base: "main",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing head branch", () => {
    const result = CreatePullRequestSchema.safeParse({
      title: "New feature",
      base: "main",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing base branch", () => {
    const result = CreatePullRequestSchema.safeParse({
      title: "New feature",
      head: "feature-branch",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = CreatePullRequestSchema.safeParse({
      head: "feature",
      base: "main",
    });
    expect(result.success).toBe(false);
  });
});

describe("BranchProtectionSchema", () => {
  it("accepts valid protection rules", () => {
    const result = BranchProtectionSchema.safeParse({
      pattern: "main",
      active: true,
      requiresPr: true,
      requiredApprovals: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal pattern", () => {
    const result = BranchProtectionSchema.safeParse({
      pattern: "main",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing pattern", () => {
    const result = BranchProtectionSchema.safeParse({
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative approvals", () => {
    const result = BranchProtectionSchema.safeParse({
      pattern: "main",
      requiredApprovals: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("WebhookConfigSchema", () => {
  it("accepts valid webhook config", () => {
    const result = WebhookConfigSchema.safeParse({
      url: "https://example.com/webhook",
      events: ["push", "pull_request"],
      secret: "mysecret",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing url", () => {
    const result = WebhookConfigSchema.safeParse({
      events: ["push"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects private IP urls (SSRF protection)", () => {
    const result = WebhookConfigSchema.safeParse({
      url: "http://127.0.0.1:8080/hook",
      events: ["push"],
    });
    // Should fail SSRF refine
    expect(result.success).toBe(false);
  });

  it("rejects localhost urls", () => {
    const result = WebhookConfigSchema.safeParse({
      url: "http://localhost:3000/hook",
      events: ["push"],
    });
    expect(result.success).toBe(false);
  });
});

describe("StorageConfigSchema", () => {
  it("accepts local storage config", () => {
    const result = StorageConfigSchema.safeParse({
      type: "local",
      basePath: "/data/storage",
    });
    expect(result.success).toBe(true);
  });

  it("accepts s3 storage config", () => {
    const result = StorageConfigSchema.safeParse({
      type: "s3",
      bucket: "my-bucket",
      region: "us-east-1",
    });
    expect(result.success).toBe(true);
  });
});

describe("GeneralConfigSchema", () => {
  it("accepts valid general config", () => {
    const result = GeneralConfigSchema.safeParse({
      siteName: "My CodeHub",
      allowSignups: true,
    });
    expect(result.success).toBe(true);
  });
});
