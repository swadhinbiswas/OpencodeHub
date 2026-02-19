import { describe, expect, it } from "vitest";
import { normalizeExternalCiCheckPayload } from "@/lib/external-ci-check-payload";

describe("normalizeExternalCiCheckPayload", () => {
  it("accepts normalized payloads", () => {
    const result = normalizeExternalCiCheckPayload({
      pullRequestNumber: 42,
      name: "ci/build",
      headSha: "abc123",
      status: "completed",
      conclusion: "success",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.provider).toBe("normalized");
    expect(result.data.status).toBe("completed");
    expect(result.data.conclusion).toBe("success");
  });

  it("normalizes GitHub check_run payloads", () => {
    const result = normalizeExternalCiCheckPayload({
      check_run: {
        id: 999,
        name: "build",
        head_sha: "abc123",
        status: "completed",
        conclusion: "success",
        details_url: "https://github.com/acme/app/actions/runs/999",
        pull_requests: [{ number: 77 }],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.provider).toBe("github_actions");
    expect(result.data.pullRequestNumber).toBe(77);
    expect(result.data.name).toBe("build");
  });

  it("normalizes GitLab pipeline payloads", () => {
    const result = normalizeExternalCiCheckPayload({
      object_kind: "pipeline",
      object_attributes: {
        id: 1234,
        status: "failed",
        sha: "abc123",
      },
      merge_request: { iid: 55 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.provider).toBe("gitlab");
    expect(result.data.pullRequestNumber).toBe(55);
    expect(result.data.status).toBe("completed");
    expect(result.data.conclusion).toBe("failure");
  });

  it("normalizes CircleCI workflow payloads", () => {
    const result = normalizeExternalCiCheckPayload({
      workflow: {
        id: "wf-1",
        name: "test",
        status: "running",
      },
      vcs: {
        revision: "abc123",
        pull_requests: ["https://github.com/acme/app/pull/31"],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.provider).toBe("circleci");
    expect(result.data.status).toBe("in_progress");
    expect(result.data.pullRequestNumber).toBe(31);
  });

  it("normalizes Buildkite payloads", () => {
    const result = normalizeExternalCiCheckPayload({
      build: {
        id: "bk-1",
        state: "passed",
        commit: "abc123",
        pipeline: { slug: "app" },
        pull_request: { id: 11 },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.provider).toBe("buildkite");
    expect(result.data.status).toBe("completed");
    expect(result.data.conclusion).toBe("success");
  });

  it("normalizes Jenkins payloads", () => {
    const result = normalizeExternalCiCheckPayload({
      status: "SUCCESS",
      head_sha: "abc123",
      pull_request: { number: 9 },
      name: "jenkins/build",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.provider).toBe("jenkins");
    expect(result.data.pullRequestNumber).toBe(9);
    expect(result.data.conclusion).toBe("success");
  });

  it("rejects unsupported payloads", () => {
    const result = normalizeExternalCiCheckPayload({ foo: "bar" });
    expect(result.ok).toBe(false);
  });
});
