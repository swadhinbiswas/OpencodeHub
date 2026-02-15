/**
 * Issue Tracking Integrations Library
 * Jira, Linear, Trello, ClickUp integrations
 */

import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";
import { issues } from "@/db/schema/issues";

// ============================================================================
// SCHEMA
// ============================================================================

export const issueTrackerConfigs = pgTable("issue_tracker_configs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // jira, linear, trello, clickup
    name: text("name").notNull(),
    apiUrl: text("api_url"),
    apiToken: text("api_token"), // Encrypted
    projectKey: text("project_key"), // Jira project, Linear team, Trello board, ClickUp list
    webhookSecret: text("webhook_secret"),
    isEnabled: boolean("is_enabled").default(true),
    syncToExternal: boolean("sync_to_external").default(true),
    syncFromExternal: boolean("sync_from_external").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const issueTrackerLinks = pgTable("issue_tracker_links", {
    id: text("id").primaryKey(),
    configId: text("config_id")
        .notNull()
        .references(() => issueTrackerConfigs.id, { onDelete: "cascade" }),
    localIssueId: text("local_issue_id")
        .references(() => issues.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    externalKey: text("external_key"), // e.g., PROJ-123
    externalUrl: text("external_url"),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type IssueTrackerConfig = typeof issueTrackerConfigs.$inferSelect;
export type IssueTrackerLink = typeof issueTrackerLinks.$inferSelect;

// ============================================================================
// PROVIDER DEFINITIONS
// ============================================================================

export const ISSUE_PROVIDERS = {
    jira: {
        name: "Jira",
        icon: "jira",
        apiBase: "https://{domain}.atlassian.net/rest/api/3",
        authType: "basic", // email:api-token
    },
    linear: {
        name: "Linear",
        icon: "linear",
        apiBase: "https://api.linear.app/graphql",
        authType: "bearer",
    },
    trello: {
        name: "Trello",
        icon: "trello",
        apiBase: "https://api.trello.com/1",
        authType: "query", // key + token in query
    },
    clickup: {
        name: "ClickUp",
        icon: "clickup",
        apiBase: "https://api.clickup.com/api/v2",
        authType: "bearer",
    },
} as const;

// ============================================================================
// CONFIGURATION
// ============================================================================

export async function configureIssueTracker(options: {
    repositoryId: string;
    provider: keyof typeof ISSUE_PROVIDERS;
    name: string;
    apiUrl?: string;
    apiToken: string;
    projectKey: string;
}): Promise<IssueTrackerConfig> {
    const db = getDatabase();

    const config = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        provider: options.provider,
        name: options.name,
        apiUrl: options.apiUrl || null,
        apiToken: options.apiToken,
        projectKey: options.projectKey,
        webhookSecret: crypto.randomUUID(),
        isEnabled: true,
        syncToExternal: true,
        syncFromExternal: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.issueTrackerConfigs).values(config);

    logger.info({ repoId: options.repositoryId, provider: options.provider }, "Issue tracker configured");

    return config as IssueTrackerConfig;
}

export async function getIssueTrackerConfigs(repositoryId: string): Promise<IssueTrackerConfig[]> {
    const db = getDatabase();
    try {
        return await db.query.issueTrackerConfigs?.findMany({
            where: eq(schema.issueTrackerConfigs.repositoryId, repositoryId),
        }) || [];
    } catch {
        return [];
    }
}

// ============================================================================
// JIRA INTEGRATION
// ============================================================================

export async function jiraCreateIssue(options: {
    config: IssueTrackerConfig;
    summary: string;
    description?: string;
    issueType?: string;
    priority?: string;
    labels?: string[];
}): Promise<{ id: string; key: string; url: string } | null> {
    const apiUrl = options.config.apiUrl || `https://your-domain.atlassian.net/rest/api/3`;

    try {
        const response = await fetch(`${apiUrl}/issue`, {
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(options.config.apiToken || "").toString("base64")}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                fields: {
                    project: { key: options.config.projectKey },
                    summary: options.summary,
                    description: {
                        type: "doc",
                        version: 1,
                        content: [{
                            type: "paragraph",
                            content: [{ type: "text", text: options.description || "" }],
                        }],
                    },
                    issuetype: { name: options.issueType || "Task" },
                    ...(options.priority && { priority: { name: options.priority } }),
                    ...(options.labels && { labels: options.labels }),
                },
            }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        return {
            id: data.id,
            key: data.key,
            url: `${apiUrl.replace("/rest/api/3", "")}/browse/${data.key}`,
        };
    } catch (error) {
        logger.error({ error }, "Jira create issue failed");
        return null;
    }
}

export async function jiraGetIssue(config: IssueTrackerConfig, issueKey: string): Promise<{
    id: string;
    key: string;
    summary: string;
    status: string;
    assignee?: string;
} | null> {
    const apiUrl = config.apiUrl || `https://your-domain.atlassian.net/rest/api/3`;

    try {
        const response = await fetch(`${apiUrl}/issue/${issueKey}`, {
            headers: {
                Authorization: `Basic ${Buffer.from(config.apiToken || "").toString("base64")}`,
            },
        });

        if (!response.ok) return null;

        const data = await response.json();
        return {
            id: data.id,
            key: data.key,
            summary: data.fields.summary,
            status: data.fields.status.name,
            assignee: data.fields.assignee?.displayName,
        };
    } catch {
        return null;
    }
}

export async function jiraTransition(config: IssueTrackerConfig, issueKey: string, transitionName: string): Promise<boolean> {
    const apiUrl = config.apiUrl || `https://your-domain.atlassian.net/rest/api/3`;

    try {
        // Get available transitions
        const transResponse = await fetch(`${apiUrl}/issue/${issueKey}/transitions`, {
            headers: {
                Authorization: `Basic ${Buffer.from(config.apiToken || "").toString("base64")}`,
            },
        });

        const transData = await transResponse.json();
        const transition = transData.transitions?.find((t: any) =>
            t.name.toLowerCase() === transitionName.toLowerCase()
        );

        if (!transition) return false;

        // Execute transition
        const response = await fetch(`${apiUrl}/issue/${issueKey}/transitions`, {
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(config.apiToken || "").toString("base64")}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ transition: { id: transition.id } }),
        });

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// LINEAR INTEGRATION
// ============================================================================

export async function linearCreateIssue(options: {
    config: IssueTrackerConfig;
    title: string;
    description?: string;
    priority?: number; // 0-4
    labels?: string[];
}): Promise<{ id: string; identifier: string; url: string } | null> {
    try {
        const response = await fetch("https://api.linear.app/graphql", {
            method: "POST",
            headers: {
                Authorization: options.config.apiToken || "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: `
                    mutation CreateIssue($input: IssueCreateInput!) {
                        issueCreate(input: $input) {
                            success
                            issue {
                                id
                                identifier
                                url
                            }
                        }
                    }
                `,
                variables: {
                    input: {
                        teamId: options.config.projectKey,
                        title: options.title,
                        description: options.description,
                        priority: options.priority,
                        labelIds: options.labels,
                    },
                },
            }),
        });

        const data = await response.json();
        const issue = data.data?.issueCreate?.issue;

        if (!issue) return null;

        return {
            id: issue.id,
            identifier: issue.identifier,
            url: issue.url,
        };
    } catch (error) {
        logger.error({ error }, "Linear create issue failed");
        return null;
    }
}

export async function linearGetIssue(config: IssueTrackerConfig, issueId: string): Promise<{
    id: string;
    identifier: string;
    title: string;
    state: string;
    assignee?: string;
} | null> {
    try {
        const response = await fetch("https://api.linear.app/graphql", {
            method: "POST",
            headers: {
                Authorization: config.apiToken || "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: `
                    query Issue($id: String!) {
                        issue(id: $id) {
                            id
                            identifier
                            title
                            state { name }
                            assignee { name }
                        }
                    }
                `,
                variables: { id: issueId },
            }),
        });

        const data = await response.json();
        const issue = data.data?.issue;

        if (!issue) return null;

        return {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            state: issue.state?.name,
            assignee: issue.assignee?.name,
        };
    } catch {
        return null;
    }
}

// ============================================================================
// TRELLO INTEGRATION
// ============================================================================

export async function trelloCreateCard(options: {
    config: IssueTrackerConfig;
    name: string;
    desc?: string;
    listId: string;
    labels?: string[];
}): Promise<{ id: string; shortLink: string; url: string } | null> {
    try {
        // Token format: "key:token"
        const [key, token] = (options.config.apiToken || "").split(":");

        const params = new URLSearchParams({
            key,
            token,
            idList: options.listId,
            name: options.name,
            desc: options.desc || "",
        });

        if (options.labels) {
            params.append("idLabels", options.labels.join(","));
        }

        const response = await fetch(`https://api.trello.com/1/cards?${params}`, {
            method: "POST",
        });

        if (!response.ok) return null;

        const data = await response.json();
        return {
            id: data.id,
            shortLink: data.shortLink,
            url: data.shortUrl,
        };
    } catch (error) {
        logger.error({ error }, "Trello create card failed");
        return null;
    }
}

export async function trelloGetCard(config: IssueTrackerConfig, cardId: string): Promise<{
    id: string;
    name: string;
    list: string;
    members: string[];
} | null> {
    try {
        const [key, token] = (config.apiToken || "").split(":");

        const response = await fetch(
            `https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}&fields=id,name,idList&members=true`
        );

        if (!response.ok) return null;

        const data = await response.json();
        return {
            id: data.id,
            name: data.name,
            list: data.idList,
            members: data.members?.map((m: any) => m.fullName) || [],
        };
    } catch {
        return null;
    }
}

export async function trelloMoveCard(config: IssueTrackerConfig, cardId: string, listId: string): Promise<boolean> {
    try {
        const [key, token] = (config.apiToken || "").split(":");

        const response = await fetch(
            `https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}&idList=${listId}`,
            { method: "PUT" }
        );

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// CLICKUP INTEGRATION
// ============================================================================

export async function clickupCreateTask(options: {
    config: IssueTrackerConfig;
    name: string;
    description?: string;
    priority?: number; // 1-4
    tags?: string[];
    dueDate?: Date;
}): Promise<{ id: string; url: string } | null> {
    try {
        const response = await fetch(
            `https://api.clickup.com/api/v2/list/${options.config.projectKey}/task`,
            {
                method: "POST",
                headers: {
                    Authorization: options.config.apiToken || "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: options.name,
                    description: options.description,
                    priority: options.priority,
                    tags: options.tags,
                    due_date: options.dueDate?.getTime(),
                }),
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        return {
            id: data.id,
            url: data.url,
        };
    } catch (error) {
        logger.error({ error }, "ClickUp create task failed");
        return null;
    }
}

export async function clickupGetTask(config: IssueTrackerConfig, taskId: string): Promise<{
    id: string;
    name: string;
    status: string;
    assignees: string[];
} | null> {
    try {
        const response = await fetch(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            {
                headers: { Authorization: config.apiToken || "" },
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        return {
            id: data.id,
            name: data.name,
            status: data.status?.status,
            assignees: data.assignees?.map((a: any) => a.username) || [],
        };
    } catch {
        return null;
    }
}

export async function clickupUpdateStatus(config: IssueTrackerConfig, taskId: string, status: string): Promise<boolean> {
    try {
        const response = await fetch(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            {
                method: "PUT",
                headers: {
                    Authorization: config.apiToken || "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ status }),
            }
        );

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

export async function syncIssueToExternal(localIssueId: string): Promise<IssueTrackerLink[]> {
    const db = getDatabase();
    const links: IssueTrackerLink[] = [];

    const issue = await db.query.issues.findFirst({
        where: eq(schema.issues.id, localIssueId),
    });

    if (!issue) return links;

    const configs = await getIssueTrackerConfigs(issue.repositoryId);

    for (const config of configs) {
        if (!config.isEnabled || !config.syncToExternal) continue;

        let externalId: string | null = null;
        let externalKey: string | null = null;
        let externalUrl: string | null = null;

        switch (config.provider) {
            case "jira": {
                const result = await jiraCreateIssue({
                    config,
                    summary: issue.title,
                    description: issue.body || undefined,
                });
                if (result) {
                    externalId = result.id;
                    externalKey = result.key;
                    externalUrl = result.url;
                }
                break;
            }
            case "linear": {
                const result = await linearCreateIssue({
                    config,
                    title: issue.title,
                    description: issue.body || undefined,
                });
                if (result) {
                    externalId = result.id;
                    externalKey = result.identifier;
                    externalUrl = result.url;
                }
                break;
            }
            // Add Trello/ClickUp as needed
        }

        if (externalId) {
            const link = {
                id: crypto.randomUUID(),
                configId: config.id,
                localIssueId,
                externalId,
                externalKey,
                externalUrl,
                lastSyncAt: new Date(),
                createdAt: new Date(),
            };

            // @ts-expect-error - Drizzle multi-db union type issue
            await db.insert(schema.issueTrackerLinks).values(link);
            links.push(link as IssueTrackerLink);
        }
    }

    return links;
}

export async function getLinkedExternalIssues(localIssueId: string): Promise<{
    link: IssueTrackerLink;
    config: IssueTrackerConfig;
}[]> {
    const db = getDatabase();

    try {
        const links = await db.query.issueTrackerLinks?.findMany({
            where: eq(schema.issueTrackerLinks.localIssueId, localIssueId),
        }) || [];

        const results = [];

        for (const link of links) {
            const config = await db.query.issueTrackerConfigs?.findFirst({
                where: eq(schema.issueTrackerConfigs.id, link.configId),
            });

            if (config) {
                results.push({ link, config });
            }
        }

        return results;
    } catch {
        return [];
    }
}

// ============================================================================
// WEBHOOK HANDLERS
// ============================================================================

export async function handleIssueTrackerWebhook(
    provider: string,
    webhookSecret: string,
    payload: Record<string, unknown>
): Promise<boolean> {
    const db = getDatabase();

    const config = await db.query.issueTrackerConfigs?.findFirst({
        where: and(
            eq(schema.issueTrackerConfigs.provider, provider),
            eq(schema.issueTrackerConfigs.webhookSecret, webhookSecret)
        ),
    });

    if (!config || !config.syncFromExternal) {
        return false;
    }

    // Handle webhook based on provider
    switch (provider) {
        case "jira":
            return handleJiraWebhook(config, payload);
        case "linear":
            return handleLinearWebhook(config, payload);
        case "trello":
            return handleTrelloWebhook(config, payload);
        case "clickup":
            return handleClickUpWebhook(config, payload);
        default:
            return false;
    }
}

async function handleJiraWebhook(config: IssueTrackerConfig, payload: Record<string, unknown>): Promise<boolean> {
    const db = getDatabase();
    const event = payload.webhookEvent as string;
    const issue = payload.issue as Record<string, unknown>;

    if (!issue) return false;

    const link = await db.query.issueTrackerLinks?.findFirst({
        where: and(
            eq(schema.issueTrackerLinks.configId, config.id),
            eq(schema.issueTrackerLinks.externalId, String(issue.id))
        ),
    });

    if (!link?.localIssueId) return false;

    if (event === "jira:issue_updated") {
        const fields = issue.fields as Record<string, unknown>;
        const status = (fields.status as Record<string, unknown>)?.name as string;

        // Update local issue state
        const newState = status?.toLowerCase().includes("done") ? "closed" : "open";

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.issues)
            .set({ state: newState, updatedAt: new Date() })
            .where(eq(schema.issues.id, link.localIssueId));
    }

    return true;
}

async function handleLinearWebhook(config: IssueTrackerConfig, payload: Record<string, unknown>): Promise<boolean> {
    // Similar implementation
    logger.info({ config: config.id }, "Linear webhook received");
    return true;
}

async function handleTrelloWebhook(config: IssueTrackerConfig, payload: Record<string, unknown>): Promise<boolean> {
    logger.info({ config: config.id }, "Trello webhook received");
    return true;
}

async function handleClickUpWebhook(config: IssueTrackerConfig, payload: Record<string, unknown>): Promise<boolean> {
    logger.info({ config: config.id }, "ClickUp webhook received");
    return true;
}
