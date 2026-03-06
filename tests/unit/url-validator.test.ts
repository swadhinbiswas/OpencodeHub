import { isAllowedWebhookUrlSync } from "@/lib/url-validator";
import { describe, expect, it } from "vitest";

describe("isAllowedWebhookUrlSync", () => {
  describe("blocks private/reserved IPs", () => {
    it("blocks localhost", () => {
      expect(isAllowedWebhookUrlSync("http://localhost/hook")).toBe(false);
    });

    it("blocks localhost with port", () => {
      expect(isAllowedWebhookUrlSync("http://localhost:8080/hook")).toBe(false);
    });

    it("blocks 127.0.0.1", () => {
      expect(isAllowedWebhookUrlSync("http://127.0.0.1/hook")).toBe(false);
    });

    it("blocks 10.x.x.x range", () => {
      expect(isAllowedWebhookUrlSync("http://10.0.0.1/hook")).toBe(false);
    });

    it("blocks 192.168.x.x range", () => {
      expect(isAllowedWebhookUrlSync("http://192.168.1.1/hook")).toBe(false);
    });

    it("blocks 172.16.x.x range", () => {
      expect(isAllowedWebhookUrlSync("http://172.16.0.1/hook")).toBe(false);
    });

    it("blocks 169.254.x.x metadata range", () => {
      expect(
        isAllowedWebhookUrlSync("http://169.254.169.254/latest/meta-data"),
      ).toBe(false);
    });

    it("blocks 0.0.0.0", () => {
      expect(isAllowedWebhookUrlSync("http://0.0.0.0/hook")).toBe(false);
    });

    it("blocks [::1] (IPv6 loopback)", () => {
      expect(isAllowedWebhookUrlSync("http://[::1]/hook")).toBe(false);
    });
  });

  describe("blocks non-http(s) schemes", () => {
    it("blocks ftp scheme", () => {
      expect(isAllowedWebhookUrlSync("ftp://example.com/hook")).toBe(false);
    });

    it("blocks file scheme", () => {
      expect(isAllowedWebhookUrlSync("file:///etc/passwd")).toBe(false);
    });

    it("blocks javascript scheme", () => {
      expect(isAllowedWebhookUrlSync("javascript:alert(1)")).toBe(false);
    });

    it("blocks data scheme", () => {
      expect(
        isAllowedWebhookUrlSync("data:text/html,<script>alert(1)</script>"),
      ).toBe(false);
    });
  });

  describe("allows valid public URLs", () => {
    it("allows https public URL", () => {
      expect(isAllowedWebhookUrlSync("https://example.com/webhook")).toBe(true);
    });

    it("allows http public URL", () => {
      expect(isAllowedWebhookUrlSync("http://example.com/webhook")).toBe(true);
    });

    it("allows public IP", () => {
      expect(isAllowedWebhookUrlSync("http://8.8.8.8/hook")).toBe(true);
    });

    it("allows URL with port", () => {
      expect(
        isAllowedWebhookUrlSync("https://hooks.example.com:9000/webhook"),
      ).toBe(true);
    });

    it("allows URL with path", () => {
      expect(
        isAllowedWebhookUrlSync("https://api.example.com/v1/hooks/receive"),
      ).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("rejects empty string", () => {
      expect(isAllowedWebhookUrlSync("")).toBe(false);
    });

    it("rejects invalid URL", () => {
      expect(isAllowedWebhookUrlSync("not-a-url")).toBe(false);
    });
  });
});
