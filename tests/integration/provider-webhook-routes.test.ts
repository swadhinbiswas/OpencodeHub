import { beforeEach, describe, expect, it, vi } from "vitest";

const { issueWebhookHandler, qualityWebhookHandler } = vi.hoisted(() => ({
  issueWebhookHandler: vi.fn(async () => true),
  qualityWebhookHandler: vi.fn(async () => true),
}));

vi.mock("@/lib/air-gapped", () => ({
  isAirGappedMode: () => false,
}));

vi.mock("@/lib/issue-trackers", () => ({
  ISSUE_PROVIDERS: {
    jira: { name: "Jira" },
    linear: { name: "Linear" },
    trello: { name: "Trello" },
    clickup: { name: "ClickUp" },
  },
  handleIssueTrackerWebhook: issueWebhookHandler,
}));

vi.mock("@/lib/code-quality", () => ({
  QUALITY_PROVIDERS: {
    codecov: { name: "Codecov" },
    coveralls: { name: "Coveralls" },
    sonarqube: { name: "SonarQube" },
    snyk: { name: "Snyk" },
  },
  handleQualityWebhook: qualityWebhookHandler,
}));

import { POST as issueWebhookPost } from "@/pages/api/repos/[owner]/[repo]/integrations/issue-trackers/[provider]/webhook";
import { POST as qualityWebhookPost } from "@/pages/api/repos/[owner]/[repo]/integrations/code-quality/webhooks/[provider]";

async function json(response: Response): Promise<any> {
  return response.json();
}

describe("provider webhook routes", () => {
  beforeEach(() => {
    issueWebhookHandler.mockClear();
    qualityWebhookHandler.mockClear();
  });

  it("accepts all supported issue tracker providers and forwards payload", async () => {
    for (const provider of ["jira", "linear", "trello", "clickup"]) {
      const response = await issueWebhookPost({
        params: { provider },
        url: new URL(`http://localhost/api/repos/acme/demo/integrations/issue-trackers/${provider}/webhook?secret=sec`),
        request: new Request(`http://localhost/api/repos/acme/demo/integrations/issue-trackers/${provider}/webhook?secret=sec`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event: "update", provider }),
        }),
      } as any);

      const body = await json(response);
      expect(response.status).toBe(200);
      expect(body?.success).toBe(true);
      expect(issueWebhookHandler).toHaveBeenCalledWith(provider, "sec", { event: "update", provider });
    }
  });

  it("rejects unsupported issue tracker provider", async () => {
    const response = await issueWebhookPost({
      params: { provider: "unknown" },
      url: new URL("http://localhost/api/repos/acme/demo/integrations/issue-trackers/unknown/webhook?secret=sec"),
      request: new Request("http://localhost/api/repos/acme/demo/integrations/issue-trackers/unknown/webhook?secret=sec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await json(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });

  it("accepts all supported code quality providers and forwards payload", async () => {
    for (const provider of ["codecov", "coveralls", "sonarqube", "snyk"]) {
      const response = await qualityWebhookPost({
        params: { provider },
        url: new URL(`http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/${provider}?secret=sec`),
        request: new Request(`http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/${provider}?secret=sec`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event: "report", provider }),
        }),
      } as any);

      const body = await json(response);
      expect(response.status).toBe(200);
      expect(body?.success).toBe(true);
      expect(qualityWebhookHandler).toHaveBeenCalledWith(provider, "sec", { event: "report", provider });
    }
  });

  it("rejects unsupported code quality provider", async () => {
    const response = await qualityWebhookPost({
      params: { provider: "unknown" },
      url: new URL("http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/unknown?secret=sec"),
      request: new Request("http://localhost/api/repos/acme/demo/integrations/code-quality/webhooks/unknown?secret=sec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any);

    const body = await json(response);
    expect(response.status).toBe(400);
    expect(body?.error?.code).toBe("BAD_REQUEST");
  });
});
