
import { logger } from "@/lib/logger";

export interface JiraConfig {
    host: string;
    email: string;
    apiToken: string;
}

export interface JiraIssue {
    key: string;
    fields: {
        summary: string;
        description: string;
        status: { name: string };
        assignee?: { displayName: string };
        priority?: { name: string };
        issuetype?: { name: string; iconUrl: string };
    };
    webUrl: string; // Constructed URL
}

export class JiraClient {
    private config: JiraConfig;
    private baseUrl: string;

    constructor(config: JiraConfig) {
        this.config = config;
        this.baseUrl = `https://${config.host}`;
    }

    private getAuthHeader(): string {
        return `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString("base64")}`;
    }

    /**
     * Fetch issue details from Jira
     */
    async getIssue(issueKey: string): Promise<JiraIssue | null> {
        try {
            const response = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}`, {
                method: "GET",
                headers: {
                    "Authorization": this.getAuthHeader(),
                    "Accept": "application/json",
                },
            });

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                const error = await response.text();
                logger.error({ status: response.status, error, issueKey }, "Failed to fetch Jira issue");
                throw new Error(`Jira API error: ${response.status}`);
            }

            const data = await response.json();

            return {
                key: data.key,
                fields: {
                    summary: data.fields.summary,
                    description: data.fields.description, // Complex object in v3, simplify?
                    status: data.fields.status,
                    assignee: data.fields.assignee,
                    priority: data.fields.priority,
                    issuetype: data.fields.issuetype,
                },
                webUrl: `${this.baseUrl}/browse/${data.key}`,
            };
        } catch (error) {
            logger.error({ error, issueKey }, "Jira client error");
            return null;
        }
    }

    /**
     * Transition an issue (e.g., In Progress, Done)
     */
    async transitionIssue(issueKey: string, transitionId: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
                method: "POST",
                headers: {
                    "Authorization": this.getAuthHeader(),
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transition: { id: transitionId },
                }),
            });

            if (!response.ok) {
                logger.error({ status: response.status, issueKey }, "Failed to transition Jira issue");
                return false;
            }

            return true;
        } catch (error) {
            logger.error({ error, issueKey }, "Jira client transition error");
            return false;
        }
    }
}

/**
 * Factory to create Jira client from environment or DB config
 */
export function getJiraClient(): JiraClient | null {
    const host = process.env.JIRA_HOST;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;

    if (host && email && apiToken) {
        return new JiraClient({ host, email, apiToken });
    }

    return null;
}
