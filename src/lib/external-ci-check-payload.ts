import type { CheckRunInput } from "./pr-checks";

type Conclusion = NonNullable<CheckRunInput["conclusion"]>;

export interface NormalizedExternalCheckPayload {
  pullRequestNumber?: number;
  pullRequestId?: string;
  name: string;
  headSha: string;
  status: CheckRunInput["status"];
  conclusion?: Conclusion;
  externalId?: string;
  detailsUrl?: string;
  output?: CheckRunInput["output"];
  provider: string;
}

export const SUPPORTED_EXTERNAL_CI_PAYLOADS = [
  "normalized",
  "github_actions",
  "gitlab",
  "circleci",
  "buildkite",
  "jenkins",
] as const;

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, any>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function normalizeConclusion(raw: string | undefined): Conclusion | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (["success", "passed", "succeeded", "ok"].includes(value)) return "success";
  if (["failure", "failed", "error", "errored"].includes(value)) return "failure";
  if (["neutral", "skipped"].includes(value)) return "neutral";
  if (["cancelled", "canceled", "aborted"].includes(value)) return "cancelled";
  if (["timed_out", "timeout"].includes(value)) return "timed_out";
  if (["action_required", "manual"].includes(value)) return "action_required";
  return undefined;
}

function normalizeStatus(rawStatus: string | undefined, rawConclusion: string | undefined) {
  const statusValue = rawStatus?.toLowerCase();
  if (!statusValue) {
    return {
      status: "queued" as CheckRunInput["status"],
      conclusion: normalizeConclusion(rawConclusion),
    };
  }

  if (["queued", "pending", "waiting", "scheduled", "created", "not_started"].includes(statusValue)) {
    return { status: "queued" as CheckRunInput["status"], conclusion: undefined };
  }
  if (["in_progress", "inprogress", "running", "building", "executing"].includes(statusValue)) {
    return { status: "in_progress" as CheckRunInput["status"], conclusion: undefined };
  }
  if (statusValue === "completed") {
    return {
      status: "completed" as CheckRunInput["status"],
      conclusion: normalizeConclusion(rawConclusion),
    };
  }

  const statusAsConclusion = normalizeConclusion(statusValue);
  if (statusAsConclusion) {
    return {
      status: "completed" as CheckRunInput["status"],
      conclusion: statusAsConclusion,
    };
  }

  return {
    status: "queued" as CheckRunInput["status"],
    conclusion: normalizeConclusion(rawConclusion),
  };
}

function normalizeOutput(value: unknown): CheckRunInput["output"] | undefined {
  const record = asRecord(value);
  const summary = asString(record.summary);
  if (!summary) return undefined;
  const title = asString(record.title) || "CI Output";
  const text = asString(record.text);
  return { title, summary, ...(text ? { text } : {}) };
}

function isNormalizedPayload(body: Record<string, any>): boolean {
  return !!asString(body.name) && !!asString(body.headSha) && !!asString(body.status);
}

function fromNormalized(body: Record<string, any>): NormalizedExternalCheckPayload {
  const normalized = normalizeStatus(asString(body.status), asString(body.conclusion));
  return {
    pullRequestNumber: asNumber(body.pullRequestNumber),
    pullRequestId: asString(body.pullRequestId),
    name: asString(body.name) || "external/check",
    headSha: asString(body.headSha) || "",
    status: normalized.status,
    conclusion: normalized.status === "completed" ? normalized.conclusion : undefined,
    externalId: asString(body.externalId),
    detailsUrl: asString(body.detailsUrl),
    output: normalizeOutput(body.output),
    provider: "normalized",
  };
}

function fromGitHubActions(body: Record<string, any>): NormalizedExternalCheckPayload | null {
  const checkRun = asRecord(body.check_run);
  if (!asString(checkRun.name) || !asString(checkRun.head_sha)) return null;
  const normalized = normalizeStatus(asString(checkRun.status), asString(checkRun.conclusion));
  return {
    pullRequestNumber:
      asNumber(asRecord((checkRun.pull_requests || [])[0]).number) ||
      asNumber(asRecord(body.pull_request).number),
    name: asString(checkRun.name) || "github-actions/check",
    headSha: asString(checkRun.head_sha) || "",
    status: normalized.status,
    conclusion: normalized.status === "completed" ? normalized.conclusion : undefined,
    externalId: asString(checkRun.id),
    detailsUrl: asString(checkRun.details_url) || asString(checkRun.html_url),
    output: normalizeOutput(checkRun.output),
    provider: "github_actions",
  };
}

function fromGitLab(body: Record<string, any>): NormalizedExternalCheckPayload | null {
  const objectAttributes = asRecord(body.object_attributes);
  const objectKind = asString(body.object_kind);
  if (!objectKind || !["pipeline", "build"].includes(objectKind)) return null;

  const statusRaw =
    asString(objectAttributes.status) ||
    asString(body.status) ||
    asString(body.build_status);
  const normalized = normalizeStatus(statusRaw, asString(body.conclusion));

  const fallbackName = objectKind === "build" ? "gitlab/build" : "gitlab/pipeline";
  const name =
    asString(objectAttributes.name) ||
    asString(body.build_name) ||
    fallbackName;
  const projectWebUrl = asString(asRecord(body.project).web_url);
  const pipelineId = asString(objectAttributes.id);
  const detailsUrl =
    asString(objectAttributes.url) ||
    (projectWebUrl && pipelineId
      ? `${projectWebUrl.replace(/\/$/, "")}/-/pipelines/${pipelineId}`
      : undefined);

  return {
    pullRequestNumber:
      asNumber(asRecord(body.merge_request).iid) ||
      asNumber(asRecord(body.object_attributes).iid),
    name: name.startsWith("gitlab/") ? name : `gitlab/${name}`,
    headSha:
      asString(objectAttributes.sha) ||
      asString(asRecord(body.commit).id) ||
      asString(body.sha) ||
      "",
    status: normalized.status,
    conclusion: normalized.status === "completed" ? normalized.conclusion : undefined,
    externalId: pipelineId,
    detailsUrl,
    output: normalizeOutput({
      title: "GitLab CI",
      summary: asString(body.object_kind) || "pipeline",
    }),
    provider: "gitlab",
  };
}

function fromCircleCI(body: Record<string, any>): NormalizedExternalCheckPayload | null {
  const workflow = asRecord(body.workflow);
  const pipeline = asRecord(body.pipeline);
  const vcs = asRecord(body.vcs);
  const rawStatus = asString(workflow.status) || asString(body.status);
  const rawSha =
    asString(vcs.revision) ||
    asString(asRecord(pipeline.vcs).revision) ||
    asString(body.sha);
  if (!rawStatus || !rawSha) return null;

  const normalized = normalizeStatus(rawStatus, asString(body.conclusion));
  const prRef = asString((vcs.pull_requests || [])[0]);
  const prMatch = prRef?.match(/\/(\d+)(?:\/)?$/);

  return {
    pullRequestNumber:
      asNumber(asRecord(body.pull_request).number) ||
      (prMatch ? Number.parseInt(prMatch[1], 10) : undefined),
    name: `circleci/${asString(workflow.name) || "workflow"}`,
    headSha: rawSha,
    status: normalized.status,
    conclusion: normalized.status === "completed" ? normalized.conclusion : undefined,
    externalId: asString(workflow.id) || asString(pipeline.id),
    detailsUrl: asString(workflow.url) || asString(body.build_url),
    provider: "circleci",
  };
}

function fromBuildkite(body: Record<string, any>): NormalizedExternalCheckPayload | null {
  const build = asRecord(body.build);
  if (!asString(build.state) || !asString(build.commit)) return null;
  const normalized = normalizeStatus(asString(build.state), asString(body.conclusion));
  return {
    pullRequestNumber:
      asNumber(asRecord(build.pull_request).id) ||
      asNumber(asRecord(body.pull_request).number),
    name: `buildkite/${asString(asRecord(build.pipeline).slug) || "pipeline"}`,
    headSha: asString(build.commit) || "",
    status: normalized.status,
    conclusion: normalized.status === "completed" ? normalized.conclusion : undefined,
    externalId: asString(build.id) || asString(build.number),
    detailsUrl: asString(build.web_url),
    provider: "buildkite",
  };
}

function fromJenkins(body: Record<string, any>): NormalizedExternalCheckPayload | null {
  const build = asRecord(body.build);
  const rawStatus =
    asString(body.status) ||
    asString(build.status) ||
    asString(build.result) ||
    asString(build.phase);
  const headSha =
    asString(body.head_sha) ||
    asString(asRecord(build.scm).revision) ||
    asString(body.sha);
  if (!rawStatus || !headSha) return null;

  const normalized = normalizeStatus(rawStatus, asString(body.conclusion));
  return {
    pullRequestNumber: asNumber(asRecord(body.pull_request).number),
    name: asString(body.name) || `jenkins/${asString(body.job_name) || "build"}`,
    headSha,
    status: normalized.status,
    conclusion: normalized.status === "completed" ? normalized.conclusion : undefined,
    externalId: asString(build.id) || asString(build.number),
    detailsUrl: asString(body.details_url) || asString(build.url),
    provider: "jenkins",
  };
}

export function normalizeExternalCiCheckPayload(bodyRaw: unknown) {
  const body = asRecord(bodyRaw);

  if (isNormalizedPayload(body)) {
    const normalized = fromNormalized(body);
    if (!normalized.headSha) {
      return { ok: false as const, error: "Missing required fields" };
    }
    return { ok: true as const, data: normalized };
  }

  const providerPayloads = [
    fromGitHubActions(body),
    fromGitLab(body),
    fromCircleCI(body),
    fromBuildkite(body),
    fromJenkins(body),
  ];
  const match = providerPayloads.find((item) => !!item);
  if (!match) {
    return {
      ok: false as const,
      error:
        "Missing required fields. Provide normalized fields (name, headSha, status) or a supported provider webhook payload.",
    };
  }

  if (!match.name || !match.headSha || !match.status) {
    return { ok: false as const, error: "Missing required fields in provider payload" };
  }

  return { ok: true as const, data: match };
}
