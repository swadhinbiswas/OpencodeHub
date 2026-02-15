import { afterEach, describe, expect, it } from "vitest";
import { getSiteUrl } from "@/lib/site-url";

const originalSiteUrl = process.env.SITE_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.SITE_URL = originalSiteUrl;
  process.env.NODE_ENV = originalNodeEnv;
});

describe("site-url", () => {
  it("returns configured SITE_URL", () => {
    process.env.SITE_URL = "https://example.com/";
    process.env.NODE_ENV = "production";
    expect(getSiteUrl()).toBe("https://example.com");
  });

  it("fails closed in production when SITE_URL is missing", () => {
    delete process.env.SITE_URL;
    process.env.NODE_ENV = "production";
    expect(() => getSiteUrl()).toThrowError(
      "SITE_URL environment variable is required in production"
    );
  });

  it("uses localhost fallback only in non-production", () => {
    delete process.env.SITE_URL;
    process.env.NODE_ENV = "development";
    expect(getSiteUrl()).toBe("http://localhost:4321");
  });
});

