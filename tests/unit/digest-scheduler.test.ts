import { describe, expect, it } from "vitest";
import { shouldSendDigestNow } from "@/lib/chat-notifications";

describe("digest scheduler logic", () => {
  it("sends daily digest when due time passed and never sent", () => {
    const now = new Date("2026-02-18T10:00:00.000Z");
    const shouldSend = shouldSendDigestNow("daily", "09:00", 1, null, now);
    expect(shouldSend).toBe(true);
  });

  it("does not send daily digest before due time", () => {
    const now = new Date("2026-02-18T08:59:00.000Z");
    const shouldSend = shouldSendDigestNow("daily", "09:00", 1, null, now);
    expect(shouldSend).toBe(false);
  });

  it("does not re-send daily digest on same UTC day", () => {
    const now = new Date("2026-02-18T12:00:00.000Z");
    const lastSentAt = new Date("2026-02-18T09:10:00.000Z");
    const shouldSend = shouldSendDigestNow("daily", "09:00", 1, lastSentAt, now);
    expect(shouldSend).toBe(false);
  });

  it("sends weekly digest on configured day after due time", () => {
    // Monday
    const now = new Date("2026-02-16T10:00:00.000Z");
    const shouldSend = shouldSendDigestNow("weekly", "09:00", 1, null, now);
    expect(shouldSend).toBe(true);
  });

  it("does not send weekly digest on non-configured day", () => {
    // Tuesday
    const now = new Date("2026-02-17T10:00:00.000Z");
    const shouldSend = shouldSendDigestNow("weekly", "09:00", 1, null, now);
    expect(shouldSend).toBe(false);
  });

  it("does not re-send weekly digest in same week", () => {
    // Monday this week
    const now = new Date("2026-02-16T12:00:00.000Z");
    // Also Monday this week
    const lastSentAt = new Date("2026-02-16T09:15:00.000Z");
    const shouldSend = shouldSendDigestNow("weekly", "09:00", 1, lastSentAt, now);
    expect(shouldSend).toBe(false);
  });

  it("uses timezone for daily due-time checks", () => {
    // 08:30 in America/New_York (UTC-5 in February)
    const beforeDue = new Date("2026-02-18T13:30:00.000Z");
    const shouldSendBeforeDue = shouldSendDigestNow("daily", "09:00", 1, null, beforeDue, "America/New_York");
    expect(shouldSendBeforeDue).toBe(false);

    // 09:30 in America/New_York
    const afterDue = new Date("2026-02-18T14:30:00.000Z");
    const shouldSendAfterDue = shouldSendDigestNow("daily", "09:00", 1, null, afterDue, "America/New_York");
    expect(shouldSendAfterDue).toBe(true);
  });

  it("normalizes invalid weekly day to Monday", () => {
    // Monday UTC
    const now = new Date("2026-02-16T10:00:00.000Z");
    const shouldSend = shouldSendDigestNow("weekly", "09:00", 99, null, now);
    expect(shouldSend).toBe(true);
  });

  it("does not re-send daily digest on same local date in timezone", () => {
    // 00:30 JST on Feb 18, 2026
    const now = new Date("2026-02-17T15:30:00.000Z");
    // 00:05 JST on the same local date
    const lastSentAt = new Date("2026-02-17T15:05:00.000Z");
    const shouldSend = shouldSendDigestNow("daily", "00:00", 1, lastSentAt, now, "Asia/Tokyo");
    expect(shouldSend).toBe(false);
  });
});
