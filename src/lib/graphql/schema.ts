/**
 * GraphQL Schema Definitions
 * Type definitions for OpenCodeHub GraphQL API
 */

export const typeDefs = /* GraphQL */ `
  scalar DateTime

  type Query {
    # User queries
    viewer: User
    user(username: String!): User
    
    # Repository queries  
    repository(owner: String!, name: String!): Repository
    
    # Search
    search(query: String!, type: SearchType!, first: Int = 10, after: String): SearchConnection!
  }

  type Mutation {
    # Repository mutations
    createRepository(input: CreateRepositoryInput!): CreateRepositoryPayload!
    
    # Pull request mutations
    createPullRequest(input: CreatePullRequestInput!): CreatePullRequestPayload!
    mergePullRequest(input: MergePullRequestInput!): MergePullRequestPayload!
    
    # Review mutations
    addPullRequestReview(input: AddPullRequestReviewInput!): AddPullRequestReviewPayload!
    
    # Comment mutations
    addComment(input: AddCommentInput!): AddCommentPayload!
  }

  enum SearchType {
    REPOSITORY
    USER
    ISSUE
    PULL_REQUEST
  }

  # ============ User Types ============
  type User {
    id: ID!
    username: String!
    displayName: String
    email: String
    avatarUrl: String
    bio: String
    location: String
    website: String
    createdAt: DateTime!
    
    repositories(first: Int = 10, after: String): RepositoryConnection!
    pullRequests(first: Int = 10, states: [PullRequestState!]): PullRequestConnection!
    organizations: [Organization!]!
  }

  type Organization {
    id: ID!
    name: String!
    displayName: String
    avatarUrl: String
    description: String
    members(first: Int = 10): UserConnection!
    repositories(first: Int = 10): RepositoryConnection!
  }

  # ============ Repository Types ============
  type Repository {
    id: ID!
    name: String!
    fullName: String!
    description: String
    isPrivate: Boolean!
    isFork: Boolean!
    isArchived: Boolean!
    
    owner: User!
    defaultBranch: String!
    
    # Stats
    stargazerCount: Int!
    forkCount: Int!
    watcherCount: Int!
    
    # Content
    ref(qualifiedName: String!): Ref
    refs(first: Int = 10, refPrefix: String = "refs/heads/"): RefConnection!
    
    # Issues and PRs
    issues(first: Int = 10, states: [IssueState!]): IssueConnection!
    pullRequests(first: Int = 10, states: [PullRequestState!]): PullRequestConnection!
    
    # Metadata
    languages: [LanguageEdge!]!
    topics: [String!]!
    licenseInfo: License
    
    createdAt: DateTime!
    updatedAt: DateTime!
    pushedAt: DateTime
  }

  type Ref {
    name: String!
    prefix: String!
    target: GitObject!
  }

  interface GitObject {
    oid: String!
    abbreviatedOid: String!
  }

  type Commit implements GitObject {
    oid: String!
    abbreviatedOid: String!
    message: String!
    messageHeadline: String!
    messageBody: String
    author: GitActor!
    committer: GitActor!
    authoredDate: DateTime!
    committedDate: DateTime!
    parents(first: Int = 10): CommitConnection!
    tree: Tree!
  }

  type Tree implements GitObject {
    oid: String!
    abbreviatedOid: String!
    entries: [TreeEntry!]!
  }

  type TreeEntry {
    name: String!
    path: String!
    type: String!
    mode: Int!
    object: GitObject
  }

  type GitActor {
    name: String
    email: String
    date: DateTime
    user: User
  }

  type License {
    key: String!
    name: String!
    spdxId: String
    url: String
  }

  type LanguageEdge {
    node: Language!
    size: Int!
  }

  type Language {
    name: String!
    color: String
  }

  # ============ Issue Types ============
  type Issue {
    id: ID!
    number: Int!
    title: String!
    body: String
    state: IssueState!
    author: User!
    assignees(first: Int = 5): UserConnection!
    labels(first: Int = 10): LabelConnection!
    comments(first: Int = 10): CommentConnection!
    milestone: Milestone
    createdAt: DateTime!
    updatedAt: DateTime!
    closedAt: DateTime
  }

  enum IssueState {
    OPEN
    CLOSED
  }

  type Label {
    id: ID!
    name: String!
    color: String!
    description: String
  }

  type Milestone {
    id: ID!
    title: String!
    description: String
    dueOn: DateTime
    state: MilestoneState!
    progressPercentage: Float!
  }

  enum MilestoneState {
    OPEN
    CLOSED
  }

  # ============ Pull Request Types ============
  type PullRequest {
    id: ID!
    number: Int!
    title: String!
    body: String
    state: PullRequestState!
    isDraft: Boolean!
    
    author: User!
    headRefName: String!
    headRefOid: String!
    baseRefName: String!
    baseRefOid: String!
    
    mergeable: MergeableState!
    merged: Boolean!
    mergedAt: DateTime
    mergedBy: User
    
    additions: Int!
    deletions: Int!
    changedFiles: Int!
    
    commits(first: Int = 10): CommitConnection!
    files(first: Int = 100): PullRequestChangedFileConnection!
    reviews(first: Int = 10): PullRequestReviewConnection!
    comments(first: Int = 10): CommentConnection!
    reviewRequests(first: Int = 10): ReviewRequestConnection!
    
    assignees(first: Int = 5): UserConnection!
    labels(first: Int = 10): LabelConnection!
    
    createdAt: DateTime!
    updatedAt: DateTime!
    closedAt: DateTime
  }

  enum PullRequestState {
    OPEN
    CLOSED
    MERGED
  }

  enum MergeableState {
    MERGEABLE
    CONFLICTING
    UNKNOWN
  }

  type PullRequestChangedFile {
    path: String!
    additions: Int!
    deletions: Int!
    changeType: PatchStatus!
  }

  enum PatchStatus {
    ADDED
    DELETED
    MODIFIED
    RENAMED
    COPIED
    CHANGED
  }

  type PullRequestReview {
    id: ID!
    author: User!
    body: String
    state: PullRequestReviewState!
    submittedAt: DateTime
    comments(first: Int = 10): CommentConnection!
  }

  enum PullRequestReviewState {
    PENDING
    COMMENTED
    APPROVED
    CHANGES_REQUESTED
    DISMISSED
  }

  type ReviewRequest {
    id: ID!
    requestedReviewer: User!
    requestedAt: DateTime!
  }

  type Comment {
    id: ID!
    body: String!
    author: User!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # For inline comments
    path: String
    line: Int
    
    # Suggestion support
    suggestion: String
    suggestionApplied: Boolean
  }

  # ============ Connection Types ============
  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type UserConnection {
    nodes: [User!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type RepositoryConnection {
    nodes: [Repository!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type IssueConnection {
    nodes: [Issue!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PullRequestConnection {
    nodes: [PullRequest!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type CommitConnection {
    nodes: [Commit!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type RefConnection {
    nodes: [Ref!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type CommentConnection {
    nodes: [Comment!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type LabelConnection {
    nodes: [Label!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PullRequestChangedFileConnection {
    nodes: [PullRequestChangedFile!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PullRequestReviewConnection {
    nodes: [PullRequestReview!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ReviewRequestConnection {
    nodes: [ReviewRequest!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type SearchConnection {
    nodes: [SearchResultItem!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  union SearchResultItem = Repository | User | Issue | PullRequest

  # ============ Input Types ============
  input CreateRepositoryInput {
    name: String!
    description: String
    visibility: RepositoryVisibility = PUBLIC
    hasIssues: Boolean = true
    hasWiki: Boolean = true
  }

  enum RepositoryVisibility {
    PUBLIC
    PRIVATE
  }

  input CreatePullRequestInput {
    repositoryId: ID!
    title: String!
    body: String
    headRefName: String!
    baseRefName: String!
    draft: Boolean = false
  }

  input MergePullRequestInput {
    pullRequestId: ID!
    mergeMethod: MergeMethod = MERGE
    commitTitle: String
    commitBody: String
  }

  enum MergeMethod {
    MERGE
    SQUASH
    REBASE
  }

  input AddPullRequestReviewInput {
    pullRequestId: ID!
    body: String
    event: PullRequestReviewEvent!
    comments: [DraftPullRequestReviewComment!]
  }

  enum PullRequestReviewEvent {
    COMMENT
    APPROVE
    REQUEST_CHANGES
  }

  input DraftPullRequestReviewComment {
    path: String!
    line: Int!
    body: String!
    suggestion: String
  }

  input AddCommentInput {
    subjectId: ID!
    body: String!
  }

  # ============ Payload Types ============
  type CreateRepositoryPayload {
    repository: Repository
    clientMutationId: String
  }

  type CreatePullRequestPayload {
    pullRequest: PullRequest
    clientMutationId: String
  }

  type MergePullRequestPayload {
    pullRequest: PullRequest
    clientMutationId: String
  }

  type AddPullRequestReviewPayload {
    pullRequestReview: PullRequestReview
    clientMutationId: String
  }

  type AddCommentPayload {
    comment: Comment
    clientMutationId: String
  }
`;
