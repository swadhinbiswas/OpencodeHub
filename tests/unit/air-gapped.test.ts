import { describe, expect, it, vi } from "vitest";
import { assertOnlineFeature, getAirGappedMessage, isAirGappedMode } from "@/lib/air-gapped";

describe("air-gapped mode", () => {
  it("returns false by default", () => {
    vi.stubEnv("AIR_GAPPED_MODE", "");
    expect(isAirGappedMode()).toBe(false);
  });

  it("returns true for truthy values", () => {
    vi.stubEnv("AIR_GAPPED_MODE", "true");
    expect(isAirGappedMode()).toBe(true);

    vi.stubEnv("AIR_GAPPED_MODE", "1");
    expect(isAirGappedMode()).toBe(true);

    vi.stubEnv("AIR_GAPPED_MODE", "yes");
    expect(isAirGappedMode()).toBe(true);
  });

  it("throws when feature requires online mode", () => {
    vi.stubEnv("AIR_GAPPED_MODE", "true");
    expect(() => assertOnlineFeature("External CI")).toThrow(
      getAirGappedMessage("External CI")
    );
  });
});
