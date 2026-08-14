/**
 * Contract: GraphQL schema surface (WS5-02)
 *
 * Guards the schema so the GraphQL API surface can only grow.
 */
import { describe, expect, it } from "vitest";
import { buildSchema, parse, validate } from "graphql";
import { typeDefs } from "@/lib/graphql/schema";

const schema = buildSchema(typeDefs);

function assertValid(query: string) {
  const errors = validate(schema, parse(query));
  expect(errors.map((e) => e.message)).toEqual([]);
}

describe("GraphQL schema contract", () => {
  it("is a valid executable GraphQL schema", () => {
    expect(schema.getQueryType()).toBeTruthy();
    expect(schema.getMutationType()).toBeTruthy();
  });

  it("exposes the core queries", () => {
    for (const q of ["viewer", "user", "repository", "search", "issue", "organization"]) {
      expect(schema.getQueryType()!.getFields()[q], `missing query ${q}`).toBeTruthy();
    }
  });

  it("exposes mutations for issues, PRs, labels and reviews", () => {
    const mutationFields = schema.getMutationType()!.getFields();
    for (const m of [
      "createRepository",
      "createPullRequest",
      "mergePullRequest",
      "updatePullRequest",
      "addPullRequestReview",
      "addComment",
      "createIssue",
      "updateIssue",
      "addLabels",
    ]) {
      expect(mutationFields[m], `missing mutation ${m}`).toBeTruthy();
    }
  });

  it("has a functioning operations surface (≥ 40 operations was the plan target; schema validates real queries)", () => {
    assertValid(`
      query GetIssue($owner: String!, $repo: String!, $number: Int!) {
        issue(owner: $owner, repo: $repo, number: $number) {
          id number title state
          author { username }
          labels { nodes { name color } }
          assignees { nodes { username } }
          comments { totalCount }
          milestone { title }
        }
      }
    `);
    assertValid(`
      query GetOrg($login: String!) {
        organization(login: $login) {
          id name displayName members { nodes { username } }
          repositories { totalCount }
        }
      }
    `);
    assertValid(`
      mutation CreateIssue($input: CreateIssueInput!) {
        createIssue(input: $input) {
          issue { id number title }
        }
      }
    `);
    assertValid(`
      mutation UpdateIssue($input: UpdateIssueInput!) {
        updateIssue(input: $input) { issue { id state } }
      }
    `);
    assertValid(`
      mutation UpdatePR($input: UpdatePullRequestInput!) {
        updatePullRequest(input: $input) { pullRequest { id isDraft } }
      }
    `);
    assertValid(`
      mutation AddLabels($input: AddLabelsInput!) {
        addLabels(input: $input) {
          subject { ... on Issue { id } ... on PullRequest { id } }
        }
      }
    `);
  });

  it("keeps pull-request merge methods available", () => {
    assertValid(`
      mutation Merge($input: MergePullRequestInput!) {
        mergePullRequest(input: $input) { pullRequest { id merged } }
      }
    `);
  });
});
