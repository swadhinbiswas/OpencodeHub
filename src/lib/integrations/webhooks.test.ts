// @ts-ignore
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { sendDiscordMessage, createPREmbed } from "./discord";
import { sendTeamsMessage, createPRCard } from "./teams";

// Mock fetch globally
const originalFetch = global.fetch;
const mockFetch = mock((url: string | Request | URL, init?: RequestInit) => {
    return Promise.resolve(new Response("OK", { status: 200 }));
});

describe("Webhook Integrations", () => {
    beforeEach(() => {
        global.fetch = mockFetch;
        mockFetch.mockClear();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe("Discord", () => {
        it("should send a PR notification to Discord", async () => {
            const embed = createPREmbed({
                action: "opened",
                prTitle: "Test PR",
                prNumber: 123,
                prUrl: "http://example.com/pr/123",
                author: "testuser",
                repository: "owner/repo",
            });

            const success = await sendDiscordMessage("https://discord.com/api/webhooks/xyz", {
                username: "OpenCodeHub",
                embeds: [embed],
            });

            expect(success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch.mock.calls[0][0]).toBe("https://discord.com/api/webhooks/xyz");

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
            expect(body.username).toBe("OpenCodeHub");
            expect(body.embeds[0].title).toContain("Pull Request Opened");
        });

        it("should handle failures gracefully", async () => {
            global.fetch = mock(() => Promise.resolve(new Response("Error", { status: 500 })));

            const success = await sendDiscordMessage("https://discord.com/api/webhooks/xyz", {});
            expect(success).toBe(false);
        });
    });

    describe("Teams", () => {
        it("should send a PR notification to Teams", async () => {
            const card = createPRCard({
                action: "opened",
                prTitle: "Test PR",
                prNumber: 123,
                prUrl: "http://example.com/pr/123",
                author: "testuser",
                repository: "owner/repo",
            });

            const success = await sendTeamsMessage("https://outlook.office.com/webhook/xyz", card);

            expect(success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
            expect(body["@type"]).toBe("MessageCard");
            expect(body.summary).toContain("New Pull Request");
        });
    });
});
