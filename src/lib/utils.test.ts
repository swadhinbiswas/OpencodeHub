import { describe, expect, it } from "vitest";
import { generateId, slugify } from "./utils";

describe("utils", () => {
  describe("generateId", () => {
    it("should generate a string", () => {
      expect(typeof generateId()).toBe("string");
    });

    it("should generate unique ids", () => {
      expect(generateId()).not.toBe(generateId());
    });

    it("should add prefix if provided", () => {
      expect(generateId("user")).toMatch(/^user_/);
    });
  });

  describe("slugify", () => {
    it("should slugify text", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("should handle special characters", () => {
      expect(slugify("Hello @ World!")).toBe("hello-world");
    });

    it("should trim dashes", () => {
      expect(slugify("-Hello-")).toBe("hello");
    });
  });
});
