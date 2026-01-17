/**
 * OpenCodeHub CI/CD Pipeline System
 *
 * GitHub Actions compatible workflow engine
 * Supports running workflows defined in .github/workflows/*.yml
 */

import Dockerode from "dockerode";
import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";
import { parse as parseYaml } from "yaml";
import { generateId } from "./utils";

// Types
export interface WorkflowConfig {
  name: string;
  on: WorkflowTrigger;
  env?: Record<string, string>;
  defaults?: {
    run?: {
      shell?: string;
      "working-directory"?: string;
    };
  };
  jobs: Record<string, JobConfig>;
}

export interface WorkflowTrigger {
  push?: {
    branches?: string[];
    "branches-ignore"?: string[];
    tags?: string[];
    paths?: string[];
    "paths-ignore"?: string[];
  };
  pull_request?: {
    branches?: string[];
    types?: string[];
  };
  workflow_dispatch?: {
    inputs?: Record<
      string,
      {
        description?: string;
        required?: boolean;
        default?: string;
        type?: "string" | "boolean" | "choice";
        options?: string[];
      }
    >;
  };
  schedule?: Array<{ cron: string }>;
  release?: { types?: string[] };
  issues?: { types?: string[] };
  issue_comment?: { types?: string[] };
  repository_dispatch?: { types?: string[] };
}

export interface JobConfig {
  name?: string;
  "runs-on": string | string[];
  needs?: string | string[];
  if?: string;
  env?: Record<string, string>;
  defaults?: {
    run?: {
      shell?: string;
      "working-directory"?: string;
    };
  };
  steps: StepConfig[];
  container?: ContainerConfig;
  services?: Record<string, ServiceConfig>;
  strategy?: {
    matrix?: Record<string, any>;
    "fail-fast"?: boolean;
    "max-parallel"?: number;
  };
  timeout_minutes?: number;
  continue_on_error?: boolean;
  outputs?: Record<string, string>;
}

export interface StepConfig {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  shell?: string;
  with?: Record<string, any>;
  env?: Record<string, string>;
  "working-directory"?: string;
  if?: string;
  "continue-on-error"?: boolean;
  "timeout-minutes"?: number;
}

export interface ContainerConfig {
  image: string;
  credentials?: {
    username: string;
    password: string;
  };
  env?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  options?: string;
}

export interface ServiceConfig {
  image: string;
  credentials?: {
    username: string;
    password: string;
  };
  env?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  options?: string;
}

// Run status types
export type RunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";
export type JobStatus = RunStatus;
export type StepStatus = RunStatus;

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  repositoryId: string;
  branch: string;
  commit: string;
  status: RunStatus;
  conclusion?: "success" | "failure" | "cancelled" | "skipped";
  triggeredBy: string;
  triggerEvent: string;
  startedAt?: Date;
  completedAt?: Date;
  jobs: JobRun[];
  outputs?: Record<string, any>;
  logs?: string;
}

export interface JobRun {
  id: string;
  name: string;
  status: JobStatus;
  conclusion?: "success" | "failure" | "cancelled" | "skipped";
  startedAt?: Date;
  completedAt?: Date;
  steps: StepRun[];
  runner?: string;
  outputs?: Record<string, string>;
  logs?: string;
}

export interface StepRun {
  id: string;
  name: string;
  number: number;
  status: StepStatus;
  conclusion?: "success" | "failure" | "cancelled" | "skipped";
  startedAt?: Date;
  completedAt?: Date;
  outputs?: Record<string, string>;
  logs?: string;
}

// Context object available during workflow execution
export interface WorkflowContext {
  github: {
    token: string;
    repository: string;
    repository_owner: string;
    event_name: string;
    event: any;
    sha: string;
    ref: string;
    head_ref?: string;
    base_ref?: string;
    actor: string;
    run_id: string;
    run_number: number;
    workflow: string;
    job: string;
    action?: string;
    action_path?: string;
    action_repository?: string;
    action_ref?: string;
    server_url: string;
    api_url: string;
    graphql_url: string;
  };
  env: Record<string, string>;
  job: {
    status: string;
    container?: {
      id: string;
      network: string;
    };
    services?: Record<
      string,
      { id: string; network: string; ports: Record<string, string> }
    >;
  };
  steps: Record<
    string,
    { outputs: Record<string, string>; outcome: string; conclusion: string }
  >;
  runner: {
    name: string;
    os: string;
    arch: string;
    temp: string;
    tool_cache: string;
  };
  matrix?: Record<string, any>;
  needs?: Record<string, { outputs: Record<string, string>; result: string }>;
  inputs?: Record<string, string>;
  secrets: Record<string, string>;
  vars: Record<string, string>;
}

/**
 * Pipeline Runner - Executes CI/CD workflows
 */
export class PipelineRunner extends EventEmitter {
  private docker: Dockerode;
  private workDir: string;
  private artifactsDir: string;
  private cacheDir: string;
  private runningJobs: Map<string, any> = new Map();

  constructor(options: {
    dockerSocket?: string;
    workDir: string;
    artifactsDir: string;
    cacheDir: string;
  }) {
    super();
    this.docker = new Dockerode({
      socketPath: options.dockerSocket || "/var/run/docker.sock",
    });
    this.workDir = options.workDir;
    this.artifactsDir = options.artifactsDir;
    this.cacheDir = options.cacheDir;
  }

  /**
   * Parse workflow file
   */
  async parseWorkflow(workflowPath: string): Promise<WorkflowConfig> {
    const content = await fs.readFile(workflowPath, "utf-8");
    return parseYaml(content) as WorkflowConfig;
  }

  /**
   * Check if workflow should run based on trigger
   */
  shouldTrigger(
    workflow: WorkflowConfig,
    event: string,
    payload: {
      ref?: string;
      paths?: string[];
      action?: string;
    }
  ): boolean {
    const trigger = workflow.on;

    // Check push event
    if (event === "push" && trigger.push) {
      const {
        branches,
        "branches-ignore": branchesIgnore,
        tags,
        paths,
        "paths-ignore": pathsIgnore,
      } = trigger.push;

      // Check branch filters
      if (payload.ref) {
        const branch = payload.ref.replace("refs/heads/", "");
        const tag = payload.ref.replace("refs/tags/", "");

        if (branches && !this.matchesPattern(branch, branches)) return false;
        if (branchesIgnore && this.matchesPattern(branch, branchesIgnore))
          return false;
        if (tags && !payload.ref.startsWith("refs/tags/")) return false;
      }

      // Check path filters
      if (payload.paths) {
        if (paths && !payload.paths.some((p) => this.matchesPattern(p, paths)))
          return false;
        if (
          pathsIgnore &&
          payload.paths.every((p) => this.matchesPattern(p, pathsIgnore))
        )
          return false;
      }

      return true;
    }

    // Check pull_request event
    if (event === "pull_request" && trigger.pull_request) {
      const { branches, types } = trigger.pull_request;
      if (types && payload.action && !types.includes(payload.action))
        return false;
      if (branches && payload.ref) {
        const branch = payload.ref.replace("refs/heads/", "");
        if (!this.matchesPattern(branch, branches)) return false;
      }
      return true;
    }

    // Check workflow_dispatch (always trigger if present)
    if (event === "workflow_dispatch" && trigger.workflow_dispatch) {
      return true;
    }

    // Check schedule (handled by scheduler)
    if (event === "schedule" && trigger.schedule) {
      return true;
    }

    return false;
  }

  /**
   * Match string against glob patterns
   */
  private matchesPattern(str: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      // Simple glob matching
      const regex = new RegExp(
        "^" +
        pattern
          .replace(/\*\*/g, ".*")
          .replace(/\*/g, "[^/]*")
          .replace(/\?/g, ".") +
        "$"
      );
      return regex.test(str);
    });
  }

  /**
   * Run a workflow
   */
  async runWorkflow(
    workflow: WorkflowConfig,
    options: {
      repositoryId: string;
      repositoryPath: string;
      branch: string;
      commit: string;
      triggeredBy: string;
      triggerEvent: string;
      inputs?: Record<string, string>;
      secrets?: Record<string, string>;
      variables?: Record<string, string>;
    }
  ): Promise<WorkflowRun> {
    const runId = generateId();
    const run: WorkflowRun = {
      id: runId,
      workflowId: workflow.name,
      workflowName: workflow.name,
      repositoryId: options.repositoryId,
      branch: options.branch,
      commit: options.commit,
      status: "queued",
      triggeredBy: options.triggeredBy,
      triggerEvent: options.triggerEvent,
      jobs: [],
    };

    this.emit("workflow:start", run);

    try {
      // Build job dependency graph
      const jobOrder = this.resolveJobDependencies(workflow.jobs);

      run.status = "in_progress";
      run.startedAt = new Date();
      this.emit("workflow:progress", run);

      // Create context
      const context: WorkflowContext = {
        github: {
          token: options.secrets?.GITHUB_TOKEN || "",
          repository: options.repositoryId,
          repository_owner: options.repositoryId.split("/")[0],
          event_name: options.triggerEvent,
          event: {},
          sha: options.commit,
          ref: `refs/heads/${options.branch}`,
          actor: options.triggeredBy,
          run_id: runId,
          run_number: 1,
          workflow: workflow.name,
          job: "",
          server_url: process.env.SERVER_URL || "http://localhost:4321",
          api_url: process.env.API_URL || "http://localhost:4321/api",
          graphql_url:
            process.env.GRAPHQL_URL || "http://localhost:4321/graphql",
        },
        env: { ...process.env, ...workflow.env } as Record<string, string>,
        job: { status: "in_progress" },
        steps: {},
        runner: {
          name: "opencodehub-runner",
          os: "linux",
          arch: "x64",
          temp: "/tmp",
          tool_cache: this.cacheDir,
        },
        inputs: options.inputs,
        secrets: options.secrets || {},
        vars: options.variables || {},
        needs: {},
      };

      // Run jobs in dependency order
      for (const jobId of jobOrder) {
        const jobConfig = workflow.jobs[jobId];

        // Check job condition
        if (jobConfig.if && !this.evaluateExpression(jobConfig.if, context)) {
          const skippedJob: JobRun = {
            id: generateId(),
            name: jobConfig.name || jobId,
            status: "skipped",
            conclusion: "skipped",
            steps: [],
          };
          run.jobs.push(skippedJob);
          continue;
        }

        // Check dependencies
        const needs = Array.isArray(jobConfig.needs)
          ? jobConfig.needs
          : jobConfig.needs
            ? [jobConfig.needs]
            : [];
        const needsResults: Record<
          string,
          { outputs: Record<string, string>; result: string }
        > = {};

        let shouldSkip = false;
        for (const dep of needs) {
          const depJob = run.jobs.find(
            (j) => j.name === (workflow.jobs[dep].name || dep)
          );
          if (!depJob || depJob.conclusion !== "success") {
            shouldSkip = true;
            break;
          }
          needsResults[dep] = {
            outputs: depJob.outputs || {},
            result: depJob.conclusion || "success",
          };
        }

        if (shouldSkip) {
          const skippedJob: JobRun = {
            id: generateId(),
            name: jobConfig.name || jobId,
            status: "skipped",
            conclusion: "skipped",
            steps: [],
          };
          run.jobs.push(skippedJob);
          continue;
        }

        context.needs = needsResults;
        context.github.job = jobId;

        const jobRun = await this.runJob(
          jobId,
          jobConfig,
          context,
          options.repositoryPath
        );
        run.jobs.push(jobRun);

        if (jobRun.conclusion === "failure" && !jobConfig.continue_on_error) {
          run.status = "completed";
          run.conclusion = "failure";
          run.completedAt = new Date();
          this.emit("workflow:complete", run);
          return run;
        }
      }

      run.status = "completed";
      run.conclusion = run.jobs.every(
        (j) => j.conclusion === "success" || j.conclusion === "skipped"
      )
        ? "success"
        : "failure";
      run.completedAt = new Date();
      this.emit("workflow:complete", run);

      return run;
    } catch (error) {
      run.status = "failed";
      run.conclusion = "failure";
      run.completedAt = new Date();
      run.logs = error instanceof Error ? error.message : String(error);
      this.emit("workflow:error", run, error);
      return run;
    }
  }

  /**
   * Resolve job dependencies and return execution order
   */
  private resolveJobDependencies(jobs: Record<string, JobConfig>): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (jobId: string) => {
      if (visited.has(jobId)) return;
      visited.add(jobId);

      const job = jobs[jobId];
      const needs = Array.isArray(job.needs)
        ? job.needs
        : job.needs
          ? [job.needs]
          : [];

      for (const dep of needs) {
        visit(dep);
      }

      result.push(jobId);
    };

    for (const jobId of Object.keys(jobs)) {
      visit(jobId);
    }

    return result;
  }

  /**
   * Run a single job
   */
  private async runJob(
    jobId: string,
    config: JobConfig,
    context: WorkflowContext,
    repositoryPath: string
  ): Promise<JobRun> {
    const jobRun: JobRun = {
      id: generateId(),
      name: config.name || jobId,
      status: "in_progress",
      startedAt: new Date(),
      steps: [],
      outputs: {},
    };

    this.emit("job:start", jobRun);

    try {
      // Determine container image
      let containerImage = "node:20";
      const runsOn = Array.isArray(config["runs-on"])
        ? config["runs-on"][0]
        : config["runs-on"];

      // Map runners to Docker images
      const runnerImages: Record<string, string> = {
        "ubuntu-latest": "ubuntu:22.04",
        "ubuntu-22.04": "ubuntu:22.04",
        "ubuntu-20.04": "ubuntu:20.04",
        "node-18": "node:18",
        "node-20": "node:20",
        "python-3.11": "python:3.11",
        "python-3.10": "python:3.10",
      };

      if (config.container) {
        containerImage = config.container.image;
      } else if (runnerImages[runsOn]) {
        containerImage = runnerImages[runsOn];
      }

      // Start services if defined
      const serviceContainers: Map<string, Dockerode.Container> = new Map();
      if (config.services) {
        for (const [serviceName, serviceConfig] of Object.entries(
          config.services
        )) {
          const container = await this.docker.createContainer({
            Image: serviceConfig.image,
            Env: Object.entries(serviceConfig.env || {}).map(
              ([k, v]) => `${k}=${v}`
            ),
            HostConfig: {
              PortBindings: this.parsePortBindings(serviceConfig.ports || []),
            },
          });
          await container.start();
          serviceContainers.set(serviceName, container);
        }
      }

      // Create job container
      const jobContainer = await this.docker.createContainer({
        Image: containerImage,
        Cmd: ["/bin/sh", "-c", "tail -f /dev/null"],
        WorkingDir: "/workspace",
        Env: [
          ...Object.entries(context.env).map(([k, v]) => `${k}=${v}`),
          ...Object.entries(config.env || {}).map(([k, v]) => `${k}=${v}`),
          `GITHUB_WORKSPACE=/workspace`,
          `GITHUB_SHA=${context.github.sha}`,
          `GITHUB_REF=${context.github.ref}`,
          `GITHUB_REPOSITORY=${context.github.repository}`,
          `GITHUB_ACTOR=${context.github.actor}`,
          `GITHUB_RUN_ID=${context.github.run_id}`,
          `GITHUB_JOB=${jobId}`,
          `CI=true`,
        ],
        HostConfig: {
          Binds: [`${repositoryPath}:/workspace:rw`],
          Memory: 2 * 1024 * 1024 * 1024, // 2GB
          MemorySwap: 2 * 1024 * 1024 * 1024, // No swap
          CpuPeriod: 100000,
          CpuQuota: 200000, // 2 CPUs
          PidsLimit: 1024, // Limit processes
          Privileged: false,
          CapDrop: ["SYS_ADMIN", "NET_ADMIN"], // Drop dangerous capabilities
        },
      });

      await jobContainer.start();
      this.runningJobs.set(jobRun.id, jobContainer);

      // Run steps
      let stepNumber = 0;
      for (const stepConfig of config.steps) {
        stepNumber++;

        const stepRun: StepRun = {
          id: stepConfig.id || generateId(),
          name: stepConfig.name || `Step ${stepNumber}`,
          number: stepNumber,
          status: "queued",
        };

        // Check step condition
        if (stepConfig.if && !this.evaluateExpression(stepConfig.if, context)) {
          stepRun.status = "skipped";
          stepRun.conclusion = "skipped";
          jobRun.steps.push(stepRun);
          continue;
        }

        stepRun.status = "in_progress";
        stepRun.startedAt = new Date();
        this.emit("step:start", stepRun);

        try {
          let output = "";

          if (stepConfig.uses) {
            // Run action
            output = await this.runAction(
              jobContainer,
              stepConfig,
              context,
              repositoryPath,
              {
                runId: context.github.run_id,
                jobId: jobRun.id,
                stepId: stepRun.id,
              }
            );
          } else if (stepConfig.run) {
            // Run shell command
            output = await this.runShellCommand(
              jobContainer,
              stepConfig,
              context,
              {
                runId: context.github.run_id,
                jobId: jobRun.id,
                stepId: stepRun.id,
              }
            );
          }

          stepRun.status = "completed";
          stepRun.conclusion = "success";
          stepRun.completedAt = new Date();
          stepRun.logs = output;

          // Parse outputs
          const outputMatches = output.matchAll(
            /::set-output name=(\w+)::(.+)/g
          );
          stepRun.outputs = {};
          for (const match of outputMatches) {
            stepRun.outputs[match[1]] = match[2];
          }

          // Update context
          context.steps[stepRun.id] = {
            outputs: stepRun.outputs,
            outcome: "success",
            conclusion: "success",
          };

          this.emit("step:complete", stepRun);
        } catch (error) {
          stepRun.status = "completed";
          stepRun.conclusion = "failure";
          stepRun.completedAt = new Date();
          stepRun.logs = error instanceof Error ? error.message : String(error);

          context.steps[stepRun.id] = {
            outputs: {},
            outcome: "failure",
            conclusion: "failure",
          };

          this.emit("step:error", stepRun, error);

          if (!stepConfig["continue-on-error"]) {
            jobRun.steps.push(stepRun);
            throw error;
          }
        }

        jobRun.steps.push(stepRun);
      }

      // Cleanup
      await jobContainer.stop();
      await jobContainer.remove();
      this.runningJobs.delete(jobRun.id);

      for (const container of serviceContainers.values()) {
        await container.stop();
        await container.remove();
      }

      jobRun.status = "completed";
      jobRun.conclusion = "success";
      jobRun.completedAt = new Date();
      this.emit("job:complete", jobRun);

      return jobRun;
    } catch (error) {
      // Cleanup on error
      const container = this.runningJobs.get(jobRun.id);
      if (container) {
        try {
          await container.stop();
          await container.remove();
        } catch { }
        this.runningJobs.delete(jobRun.id);
      }

      jobRun.status = "completed";
      jobRun.conclusion = "failure";
      jobRun.completedAt = new Date();
      jobRun.logs = error instanceof Error ? error.message : String(error);
      this.emit("job:error", jobRun, error);

      return jobRun;
    }
  }

  /**
   * Run a GitHub Action
   */
  private async runAction(
    container: Dockerode.Container,
    step: StepConfig,
    context: WorkflowContext,
    repositoryPath: string,
    logContext?: { runId: string; jobId: string; stepId: string }
  ): Promise<string> {
    if (!step.uses) throw new Error("No action specified");

    // Parse action reference: owner/repo@version or ./local-path
    const actionRef = step.uses;
    let actionPath: string;

    if (actionRef.startsWith("./")) {
      // Local action
      actionPath = path.join(repositoryPath, actionRef);
    } else {
      // Remote action - download from GitHub or cache
      const [repo, version] = actionRef.split("@");
      const cacheDir = path.join(
        this.cacheDir,
        "actions",
        repo,
        version || "main"
      );

      // Check cache
      try {
        await fs.access(cacheDir);
        actionPath = cacheDir;
      } catch {
        // Download action (simplified - real implementation would clone repo)
        await fs.mkdir(cacheDir, { recursive: true });
        actionPath = cacheDir;
      }
    }

    // Read action.yml
    let actionConfig: any;
    try {
      const actionYml = await fs.readFile(
        path.join(actionPath, "action.yml"),
        "utf-8"
      );
      actionConfig = parseYaml(actionYml);
    } catch {
      const actionYml = await fs.readFile(
        path.join(actionPath, "action.yaml"),
        "utf-8"
      );
      actionConfig = parseYaml(actionYml);
    }

    // Build environment variables from inputs
    const inputEnv = Object.entries(step.with || {}).map(([key, value]) => {
      return `INPUT_${key.toUpperCase().replace(/-/g, "_")}=${value}`;
    });

    // Run action based on type
    if (
      actionConfig.runs?.using === "node16" ||
      actionConfig.runs?.using === "node20"
    ) {
      const mainScript = actionConfig.runs.main;
      const exec = await container.exec({
        Cmd: ["node", path.join("/actions", mainScript)],
        Env: inputEnv,
        WorkingDir: "/workspace",
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({});
      return this.collectOutput(stream, logContext);
    } else if (actionConfig.runs?.using === "composite") {
      // Run composite action steps
      let output = "";
      for (const subStep of actionConfig.runs.steps) {
        if (subStep.run) {
          output += await this.runShellCommand(
            container,
            subStep,
            context,
            logContext
          );
        }
      }
      return output;
    } else if (actionConfig.runs?.using === "docker") {
      // Run Docker action
      const image = actionConfig.runs.image;
      const args = actionConfig.runs.args || [];
      // Would create and run a separate container here
      return `Docker action: ${image} ${args.join(" ")}`;
    }

    return "";
  }

  /**
   * Run a shell command in container
   */
  private async runShellCommand(
    container: Dockerode.Container,
    step: StepConfig,
    context: WorkflowContext,
    logContext?: { runId: string; jobId: string; stepId: string }
  ): Promise<string> {
    if (!step.run) throw new Error("No command specified");

    // Substitute expressions in command
    let command = this.substituteExpressions(step.run, context);

    const shell = step.shell || "bash";
    const workDir = step["working-directory"] || "/workspace";

    const exec = await container.exec({
      Cmd: [shell, "-c", command],
      WorkingDir: workDir,
      Env: Object.entries(step.env || {}).map(([k, v]) => {
        return `${k}=${this.substituteExpressions(v, context)}`;
      }),
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});
    const output = await this.collectOutput(stream, logContext);

    // Check exit code
    const inspectData = await exec.inspect();
    if (inspectData.ExitCode !== 0) {
      throw new Error(
        `Command failed with exit code ${inspectData.ExitCode}\n${output}`
      );
    }

    return output;
  }

  /**
   * Collect output from Docker stream
   */
  private async collectOutput(
    stream: NodeJS.ReadableStream,
    logContext?: { runId: string; jobId: string; stepId: string }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = "";
      stream.on("data", (chunk) => {
        // Docker multiplexes stdout/stderr in stream
        // Skip first 8 bytes (header) for each chunk
        const data = chunk.slice(8).toString();
        output += data;
        this.emit("output", data);
        if (logContext) {
          this.emit("log", { ...logContext, data, timestamp: new Date() });
        }
      });
      stream.on("end", () => resolve(output));
      stream.on("error", reject);
    });
  }

  /**
   * Evaluate GitHub Actions expression
   */
  private evaluateExpression(expr: string, context: WorkflowContext): boolean {
    // Simple expression evaluation
    // Full implementation would support complete expression syntax

    // Handle always(), failure(), success(), cancelled()
    if (expr.includes("always()")) return true;
    if (expr.includes("success()")) return context.job.status === "in_progress";
    if (expr.includes("failure()")) {
      return Object.values(context.steps).some(
        (s) => s.conclusion === "failure"
      );
    }
    if (expr.includes("cancelled()")) return false;

    // Handle contains(), startsWith(), endsWith()
    const containsMatch = expr.match(/contains\(([^,]+),\s*'([^']+)'\)/);
    if (containsMatch) {
      const value = this.resolveContextValue(containsMatch[1].trim(), context);
      return String(value).includes(containsMatch[2]);
    }

    // Handle equality checks
    const eqMatch = expr.match(/([^=!<>]+)\s*==\s*'([^']+)'/);
    if (eqMatch) {
      const value = this.resolveContextValue(eqMatch[1].trim(), context);
      return String(value) === eqMatch[2];
    }

    const neqMatch = expr.match(/([^=!<>]+)\s*!=\s*'([^']+)'/);
    if (neqMatch) {
      const value = this.resolveContextValue(neqMatch[1].trim(), context);
      return String(value) !== neqMatch[2];
    }

    return true;
  }

  /**
   * Resolve context value from path
   */
  private resolveContextValue(path: string, context: WorkflowContext): any {
    const parts = path.split(".");
    let value: any = context;

    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Substitute ${{ }} expressions in string
   */
  private substituteExpressions(str: string, context: WorkflowContext): string {
    return str.replace(/\$\{\{\s*([^}]+)\s*\}\}/g, (_, expr) => {
      const value = this.resolveContextValue(expr.trim(), context);
      return value !== undefined ? String(value) : "";
    });
  }

  /**
   * Parse Docker port bindings
   */
  private parsePortBindings(ports: string[]): Dockerode.PortMap {
    const bindings: Dockerode.PortMap = {};
    for (const port of ports) {
      const [host, container] = port.split(":");
      bindings[`${container}/tcp`] = [{ HostPort: host }];
    }
    return bindings;
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(runId: string): Promise<void> {
    for (const [jobId, container] of this.runningJobs) {
      if (jobId.startsWith(runId)) {
        try {
          await container.stop();
          await container.remove();
        } catch { }
        this.runningJobs.delete(jobId);
      }
    }
    this.emit("workflow:cancelled", runId);
  }
}

export const pipelineRunner = new PipelineRunner({
  workDir: process.env.RUNNER_WORK_DIR || "./data/actions/work",
  artifactsDir: process.env.RUNNER_ARTIFACTS_DIR || "./data/actions/artifacts",
  cacheDir: process.env.RUNNER_CACHE_DIR || "./data/actions/cache",
});

export default PipelineRunner;
