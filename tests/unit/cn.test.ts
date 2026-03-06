import { cn } from "@/lib/cn";
import { describe, expect, it } from "vitest";

describe("cn", () => {
  it("merges simple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", true && "active", false && "hidden")).toBe("base active");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("handles empty string", () => {
    expect(cn("")).toBe("");
  });

  it("handles no arguments", () => {
    expect(cn()).toBe("");
  });

  it("merges tailwind classes correctly", () => {
    // twMerge should handle conflicting tailwind classes
    const result = cn("px-2 py-1", "px-4");
    expect(result).toContain("px-4");
    expect(result).not.toContain("px-2");
  });

  it("handles array input", () => {
    const result = cn(["foo", "bar"]);
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });

  it("handles object input", () => {
    const result = cn({ active: true, hidden: false, visible: true });
    expect(result).toContain("active");
    expect(result).toContain("visible");
    expect(result).not.toContain("hidden");
  });
});
