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

  async loadPlugin(pluginPath: string): Promise<void> {
    const module = await import(pluginPath);
    const config: PluginConfig = module.default;

    if (!config.name || !config.version) {
      throw new Error(`Invalid plugin: ${pluginPath}`);
    }

    this.plugins.set(config.name, config);

    // Register hooks
    if (config.hooks) {
      for (const [event, handler] of Object.entries(config.hooks)) {
        if (!this.hooks.has(event)) {
          this.hooks.set(event, []);
        }
        this.hooks.get(event)!.push({ plugin: config.name, handler });
      }
    }

    logger.info({ name: config.name, version: config.version }, "Plugin loaded");
  }

  async unloadPlugin(name: string): Promise<void> {
    const config = this.plugins.get(name);
    if (!config) return;

    // Remove hooks
    for (const [event, handlers] of this.hooks) {
      this.hooks.set(
        event,
        handlers.filter((h) => h.plugin !== name)
      );
    }

    this.plugins.delete(name);
    logger.info({ name }, "Plugin unloaded");
  }

  async emit<T extends keyof PluginHooks>(
    event: T,
    data: Parameters<NonNullable<PluginHooks[T]>>[0]
  ): Promise<void> {
    const handlers = this.hooks.get(event) || [];

    for (const { plugin, handler } of handlers) {
      try {
        await handler(data);
      } catch (error) {
        logger.error({ err: error, plugin, event }, "Plugin error");
      }
    }
  }

  getPlugin(name: string): PluginConfig | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): PluginConfig[] {
    return Array.from(this.plugins.values());
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

      for (const entry of entries) {
        if (entry.isDirectory() || (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")))) {
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

export default {
  definePlugin,
  PluginManager,
  pluginManager,
};
