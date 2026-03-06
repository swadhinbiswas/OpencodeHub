import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-123" }),
    })),
  },
  createTransport: vi.fn(() => ({
    sendMail: vi.fn().mockResolvedValue({ messageId: "test-123" }),
  })),
}));

describe("email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports isSmtpConfigured function", async () => {
    const mod = await import("@/lib/email");
    expect(typeof mod.isSmtpConfigured).toBe("function");
  });

  it("exports sendEmail function", async () => {
    const mod = await import("@/lib/email");
    expect(typeof mod.sendEmail).toBe("function");
  });

  it("isSmtpConfigured returns boolean", async () => {
    const { isSmtpConfigured } = await import("@/lib/email");
    const result = isSmtpConfigured();
    expect(typeof result).toBe("boolean");
  });
});
