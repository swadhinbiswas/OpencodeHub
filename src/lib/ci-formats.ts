/**
 * CI Provider Workflow Formats Library
 * Support for GitLab CI, CircleCI, Buildkite, and Jenkins workflow formats
 */

import { logger } from "./logger";

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowStep {
    name: string;
    run?: string;
    uses?: string;
    with?: Record<string, string>;
    env?: Record<string, string>;
    if?: string;
}

export interface WorkflowJob {
    name: string;
    runsOn?: string;
    image?: string;
    steps: WorkflowStep[];
    needs?: string[];
    env?: Record<string, string>;
    services?: Record<string, { image: string; env?: Record<string, string> }>;
}

export interface UnifiedWorkflow {
    name: string;
    triggers: {
        push?: { branches?: string[] };
        pullRequest?: { branches?: string[] };
        schedule?: string[];
        manual?: boolean;
    };
    env?: Record<string, string>;
    jobs: Record<string, WorkflowJob>;
}

// ============================================================================
// GITHUB ACTIONS FORMAT (Reference)
// ============================================================================

export function toGitHubActions(workflow: UnifiedWorkflow): string {
    const yaml: Record<string, unknown> = {
        name: workflow.name,
        on: {},
    };

    if (workflow.triggers.push) {
        yaml.on = { ...yaml.on as object, push: { branches: workflow.triggers.push.branches } };
    }
    if (workflow.triggers.pullRequest) {
        yaml.on = { ...yaml.on as object, pull_request: { branches: workflow.triggers.pullRequest.branches } };
    }
    if (workflow.triggers.schedule) {
        yaml.on = { ...yaml.on as object, schedule: workflow.triggers.schedule.map(cron => ({ cron })) };
    }
    if (workflow.triggers.manual) {
        yaml.on = { ...yaml.on as object, workflow_dispatch: {} };
    }

    if (workflow.env) {
        yaml.env = workflow.env;
    }

    yaml.jobs = {};
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
        (yaml.jobs as Record<string, unknown>)[jobId] = {
            name: job.name,
            "runs-on": job.runsOn || "ubuntu-latest",
            ...(job.needs && { needs: job.needs }),
            ...(job.env && { env: job.env }),
            steps: job.steps.map(step => ({
                name: step.name,
                ...(step.run && { run: step.run }),
                ...(step.uses && { uses: step.uses }),
                ...(step.with && { with: step.with }),
                ...(step.env && { env: step.env }),
                ...(step.if && { if: step.if }),
            })),
        };
    }

    return toYAML(yaml);
}

// ============================================================================
// GITLAB CI FORMAT
// ============================================================================

export function toGitLabCI(workflow: UnifiedWorkflow): string {
    const yaml: Record<string, unknown> = {};

    // Global settings
    if (workflow.env) {
        yaml.variables = workflow.env;
    }

    // Stages from job dependencies
    const stages = new Set<string>();
    const jobStages = new Map<string, string>();

    // Determine stages based on dependencies
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
        if (!job.needs || job.needs.length === 0) {
            jobStages.set(jobId, "build");
            stages.add("build");
        } else {
            jobStages.set(jobId, "test");
            stages.add("test");
        }
    }

    yaml.stages = Array.from(stages);

    // Convert jobs
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
        const gitlabJob: Record<string, unknown> = {
            stage: jobStages.get(jobId) || "build",
        };

        if (job.image) {
            gitlabJob.image = job.image;
        }

        // Convert steps to script
        const scripts: string[] = [];
        for (const step of job.steps) {
            if (step.run) {
                scripts.push(`# ${step.name}`);
                scripts.push(...step.run.split("\n").filter(Boolean));
            }
        }
        gitlabJob.script = scripts;

        if (job.needs) {
            gitlabJob.needs = job.needs;
        }

        if (job.env) {
            gitlabJob.variables = job.env;
        }

        // Rules for triggers
        const rules: { if: string }[] = [];
        if (workflow.triggers.push?.branches) {
            for (const branch of workflow.triggers.push.branches) {
                rules.push({ if: `$CI_COMMIT_BRANCH == "${branch}"` });
            }
        }
        if (workflow.triggers.pullRequest) {
            rules.push({ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' });
        }
        if (rules.length > 0) {
            gitlabJob.rules = rules;
        }

        yaml[jobId] = gitlabJob;
    }

    return toYAML(yaml);
}

// ============================================================================
// CIRCLECI FORMAT
// ============================================================================

export function toCircleCI(workflow: UnifiedWorkflow): string {
    const yaml: Record<string, unknown> = {
        version: 2.1,
        jobs: {},
        workflows: {
            [workflow.name.toLowerCase().replace(/\s+/g, "-")]: {
                jobs: [] as unknown[],
            },
        },
    };

    const workflowJobs: unknown[] = [];

    for (const [jobId, job] of Object.entries(workflow.jobs)) {
        const circleJob: Record<string, unknown> = {
            docker: [{ image: job.image || "cimg/base:stable" }],
            steps: ["checkout"],
        };

        if (job.env) {
            circleJob.environment = job.env;
        }

        // Convert steps
        for (const step of job.steps) {
            if (step.run) {
                (circleJob.steps as unknown[]).push({
                    run: {
                        name: step.name,
                        command: step.run,
                    },
                });
            }
        }

        (yaml.jobs as Record<string, unknown>)[jobId] = circleJob;

        // Add to workflow
        const workflowJob: Record<string, unknown> = { [jobId]: {} };
        if (job.needs && job.needs.length > 0) {
            workflowJob[jobId] = { requires: job.needs };
        }

        // Add filters for branches
        if (workflow.triggers.push?.branches) {
            workflowJob[jobId] = {
                ...workflowJob[jobId] as object,
                filters: {
                    branches: { only: workflow.triggers.push.branches },
                },
            };
        }

        workflowJobs.push(workflowJob);
    }

    (yaml.workflows as Record<string, unknown>)[workflow.name.toLowerCase().replace(/\s+/g, "-")] = {
        jobs: workflowJobs,
    };

    return toYAML(yaml);
}

// ============================================================================
// BUILDKITE FORMAT
// ============================================================================

export function toBuildkite(workflow: UnifiedWorkflow): string {
    const yaml: Record<string, unknown> = {
        steps: [],
    };

    if (workflow.env) {
        yaml.env = workflow.env;
    }

    const steps: unknown[] = [];

    for (const [jobId, job] of Object.entries(workflow.jobs)) {
        const buildkiteStep: Record<string, unknown> = {
            label: `:pipeline: ${job.name}`,
            key: jobId,
        };

        // Convert steps to commands
        const commands: string[] = [];
        for (const step of job.steps) {
            if (step.run) {
                commands.push(`echo "--- ${step.name}"`);
                commands.push(...step.run.split("\n").filter(Boolean));
            }
        }
        buildkiteStep.commands = commands;

        if (job.needs && job.needs.length > 0) {
            buildkiteStep.depends_on = job.needs;
        }

        if (job.env) {
            buildkiteStep.env = job.env;
        }

        // Docker plugin for custom images
        if (job.image) {
            buildkiteStep.plugins = [
                {
                    "docker#v5.0.0": {
                        image: job.image,
                    },
                },
            ];
        }

        // Branch filtering
        if (workflow.triggers.push?.branches) {
            buildkiteStep.branches = workflow.triggers.push.branches.join(" ");
        }

        steps.push(buildkiteStep);
    }

    yaml.steps = steps;

    return toYAML(yaml);
}

// ============================================================================
// JENKINS PIPELINE FORMAT (Jenkinsfile)
// ============================================================================

export function toJenkins(workflow: UnifiedWorkflow): string {
    const lines: string[] = [];

    lines.push("pipeline {");
    lines.push("    agent any");
    lines.push("");

    // Environment variables
    if (workflow.env && Object.keys(workflow.env).length > 0) {
        lines.push("    environment {");
        for (const [key, value] of Object.entries(workflow.env)) {
            lines.push(`        ${key} = "${value}"`);
        }
        lines.push("    }");
        lines.push("");
    }

    // Triggers
    if (workflow.triggers.push || workflow.triggers.schedule) {
        lines.push("    triggers {");
        if (workflow.triggers.schedule) {
            for (const cron of workflow.triggers.schedule) {
                lines.push(`        cron('${cron}')`);
            }
        }
        lines.push("    }");
        lines.push("");
    }

    // Stages
    lines.push("    stages {");

    for (const [jobId, job] of Object.entries(workflow.jobs)) {
        lines.push(`        stage('${job.name}') {`);

        // Agent with Docker image
        if (job.image) {
            lines.push("            agent {");
            lines.push("                docker {");
            lines.push(`                    image '${job.image}'`);
            lines.push("                }");
            lines.push("            }");
        }

        // When clause for branches
        if (workflow.triggers.push?.branches) {
            lines.push("            when {");
            lines.push("                anyOf {");
            for (const branch of workflow.triggers.push.branches) {
                lines.push(`                    branch '${branch}'`);
            }
            lines.push("                }");
            lines.push("            }");
        }

        // Environment for this stage
        if (job.env && Object.keys(job.env).length > 0) {
            lines.push("            environment {");
            for (const [key, value] of Object.entries(job.env)) {
                lines.push(`                ${key} = "${value}"`);
            }
            lines.push("            }");
        }

        // Steps
        lines.push("            steps {");
        for (const step of job.steps) {
            if (step.run) {
                lines.push(`                // ${step.name}`);
                lines.push(`                sh '''`);
                lines.push(step.run.split("\n").map(l => `                    ${l}`).join("\n"));
                lines.push(`                '''`);
            }
        }
        lines.push("            }");

        lines.push("        }");
    }

    lines.push("    }");

    // Post actions
    lines.push("");
    lines.push("    post {");
    lines.push("        always {");
    lines.push("            cleanWs()");
    lines.push("        }");
    lines.push("    }");

    lines.push("}");

    return lines.join("\n");
}

// ============================================================================
// PARSING FROM FORMATS
// ============================================================================

/**
 * Parse GitHub Actions workflow to unified format
 */
export function parseGitHubActions(content: string): UnifiedWorkflow | null {
    try {
        const yaml = parseYAML(content);

        const workflow: UnifiedWorkflow = {
            name: (yaml.name as string) || "Workflow",
            triggers: {},
            jobs: {},
        };

        // Parse triggers
        const on = (yaml.on as Record<string, any>) || {};
        if (on.push) {
            workflow.triggers.push = { branches: on.push.branches };
        }
        if (on.pull_request) {
            workflow.triggers.pullRequest = { branches: on.pull_request.branches };
        }
        if (on.schedule) {
            workflow.triggers.schedule = on.schedule.map((s: { cron: string }) => s.cron);
        }
        if (on.workflow_dispatch !== undefined) {
            workflow.triggers.manual = true;
        }

        workflow.env = yaml.env as Record<string, string>;

        // Parse jobs
        for (const [jobId, job] of Object.entries(yaml.jobs || {})) {
            const j = job as Record<string, any>;
            workflow.jobs[jobId] = {
                name: (j.name as string) || jobId,
                runsOn: j["runs-on"] as string,
                needs: j.needs as string[],
                env: j.env as Record<string, string>,
                steps: ((j.steps as unknown[]) || []).map((step: any) => ({
                    name: step.name || "",
                    run: step.run,
                    uses: step.uses,
                    with: step.with,
                    env: step.env,
                    if: step.if,
                })),
            };
        }

        return workflow;
    } catch (error) {
        logger.error({ error }, "Failed to parse GitHub Actions workflow");
        return null;
    }
}

/**
 * Convert workflow between formats
 */
export function convertWorkflow(
    content: string,
    fromFormat: "github" | "gitlab" | "circleci" | "buildkite" | "jenkins",
    toFormat: "github" | "gitlab" | "circleci" | "buildkite" | "jenkins"
): string | null {
    // Parse the source format to unified
    let workflow: UnifiedWorkflow | null = null;

    if (fromFormat === "github") {
        workflow = parseGitHubActions(content);
    }
    // Add more parsers as needed

    if (!workflow) {
        return null;
    }

    // Convert to target format
    switch (toFormat) {
        case "github":
            return toGitHubActions(workflow);
        case "gitlab":
            return toGitLabCI(workflow);
        case "circleci":
            return toCircleCI(workflow);
        case "buildkite":
            return toBuildkite(workflow);
        case "jenkins":
            return toJenkins(workflow);
        default:
            return null;
    }
}

// ============================================================================
// YAML UTILITIES
// ============================================================================

function toYAML(obj: Record<string, unknown>, indent = 0): string {
    const lines: string[] = [];
    const prefix = "  ".repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) continue;

        if (Array.isArray(value)) {
            lines.push(`${prefix}${key}:`);
            for (const item of value) {
                if (typeof item === "object" && item !== null) {
                    const itemLines = toYAML(item as Record<string, unknown>, 0).split("\n");
                    lines.push(`${prefix}  - ${itemLines[0]}`);
                    for (let i = 1; i < itemLines.length; i++) {
                        if (itemLines[i].trim()) {
                            lines.push(`${prefix}    ${itemLines[i]}`);
                        }
                    }
                } else {
                    lines.push(`${prefix}  - ${item}`);
                }
            }
        } else if (typeof value === "object") {
            lines.push(`${prefix}${key}:`);
            lines.push(toYAML(value as Record<string, unknown>, indent + 1));
        } else if (typeof value === "string" && value.includes("\n")) {
            lines.push(`${prefix}${key}: |`);
            for (const line of value.split("\n")) {
                lines.push(`${prefix}  ${line}`);
            }
        } else {
            lines.push(`${prefix}${key}: ${value}`);
        }
    }

    return lines.join("\n");
}

function parseYAML(content: string): Record<string, unknown> {
    // Simple YAML parser - in production use a proper library
    const result: Record<string, unknown> = {};
    const lines = content.split("\n");
    const stack: { indent: number; obj: Record<string, unknown>; key?: string }[] = [{ indent: -1, obj: result }];

    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith("#")) continue;

        const indent = line.search(/\S/);
        const trimmed = line.trim();

        // Pop stack until we find parent level
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        const parent = stack[stack.length - 1].obj;

        if (trimmed.startsWith("- ")) {
            // Array item
            const lastKey = stack[stack.length - 1].key;
            if (lastKey && !Array.isArray(parent[lastKey])) {
                parent[lastKey] = [];
            }
            if (lastKey && Array.isArray(parent[lastKey])) {
                const value = trimmed.slice(2);
                if (value.includes(":")) {
                    const itemObj: Record<string, unknown> = {};
                    const [k, v] = value.split(":").map(s => s.trim());
                    itemObj[k] = v;
                    (parent[lastKey] as unknown[]).push(itemObj);
                } else {
                    (parent[lastKey] as unknown[]).push(value);
                }
            }
        } else if (trimmed.includes(":")) {
            const colonIdx = trimmed.indexOf(":");
            const key = trimmed.slice(0, colonIdx).trim();
            const value = trimmed.slice(colonIdx + 1).trim();

            if (value) {
                parent[key] = value;
            } else {
                parent[key] = {};
                stack.push({ indent, obj: parent[key] as Record<string, unknown>, key });
            }
        }
    }

    return result;
}

// ============================================================================
// PROVIDER TEMPLATES
// ============================================================================

/**
 * Get CI template for a specific provider
 */
export function getCITemplateForProvider(
    provider: "github" | "gitlab" | "circleci" | "buildkite" | "jenkins",
    language: "node" | "python" | "go" | "rust"
): string {
    const baseWorkflow: UnifiedWorkflow = {
        name: `${language.charAt(0).toUpperCase() + language.slice(1)} CI`,
        triggers: {
            push: { branches: ["main", "master"] },
            pullRequest: { branches: ["main", "master"] },
        },
        jobs: {},
    };

    // Add language-specific job
    switch (language) {
        case "node":
            baseWorkflow.jobs.build = {
                name: "Build and Test",
                image: "node:20",
                steps: [
                    { name: "Checkout", uses: "actions/checkout@v4" },
                    { name: "Install dependencies", run: "npm ci" },
                    { name: "Build", run: "npm run build --if-present" },
                    { name: "Test", run: "npm test" },
                ],
            };
            break;
        case "python":
            baseWorkflow.jobs.build = {
                name: "Build and Test",
                image: "python:3.12",
                steps: [
                    { name: "Checkout", uses: "actions/checkout@v4" },
                    { name: "Install dependencies", run: "pip install -r requirements.txt" },
                    { name: "Test", run: "pytest" },
                ],
            };
            break;
        case "go":
            baseWorkflow.jobs.build = {
                name: "Build and Test",
                image: "golang:1.22",
                steps: [
                    { name: "Checkout", uses: "actions/checkout@v4" },
                    { name: "Build", run: "go build -v ./..." },
                    { name: "Test", run: "go test -v ./..." },
                ],
            };
            break;
        case "rust":
            baseWorkflow.jobs.build = {
                name: "Build and Test",
                image: "rust:latest",
                steps: [
                    { name: "Checkout", uses: "actions/checkout@v4" },
                    { name: "Build", run: "cargo build --verbose" },
                    { name: "Test", run: "cargo test --verbose" },
                ],
            };
            break;
    }

    // Convert to requested format
    switch (provider) {
        case "github":
            return toGitHubActions(baseWorkflow);
        case "gitlab":
            return toGitLabCI(baseWorkflow);
        case "circleci":
            return toCircleCI(baseWorkflow);
        case "buildkite":
            return toBuildkite(baseWorkflow);
        case "jenkins":
            return toJenkins(baseWorkflow);
    }
}
