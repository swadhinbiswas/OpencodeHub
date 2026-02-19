import { describe, expect, it } from "vitest";
import { scoreNotificationPriority } from "@/lib/notification-priority";

describe("notification priority scoring", () => {
  it("marks security alerts as critical blocking", () => {
    const scored = scoreNotificationPriority({
      type: "security_alert",
      reason: "security_alert",
      isRead: false,
      createdAt: new Date(),
    });

    expect(scored.priority).toBe("critical");
    expect(scored.isBlocking).toBe(true);
  });

  it("marks generic read notifications as low/medium", () => {
    const scored = scoreNotificationPriority({
      type: "comment",
      reason: "subscribed",
      isRead: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(["low", "medium"]).toContain(scored.priority);
    expect(scored.isBlocking).toBe(false);
  });
});
