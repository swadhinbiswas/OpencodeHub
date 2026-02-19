import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserFromRequestMock,
  fakeSchema,
} = vi.hoisted(() => ({
  getUserFromRequestMock: vi.fn(),
  fakeSchema: {
    repositories: { isTemplate: {}, visibility: {}, ownerId: {}, id: {}, name: {}, description: {}, updatedAt: {} },
    repositoryCollaborators: { userId: {}, repositoryId: {} },
    users: { username: {}, id: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/db/schema", () => ({
  repositories: fakeSchema.repositories,
  repositoryCollaborators: fakeSchema.repositoryCollaborators,
  users: fakeSchema.users,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: getUserFromRequestMock,
}));

import { GET as listTemplatesGet } from "@/pages/api/repos/templates";

describe("repo templates route", () => {
  beforeEach(() => {
    getUserFromRequestMock.mockReset();
    mockDb = {
      query: {
        repositoryCollaborators: {
          findMany: vi.fn(async () => []),
        },
        users: {
          findFirst: vi.fn(async () => ({ id: "owner-1" })),
        },
        repositories: {
          findMany: vi.fn(async () => [
            {
              id: "repo-1",
              name: "starter-template",
              description: "Template",
              visibility: "private",
              defaultBranch: "main",
              language: "TypeScript",
              updatedAt: new Date("2026-02-18T00:00:00Z"),
              owner: {
                id: "owner-1",
                username: "acme",
                displayName: "Acme",
                avatarUrl: null,
              },
            },
          ]),
        },
      },
    };
  });

  it("returns public templates for anonymous users", async () => {
    getUserFromRequestMock.mockResolvedValue(null);

    const response = await listTemplatesGet({
      request: new Request("http://localhost/api/repos/templates"),
      url: new URL("http://localhost/api/repos/templates"),
    } as any);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body?.data?.templates?.length).toBe(1);
    expect(mockDb.query.repositoryCollaborators.findMany).not.toHaveBeenCalled();
  });

  it("loads collaborator repository access for authenticated non-admin users", async () => {
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1", isAdmin: false });

    await listTemplatesGet({
      request: new Request("http://localhost/api/repos/templates"),
      url: new URL("http://localhost/api/repos/templates"),
    } as any);

    expect(mockDb.query.repositoryCollaborators.findMany).toHaveBeenCalledTimes(1);
  });

  it("returns empty set when owner filter does not resolve", async () => {
    getUserFromRequestMock.mockResolvedValue({ userId: "user-1", isAdmin: false });
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);

    const response = await listTemplatesGet({
      request: new Request("http://localhost/api/repos/templates?owner=missing"),
      url: new URL("http://localhost/api/repos/templates?owner=missing"),
    } as any);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body?.data?.templates).toEqual([]);
  });
});
