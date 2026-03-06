import { describe, expect, it } from "vitest";
import { openApiSpec } from "@/lib/openapi";

describe("openapi notifications parity", () => {
  it("includes notification prioritization, blocking, and digest operations", () => {
    const paths = openApiSpec.paths as Record<string, unknown>;

    expect(paths["/notifications"]).toBeTruthy();
    expect(paths["/notifications/blocking/summary"]).toBeTruthy();
    expect(paths["/notifications/blocking/escalations"]).toBeTruthy();

    expect(paths["/user/notification-digests/test"]).toBeTruthy();
    expect(paths["/user/notification-digests/analytics"]).toBeTruthy();
    expect(paths["/user/notification-digests/dead-letter"]).toBeTruthy();
    expect(paths["/user/notification-digests/dead-letter/retry"]).toBeTruthy();

    expect(paths["/admin/plugins"]).toBeTruthy();
    expect(paths["/admin/plugins/{name}"]).toBeTruthy();
  });
});
