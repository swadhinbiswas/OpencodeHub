/**
 * OpenCodeHub Plugin API
 *
 * Defines the interface for creating plugins
 */

import type { APIContext } from "astro";
import { logger } from "@/lib/logger";

// Plugin configuration
export interface PluginConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;

  // Plugin capabilities
  hooks?: PluginHooks;
  routes?: PluginRoute[];
  components?: PluginComponent[];
  settings?: PluginSetting[];
  commands?: PluginCommand[];
  dependencies?: string[];
  minCoreVersion?: string;
  enabledByDefault?: boolean;
}

// Event hooks
export interface PluginHooks {
  // Repository events
  "repo:create"?: (event: RepoCreateEvent) => Promise<void>;
  "repo:delete"?: (event: RepoDeleteEvent) => Promise<void>;
  "repo:push"?: (event: RepoPushEvent) => Promise<void>;
  "repo:fork"?: (event: RepoForkEvent) => Promise<void>;

  // Issue events
  "issue:create"?: (event: IssueCreateEvent) => Promise<void>;
  "issue:update"?: (event: IssueUpdateEvent) => Promise<void>;
  "issue:close"?: (event: IssueCloseEvent) => Promise<void>;
  "issue:comment"?: (event: IssueCommentEvent) => Promise<void>;

  // Pull request events
  "pr:create"?: (event: PRCreateEvent) => Promise<void>;
  "pr:update"?: (event: PRUpdateEvent) => Promise<void>;
  "pr:merge"?: (event: PRMergeEvent) => Promise<void>;
  "pr:close"?: (event: PRCloseEvent) => Promise<void>;
  "pr:review"?: (event: PRReviewEvent) => Promise<void>;

  // User events
  "user:register"?: (event: UserRegisterEvent) => Promise<void>;
  "user:login"?: (event: UserLoginEvent) => Promise<void>;

  // Pipeline events
  "pipeline:start"?: (event: PipelineStartEvent) => Promise<void>;
  "pipeline:complete"?: (event: PipelineCompleteEvent) => Promise<void>;
  "pipeline:fail"?: (event: PipelineFailEvent) => Promise<void>;

  // Webhook events
  "webhook:receive"?: (event: WebhookReceiveEvent) => Promise<void>;
}

// Event types
export interface BaseEvent {
  timestamp: Date;
  actor: { id: string; username: string };
}

export interface RepoCreateEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
}

export interface RepoDeleteEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
}

export interface RepoPushEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  ref: string;
  before: string;
  after: string;
  commits: Array<{
    id: string;
    message: string;
    author: { name: string; email: string };
    timestamp: Date;
  }>;
}

export interface RepoForkEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  forkRepository: { id: string; owner: string; name: string };
}

export interface IssueCreateEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  issue: { id: string; number: number; title: string };
}

export interface IssueUpdateEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  issue: { id: string; number: number; title: string };
  changes: Record<string, { from: any; to: any }>;
}

export interface IssueCloseEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  issue: { id: string; number: number; title: string };
}

export interface IssueCommentEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  issue: { id: string; number: number; title: string };
  comment: { id: string; body: string };
}

export interface PRCreateEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pullRequest: { id: string; number: number; title: string };
}

export interface PRUpdateEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pullRequest: { id: string; number: number; title: string };
  changes: Record<string, { from: any; to: any }>;
}

export interface PRMergeEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pullRequest: { id: string; number: number; title: string };
  mergeCommit: string;
}

export interface PRCloseEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pullRequest: { id: string; number: number; title: string };
}

export interface PRReviewEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pullRequest: { id: string; number: number; title: string };
  review: { id: string; state: "approved" | "changes_requested" | "commented" };
}

export interface UserRegisterEvent extends BaseEvent {
  user: { id: string; username: string; email: string };
}

export interface UserLoginEvent extends BaseEvent {
  user: { id: string; username: string };
}

export interface PipelineStartEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pipeline: { id: string; workflow: string };
}

export interface PipelineCompleteEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pipeline: { id: string; workflow: string; conclusion: "success" | "failure" };
}

export interface PipelineFailEvent extends BaseEvent {
  repository: { id: string; owner: string; name: string };
  pipeline: { id: string; workflow: string; error: string };
}

export interface WebhookReceiveEvent extends BaseEvent {
  webhook: { id: string; url: string };
  payload: any;
}

// Plugin routes
export interface PluginRoute {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  handler: (context: APIContext) => Promise<Response>;
  middleware?: Array<
    (context: APIContext, next: () => Promise<Response>) => Promise<Response>
  >;
}

// Plugin components
export interface PluginComponent {
  name: string;
  slot:
  | "repo-header"
  | "repo-sidebar"
  | "issue-sidebar"
  | "pr-sidebar"
  | "settings-tab"
  | "user-profile";
  component: React.ComponentType<any>;
}

// Plugin settings
export interface PluginSetting {
  key: string;
  type: "string" | "number" | "boolean" | "select" | "multiselect";
  label: string;
  description?: string;
  default?: any;
  options?: Array<{ label: string; value: any }>;
  required?: boolean;
  secret?: boolean;
}

// Plugin commands
export interface PluginCommand {
  name: string;
  description: string;
  handler: (args: string[], context: CommandContext) => Promise<void>;
}

export interface CommandContext {
  user: { id: string; username: string };
  repository?: { id: string; owner: string; name: string };
  output: (message: string) => void;
}

export interface PluginRuntimeState {
  name: string;
  version: string;
  path?: string;
  enabled: boolean;
  loadedAt: Date;
  lastError?: string;
  hookTimeoutMs: number;
  hookStats: Record<string, { calls: number; failures: number; lastDurationMs: number }>;
}

// Plugin context provided to all plugin handlers
export interface PluginContext {
  db: any; // Database connection
  storage: any; // Storage adapter
  config: Record<string, any>; // Plugin settings
  logger: {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };
  api: {
    repos: any;
    issues: any;
    users: any;
    // ... other API modules
  };
}

// Helper function to define a plugin
export function definePlugin(config: PluginConfig): PluginConfig {
  return config;
}

// Plugin manager
export class PluginManager {
  private plugins: Map<string, PluginConfig> = new Map();
  private hooks: Map<string, Array<{ plugin: string; handler: Function }>> =
    new Map();
  private states: Map<string, PluginRuntimeState> = new Map();
  private configs: Map<string, Record<string, unknown>> = new Map();
  private readonly defaultHookTimeoutMs: number;

  constructor(options?: { hookTimeoutMs?: number }) {
    const configured = options?.hookTimeoutMs ?? Number.parseInt(process.env.PLUGIN_HOOK_TIMEOUT_MS || "5000", 10);
    this.defaultHookTimeoutMs = Number.isFinite(configured) ? Math.max(200, configured) : 5000;
  }

  private registerHooks(config: PluginConfig): void {
    if (!config.hooks) return;
    for (const [event, handler] of Object.entries(config.hooks)) {
      if (!this.hooks.has(event)) {
        this.hooks.set(event, []);
      }
      this.hooks.get(event)!.push({ plugin: config.name, handler });
    }
  }

  private unregisterHooks(name: string): void {
    for (const [event, handlers] of this.hooks) {
      this.hooks.set(
        event,
        handlers.filter((h) => h.plugin !== name)
      );
    }
  }

  private validatePluginConfig(config: PluginConfig, pluginPath?: string): void {
    if (!config?.name || !config?.version) {
      throw new Error(`Invalid plugin${pluginPath ? `: ${pluginPath}` : ""}. Missing name/version`);
    }
    if (this.plugins.has(config.name)) {
      throw new Error(`Plugin "${config.name}" already loaded`);
    }
    if (config.dependencies?.length) {
      for (const dependency of config.dependencies) {
        if (!this.plugins.has(dependency)) {
          throw new Error(`Plugin "${config.name}" missing dependency "${dependency}"`);
        }
      }
    }
  }

  async loadPlugin(pluginPath: string): Promise<void> {
    const module = await import(pluginPath);
    const config: PluginConfig = module.default;
    this.validatePluginConfig(config, pluginPath);

    this.plugins.set(config.name, config);
    this.registerHooks(config);
    this.states.set(config.name, {
      name: config.name,
      version: config.version,
      path: pluginPath,
      enabled: config.enabledByDefault ?? true,
      loadedAt: new Date(),
      hookTimeoutMs: this.defaultHookTimeoutMs,
      hookStats: {},
    });

    logger.info({ name: config.name, version: config.version }, "Plugin loaded");
  }

  async unloadPlugin(name: string): Promise<void> {
    const config = this.plugins.get(name);
    if (!config) return;

    this.unregisterHooks(name);

    this.plugins.delete(name);
    this.states.delete(name);
    this.configs.delete(name);
    logger.info({ name }, "Plugin unloaded");
  }

  async reloadPlugin(name: string): Promise<void> {
    const state = this.states.get(name);
    if (!state?.path) {
      throw new Error(`Plugin "${name}" is not reloadable (missing path)`);
    }
    await this.unloadPlugin(name);
    await this.loadPlugin(state.path);
  }

  enablePlugin(name: string): void {
    const state = this.states.get(name);
    if (!state) throw new Error(`Plugin "${name}" not found`);
    state.enabled = true;
  }

  disablePlugin(name: string): void {
    const state = this.states.get(name);
    if (!state) throw new Error(`Plugin "${name}" not found`);
    state.enabled = false;
  }

  setPluginConfig(name: string, config: Record<string, unknown>): void {
    if (!this.plugins.has(name)) throw new Error(`Plugin "${name}" not found`);
    this.configs.set(name, { ...(this.configs.get(name) || {}), ...config });
  }

  getPluginConfig(name: string): Record<string, unknown> {
    return this.configs.get(name) || {};
  }

  async emit<T extends keyof PluginHooks>(
    event: T,
    data: Parameters<NonNullable<PluginHooks[T]>>[0]
  ): Promise<void> {
    const handlers = this.hooks.get(event) || [];

    for (const { plugin, handler } of handlers) {
      const state = this.states.get(plugin);
      if (!state?.enabled) continue;
      const started = Date.now();
      try {
        await Promise.race([
          handler(data),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("plugin_hook_timeout")), state.hookTimeoutMs)
          ),
        ]);
        const elapsed = Date.now() - started;
        const current = state.hookStats[String(event)] || { calls: 0, failures: 0, lastDurationMs: 0 };
        state.hookStats[String(event)] = {
          calls: current.calls + 1,
          failures: current.failures,
          lastDurationMs: elapsed,
        };
      } catch (error) {
        const elapsed = Date.now() - started;
        const current = state.hookStats[String(event)] || { calls: 0, failures: 0, lastDurationMs: 0 };
        state.hookStats[String(event)] = {
          calls: current.calls + 1,
          failures: current.failures + 1,
          lastDurationMs: elapsed,
        };
        state.lastError = error instanceof Error ? error.message : "Plugin error";
        logger.error({ err: error, plugin, event }, "Plugin error");
      }
    }
  }

  async runCommand(
    pluginName: string,
    commandName: string,
    args: string[],
    context: CommandContext
  ): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    const state = this.states.get(pluginName);
    if (!plugin || !state) {
      throw new Error(`Plugin "${pluginName}" not found`);
    }
    if (!state.enabled) {
      throw new Error(`Plugin "${pluginName}" is disabled`);
    }
    const command = (plugin.commands || []).find((item) => item.name === commandName);
    if (!command) {
      throw new Error(`Command "${commandName}" not found in plugin "${pluginName}"`);
    }
    await command.handler(args, context);
  }

  getPlugin(name: string): PluginConfig | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): PluginConfig[] {
    return Array.from(this.plugins.values());
  }

  getPluginStates(): PluginRuntimeState[] {
    return Array.from(this.states.values()).map((state) => ({ ...state }));
  }

  getPluginState(name: string): PluginRuntimeState | undefined {
    const state = this.states.get(name);
    return state ? { ...state } : undefined;
  }

  getPluginHealth(): {
    total: number;
    enabled: number;
    disabled: number;
    withErrors: number;
  } {
    const states = Array.from(this.states.values());
    return {
      total: states.length,
      enabled: states.filter((state) => state.enabled).length,
      disabled: states.filter((state) => !state.enabled).length,
      withErrors: states.filter((state) => !!state.lastError).length,
    };
  }

  getPluginRoutes(): PluginRoute[] {
    const routes: PluginRoute[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.routes) {
        routes.push(...plugin.routes);
      }
    }
    return routes;
  }

  getPluginComponents(slot: PluginComponent["slot"]): PluginComponent[] {
    const components: PluginComponent[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.components) {
        components.push(...plugin.components.filter((c) => c.slot === slot));
      }
    }
    return components;
  }

  /**
   * Load all plugins from a directory
   */
  async loadPluginsFromDirectory(directory: string): Promise<void> {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");

      // Check if directory exists
      try {
        await fs.access(directory);
      } catch {
        logger.warn({ directory }, "Plugin directory does not exist, skipping");
        return;
      }

      const entries = await fs.readdir(directory, { withFileTypes: true });

      const allowListRaw = process.env.PLUGIN_ALLOWLIST || "";
      const allowList = new Set(
        allowListRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      );

      for (const entry of entries) {
        if (entry.isDirectory() || (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")))) {
          if (allowList.size > 0 && !allowList.has(entry.name)) {
            logger.debug({ plugin: entry.name }, "Plugin skipped by allowlist");
            continue;
          }
          const pluginPath = path.join(directory, entry.name);
          try {
            await this.loadPlugin(pluginPath);
          } catch (error) {
            logger.error({ error, pluginPath }, "Failed to load plugin");
          }
        }
      }
    } catch (error) {
      logger.error({ error, directory }, "Failed to scan plugin directory");
    }
  }
}

// Global plugin manager instance
export const pluginManager = new PluginManager();

// ============================================================================
// PLUGIN SANDBOXING
// ============================================================================

/**
 * Capability manifest — declares what a plugin is allowed to access.
 * Admin approves these before the plugin can run.
 */
export interface PluginCapabilityManifest {
    /** Network access: list of allowed hostnames or false */
    network: string[] | false;
    /** Filesystem paths the plugin can read/write */
    filesystem: { read: string[]; write: string[] } | false;
    /** Database tables/collections accessible */
    database: string[] | false;
    /** Which hook events can be subscribed */
    hooks: string[];
    /** Max memory in MB (default 128) */
    maxMemoryMB: number;
    /** Max CPU time per hook invocation in ms (default 5000) */
    maxCpuTimeMs: number;
    /** Whether the plugin can make HTTP requests outside the allowed hosts */
    allowExternalHttp: boolean;
}

export interface PluginApproval {
    pluginName: string;
    approvedBy: string;
    approvedAt: Date;
    capabilities: PluginCapabilityManifest;
    status: "pending" | "approved" | "rejected";
    rejectionReason?: string;
}

/** In-memory approval store — replace with DB in production */
const pluginApprovals = new Map<string, PluginApproval>();

export function getDefaultCapabilities(): PluginCapabilityManifest {
    return {
        network: false,
        filesystem: false,
        database: false,
        hooks: [],
        maxMemoryMB: 128,
        maxCpuTimeMs: 5000,
        allowExternalHttp: false,
    };
}

export function submitPluginForApproval(
    pluginName: string,
    requestedCapabilities: Partial<PluginCapabilityManifest>
): PluginApproval {
    const approval: PluginApproval = {
        pluginName,
        approvedBy: "",
        approvedAt: new Date(),
        capabilities: { ...getDefaultCapabilities(), ...requestedCapabilities },
        status: "pending",
    };
    pluginApprovals.set(pluginName, approval);
    logger.info({ pluginName }, "Plugin submitted for approval");
    return approval;
}

export function approvePlugin(
    pluginName: string,
    adminUserId: string,
    capabilities?: Partial<PluginCapabilityManifest>
): PluginApproval {
    const existing = pluginApprovals.get(pluginName);
    if (!existing) {
        throw new Error(`No approval request found for plugin "${pluginName}"`);
    }

    existing.status = "approved";
    existing.approvedBy = adminUserId;
    existing.approvedAt = new Date();
    if (capabilities) {
        existing.capabilities = { ...existing.capabilities, ...capabilities };
    }

    logger.info({ pluginName, adminUserId }, "Plugin approved");
    return existing;
}

export function rejectPlugin(pluginName: string, adminUserId: string, reason: string): PluginApproval {
    const existing = pluginApprovals.get(pluginName);
    if (!existing) {
        throw new Error(`No approval request found for plugin "${pluginName}"`);
    }

    existing.status = "rejected";
    existing.approvedBy = adminUserId;
    existing.rejectionReason = reason;

    logger.info({ pluginName, adminUserId, reason }, "Plugin rejected");
    return existing;
}

export function getPluginApproval(pluginName: string): PluginApproval | undefined {
    return pluginApprovals.get(pluginName);
}

export function listPendingApprovals(): PluginApproval[] {
    return Array.from(pluginApprovals.values()).filter((a) => a.status === "pending");
}

/**
 * Sandboxed plugin executor using Worker Threads
 * Runs plugin hook handlers in isolated worker threads with resource limits
 */
export class PluginSandbox {
    private workers = new Map<string, import("worker_threads").Worker>();

    /**
     * Execute a plugin hook handler in a sandboxed worker thread
     */
    async executeInSandbox(
        pluginName: string,
        hookCode: string,
        eventData: unknown,
        capabilities: PluginCapabilityManifest
    ): Promise<{ success: boolean; result?: unknown; error?: string; durationMs: number }> {
        const started = Date.now();

        try {
            const { Worker } = await import("worker_threads");

            // Build the sandboxed worker script
            const workerScript = buildSandboxedWorkerScript(
                hookCode,
                eventData,
                capabilities
            );

            return await new Promise((resolve) => {
                const worker = new Worker(workerScript, {
                    eval: true,
                    resourceLimits: {
                        maxOldGenerationSizeMb: capabilities.maxMemoryMB,
                        maxYoungGenerationSizeMb: Math.ceil(capabilities.maxMemoryMB / 4),
                        codeRangeSizeMb: 32,
                        stackSizeMb: 4,
                    },
                    // Prevent access to the parent's env
                    env: {
                        NODE_ENV: process.env.NODE_ENV || "production",
                        PLUGIN_NAME: pluginName,
                    },
                });

                this.workers.set(pluginName, worker);

                const timeout = setTimeout(() => {
                    worker.terminate();
                    resolve({
                        success: false,
                        error: `Plugin "${pluginName}" exceeded CPU time limit (${capabilities.maxCpuTimeMs}ms)`,
                        durationMs: Date.now() - started,
                    });
                }, capabilities.maxCpuTimeMs);

                worker.on("message", (msg: { success: boolean; result?: unknown; error?: string }) => {
                    clearTimeout(timeout);
                    worker.terminate();
                    this.workers.delete(pluginName);
                    resolve({
                        ...msg,
                        durationMs: Date.now() - started,
                    });
                });

                worker.on("error", (err) => {
                    clearTimeout(timeout);
                    this.workers.delete(pluginName);
                    resolve({
                        success: false,
                        error: err.message,
                        durationMs: Date.now() - started,
                    });
                });

                worker.on("exit", (code) => {
                    clearTimeout(timeout);
                    this.workers.delete(pluginName);
                    if (code !== 0) {
                        resolve({
                            success: false,
                            error: `Worker exited with code ${code}`,
                            durationMs: Date.now() - started,
                        });
                    }
                });
            });
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : "Sandbox creation failed",
                durationMs: Date.now() - started,
            };
        }
    }

    /**
     * Terminate all running sandboxed workers
     */
    async terminateAll(): Promise<void> {
        for (const [name, worker] of this.workers) {
            worker.terminate();
            logger.info({ pluginName: name }, "Sandboxed worker terminated");
        }
        this.workers.clear();
    }

    getRunningPlugins(): string[] {
        return Array.from(this.workers.keys());
    }
}

/**
 * Build the sandboxed worker script with restricted globals
 */
function buildSandboxedWorkerScript(
    hookCode: string,
    eventData: unknown,
    capabilities: PluginCapabilityManifest
): string {
    const serializedEvent = JSON.stringify(eventData);
    const allowedHosts = JSON.stringify(capabilities.network || []);

    return `
const { parentPort } = require('worker_threads');

// Restrict dangerous globals
delete globalThis.process.exit;
delete globalThis.process.kill;
delete globalThis.process.abort;
Object.defineProperty(globalThis.process, 'env', {
    value: Object.freeze({
        NODE_ENV: process.env.NODE_ENV,
        PLUGIN_NAME: process.env.PLUGIN_NAME,
    }),
    writable: false,
    configurable: false,
});

// Restricted require — block fs, child_process, cluster, etc.
const BLOCKED_MODULES = new Set([
    'fs', 'fs/promises', 'child_process', 'cluster',
    'dgram', 'dns', 'net', 'tls', 'vm', 'v8',
    'worker_threads', 'perf_hooks', 'trace_events',
    'inspector', 'async_hooks',
]);

const ALLOWED_HOSTS = ${allowedHosts};

const originalRequire = require;
globalThis.require = function restrictedRequire(id) {
    if (BLOCKED_MODULES.has(id)) {
        throw new Error('Module "' + id + '" is not allowed in sandboxed plugins');
    }
    return originalRequire(id);
};

// Restricted fetch — only allowed hosts
const originalFetch = globalThis.fetch;
if (originalFetch && ALLOWED_HOSTS.length > 0) {
    globalThis.fetch = function restrictedFetch(url, options) {
        const parsedUrl = new URL(url);
        if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
            throw new Error('Network access to "' + parsedUrl.hostname + '" is not allowed');
        }
        return originalFetch(url, options);
    };
} else if (!${capabilities.allowExternalHttp}) {
    globalThis.fetch = function() {
        throw new Error('Network access is not allowed for this plugin');
    };
}

// Run the hook
(async () => {
    try {
        const eventData = ${serializedEvent};
        const handler = new Function('event', 'return (async function() {' + ${JSON.stringify(hookCode)} + '}).call(null)');
        const result = await handler(eventData);
        parentPort.postMessage({ success: true, result });
    } catch (err) {
        parentPort.postMessage({ success: false, error: err.message || 'Unknown error' });
    }
})();
`;
}

export const pluginSandbox = new PluginSandbox();

export default {
  definePlugin,
  PluginManager,
  pluginManager,
  PluginSandbox,
  pluginSandbox,
};
