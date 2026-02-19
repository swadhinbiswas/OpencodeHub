import { describe, expect, it, vi } from "vitest";
import { sendDigestWithRetry } from "@/lib/chat-notifications";

describe("digest delivery retry helper", () => {
  it("recovers after a retry when a later attempt succeeds", async () => {
    const send = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await sendDigestWithRetry(send, 2);
    expect(result.sent).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("returns failure after exhausting retries", async () => {
    const send = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);

    const result = await sendDigestWithRetry(send, 1);
    expect(result.sent).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.lastError).toBe("send_failed");
  });
});
