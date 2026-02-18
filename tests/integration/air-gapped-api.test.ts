import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as externalCiChecksPost } from "@/pages/api/repos/[owner]/[repo]/external-ci/checks";
import { POST as issueTrackerWebhookPost } from "@/pages/api/repos/[owner]/[repo]/integrations/issue-trackers/[provider]/webhook";
import { POST as codeQualityWebhookPost } from "@/pages/api/repos/[owner]/[repo]/integrations/code-quality/webhooks/[provider]";

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("air-gapped mode API enforcement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 for external CI checks when AIR_GAPPED_MODE=true", async () => {
    vi.stubEnv("AIR_GAPPED_MODE", "true");

    const response = await externalCiChecksPost({
      params: { owner: "acme", repo: "demo" },
      request: new Request("http://localhost/api/repos/acme/demo/external-ci/checks", {
        method: "POST",
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(503);
    expect(body?.error?.code).toBe("AIR_GAPPED_MODE");
  });

  it("returns normal validation error for external CI checks when AIR_GAPPED_MODE=false", async () => {
    vi.stubEnv("AIR_GAPPED_MODE", "false");

    const response = await externalCiChecksPost({
      params: {},
      request: new Request("http://localhost/api/repos/external-ci/checks", {
        method: "POST",
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });

  it("returns 503 for issue tracker webhook when AIR_GAPPED_MODE=true", async () => {
    vi.stubEnv("AIR_GAPPED_MODE", "true");

    const response = await issueTrackerWebhookPost({
      params: { provider: "linear" },
      url: new URL("http://localhost/api/repos/acme/demo/integrations/issue-trackers/linear/webhook"),
      request: new Request("http://localhost/api/repos/acme/demo/integrations/issue-trackers/linear/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(503);
    expect(body?.error?.code).toBe("AIR_GAPPED_MODE");
  });

  it("returns normal auth error for issue tracker webhook when AIR_GAPPED_MODE=false", async () => {
    vi.stubEnv("AIR_GAPPED_MODE", "false");

    const response = await issueTrackerWebhookPost({
      params: { provider: "linear" },
      url: new URL("http://localhost/api/repos/acme/demo/integrations/issue-trackers/linear/webhook"),
      request: new Request("http://localhost/api/repos/acme/demo/integrations/issue-trackers/linear/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(401);
    expect(body?.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns 503 for code quality webhook when AIR_GAPPED_MODE=true", async () => {
    vi.stubEnv("AIR_GAPPED_MODE", "true");

    const response = await codeQualityWebhookPost({
      params: { provider: "codecov" },
      url: new URL("http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/codecov"),
      request: new Request("http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/codecov", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(503);
    expect(body?.error?.code).toBe("AIR_GAPPED_MODE");
  });

  it("returns normal auth error for code quality webhook when AIR_GAPPED_MODE=false", async () => {
    vi.stubEnv("AIR_GAPPED_MODE", "false");

    const response = await codeQualityWebhookPost({
      params: { provider: "codecov" },
      url: new URL("http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/codecov"),
      request: new Request("http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/codecov", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(401);
    expect(body?.error?.code).toBe("UNAUTHORIZED");
  });
});
