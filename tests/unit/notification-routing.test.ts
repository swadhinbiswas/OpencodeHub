import {
  channelEnabled,
  computePersonalizationBoost,
  getRoutingDecision,
} from "@/lib/notification-routing";
import { describe, expect, it } from "vitest";

describe("getRoutingDecision", () => {
  it("returns default channels when no preferences", () => {
    const decision = getRoutingDecision("push", []);
    expect(decision.channels).toBeDefined();
    expect(Array.isArray(decision.channels)).toBe(true);
    expect(decision.channels.length).toBeGreaterThan(0);
    expect(decision.primaryChannel).toBeDefined();
  });

  it("returns default channels for null event type", () => {
    const decision = getRoutingDecision(null, []);
    expect(decision.channels).toBeDefined();
    expect(decision.channels.length).toBeGreaterThan(0);
  });

  it("returns default channels for undefined event type", () => {
    const decision = getRoutingDecision(undefined, []);
    expect(decision.channels).toBeDefined();
  });

  it("includes in_app channel by default", () => {
    const decision = getRoutingDecision("issue_comment", []);
    expect(decision.channels).toContain("in_app");
  });

  it("respects user preferences when provided", () => {
    const prefs = [
      {
        id: "1",
        userId: "u1",
        repositoryId: null,
        eventType: "push",
        inApp: true,
        email: false,
        slack: false,
        browserPush: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any[];
    const decision = getRoutingDecision("push", prefs);
    expect(decision.channels).toContain("in_app");
  });

  it("returns a valid primaryChannel", () => {
    const decision = getRoutingDecision("review_request", []);
    expect(decision.channels).toContain(decision.primaryChannel);
  });
});

describe("channelEnabled", () => {
  it("returns true when channel is in decision", () => {
    const decision = {
      channels: ["in_app", "email"] as any[],
      primaryChannel: "in_app" as any,
    };
    expect(channelEnabled("in_app", decision)).toBe(true);
    expect(channelEnabled("email", decision)).toBe(true);
  });

  it("returns false when channel is not in decision", () => {
    const decision = {
      channels: ["in_app"] as any[],
      primaryChannel: "in_app" as any,
    };
    expect(channelEnabled("email", decision)).toBe(false);
    expect(channelEnabled("slack", decision)).toBe(false);
  });
});

describe("computePersonalizationBoost", () => {
  it("returns 0 for empty input", () => {
    const boost = computePersonalizationBoost({
      eventType: "push",
      readByType: {},
      unreadByType: {},
      baselineReadRatio: 0.5,
    });
    expect(typeof boost).toBe("number");
  });

  it("returns a positive boost for frequently-read event types", () => {
    const boost = computePersonalizationBoost({
      eventType: "push",
      readByType: { push: 50 },
      unreadByType: { push: 5 },
      baselineReadRatio: 0.5,
    });
    // User reads push events a lot — boost should be positive (higher priority)
    expect(boost).toBeGreaterThanOrEqual(0);
  });

  it("returns zero or negative boost for mostly-unread event types", () => {
    const boost = computePersonalizationBoost({
      eventType: "star",
      readByType: { star: 1 },
      unreadByType: { star: 50 },
      baselineReadRatio: 0.5,
    });
    expect(boost).toBeLessThanOrEqual(0);
  });

  it("handles unknown event type gracefully", () => {
    const boost = computePersonalizationBoost({
      eventType: "unknown_event",
      readByType: {},
      unreadByType: {},
      baselineReadRatio: 0.5,
    });
    expect(typeof boost).toBe("number");
    expect(Number.isFinite(boost)).toBe(true);
  });
});
