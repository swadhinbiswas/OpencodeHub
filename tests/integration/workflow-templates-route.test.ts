import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canReadRepoMock,
  canWriteRepoMock,
  getWorkflowTemplatesMock,
  applyTemplateToRepoMock,
  fakeSchema,
} = vi.hoisted(() => ({
  canReadRepoMock: vi.fn(async () => true),
  canWriteRepoMock: vi.fn(async () => true),
  getWorkflowTemplatesMock: vi.fn(async () => [
    { id: "default-1", name: "Node.js CI", category: "ci", language: "node" },
  ]),
  applyTemplateToRepoMock: vi.fn(async () => ({
    id: "wf-1",
    repositoryId: "repo-1",
    name: "Node.js CI",
    path: ".github/workflows/ci.yml",
    content: "name: CI",
    templateId: "default-1",
    isEnabled: true,
  })),
  fakeSchema: {
    users: { username: {} },
    repositories: { ownerId: {}, name: {}, id: {} },
  } as any,
}));

let mockDb: any;

vi.mock("@/db", () => ({
  getDatabase: () => mockDb,
  schema: fakeSchema,
}));

vi.mock("@/lib/permissions", () => ({
  canReadRepo: canReadRepoMock,
  canWriteRepo: canWriteRepoMock,
}));

vi.mock("@/lib/workflow-templates", () => ({
  getWorkflowTemplates: getWorkflowTemplatesMock,
  applyTemplateToRepo: applyTemplateToRepoMock,
}));

import { GET as workflowTemplatesGet, POST as workflowTemplatesPost } from "@/pages/api/repos/[owner]/[repo]/workflow/templates";

function makeDb() {
  return {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: "owner-1" })),
      },
      repositories: {
        findFirst: vi.fn(async () => ({ id: "repo-1", ownerId: "owner-1", name: "demo" })),
      },
    },
  };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

describe("workflow templates route", () => {
  beforeEach(() => {
    mockDb = makeDb();
    getWorkflowTemplatesMock.mockReset();
    applyTemplateToRepoMock.mockReset();
    canReadRepoMock.mockResolvedValue(true);
    canWriteRepoMock.mockResolvedValue(true);
    getWorkflowTemplatesMock.mockResolvedValue([
      { id: "default-1", name: "Node.js CI", category: "ci", language: "node" },
    ]);
    applyTemplateToRepoMock.mockResolvedValue({
      id: "wf-1",
      repositoryId: "repo-1",
      name: "Node.js CI",
      path: ".github/workflows/ci.yml",
      content: "name: CI",
      templateId: "default-1",
      isEnabled: true,
    });
  });

  it("lists templates for readers", async () => {
    const response = await workflowTemplatesGet({
      params: { owner: "owner-1", repo: "demo" },
      url: new URL("http://localhost/api/repos/owner-1/demo/workflow/templates?category=ci"),
      locals: { user: { id: "user-1", isAdmin: false } },
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.templates).toHaveLength(1);
    expect(getWorkflowTemplatesMock).toHaveBeenCalledWith({
      category: "ci",
      language: undefined,
    });
  });

  it("applies a template for writers", async () => {
    const response = await workflowTemplatesPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/workflow/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: "default-1", workflowName: "ci" }),
      }),
    } as any);

    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body?.data?.workflow?.templateId).toBe("default-1");
    expect(applyTemplateToRepoMock).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      templateId: "default-1",
      workflowName: "ci",
    });
  });

  it("forbids apply when user lacks write access", async () => {
    canWriteRepoMock.mockResolvedValue(false);
    const response = await workflowTemplatesPost({
      params: { owner: "owner-1", repo: "demo" },
      locals: { user: { id: "user-1", isAdmin: false } },
      request: new Request("http://localhost/api/repos/owner-1/demo/workflow/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: "default-1" }),
      }),
    } as any);

    expect(response.status).toBe(403);
    expect(applyTemplateToRepoMock).not.toHaveBeenCalled();
  });
});
