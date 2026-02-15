# OpenCodeHub Advanced Roadmap: Partial + Missing Features to Production

Date: February 15, 2026  
Primary source baseline: `doc/feature_audit.md` (47 implemented, 29 partial, 46 missing)

## 1. Goal And Exit Criteria

## Goal
Ship OpenCodeHub to a production-grade state by closing all partial (`⚠️`) and missing (`❌`) items from the current audit, while maintaining release quality, security, and documentation parity.

## Production Exit Criteria (must all be true)
- 100% of current `⚠️` and `❌` items are either implemented or intentionally de-scoped with approved rationale.
- `npm run lint`, `npm run typecheck`, and full test suite are green in CI for default branch.
- Security gates active in CI (secret scan, dependency audit threshold, auth/permission regression tests).
- Operational readiness complete: backup/restore verified, horizontal scaling validated, deployment runbooks complete.
- Documentation parity complete in both doc stacks:
  - `docs/` (markdown docs)
  - `docs-site/src/content/docs/` (Starlight docs)

## 2. Master Inventory (From Current Audit)

## Partial (29)
- Repository mirroring
- Monorepo advanced path scoping
- Repository templates
- Cross-PR dependency detection
- Stack rebase & auto-update
- Stack-level approvals
- Bulk merge (stack-level)
- Auto-merge rules
- Batch comments
- Code owner enforcement
- Multi-reviewer rules
- PR ↔ Issue linking
- External CI integration
- Merge checks & CI gates
- Automation rules engine
- Snyk integration depth
- Jira integration depth
- Email notifications hardening
- API change awareness
- RBAC UI/ops completion
- Secret scanning completion
- Merge frequency metrics
- Developer workload insights
- Smart notifications
- Blocking alerts
- Plugin system maturity
- API documentation completeness
- Kubernetes deployment packaging
- Horizontal scaling hardening

## Missing (46)
- File-level permissions
- Custom PR states
- Required reviewers per PR state
- PR checks completion
- Suggested changes
- Review templates
- Partial file approvals
- Custom issue fields
- Issue workflows
- Cross-repo issues
- Workflow templates
- Codecov
- Coveralls
- SonarQube
- GitLab CI
- CircleCI
- Buildkite
- Jenkins
- Linear
- Trello
- ClickUp
- Microsoft Teams
- Discord
- AWS integration
- Google Cloud integration
- Microsoft Azure integration
- Kubernetes-native experience
- Terraform/IaC hooks
- Cross-repo change sets
- Breaking-change detection
- Database migration detection
- License compliance scanning
- Hotspot file detection
- Export metrics
- Custom dashboards
- Daily/weekly digests
- Backup & restore tools
- Offline/air-gapped mode
- plus remaining audit-listed missing items under integrations/deployment categories

## 3. Delivery Model

## Program Duration
- 32 weeks total (8 months), starting February 16, 2026.

## Workstream Model
- WS1: Core Collaboration (PR/Review/Issues)
- WS2: CI/CD + Automation + Integrations
- WS3: Security + Compliance + Permissions
- WS4: Analytics + Notifications + Extensibility
- WS5: Platform + Self-host + Scalability
- WS6: Docs + DX + Release Quality (cross-cutting)

## Cadence
- 2-week sprints
- Every sprint must include:
  - Implementation tasks
  - Tests (unit/integration/e2e)
  - Docs updates in both doc trees
  - Security review checklist

## 4. Phase Plan

## Phase 0 (Weeks 1-2): Baseline Stabilization (mandatory before feature expansion)
### Objectives
- Establish a green CI baseline and strict quality gates.
### Deliverables
- Fix current lint/typecheck failures.
- Stabilize failing security tests.
- Add CI policy: no merge on failing lint/type/test.
- Add security CI jobs: secret scanning, `npm audit` threshold, dependency policy.
### Exit
- All core checks green on default branch.

## Phase 1 (Weeks 3-8): Core Collaboration Completion
### Scope
- Custom PR states
- Required reviewers per state
- Suggested changes
- Review templates
- Partial file approvals
- Multi-reviewer rules completion
- Code owner enforcement
- Batch comments UI completion
- PR checks completion
- PR↔Issue linking completion
- Custom issue fields
- Issue workflows
- Cross-repo issues
### Dependencies
- Schema migrations + policy engine updates
- Permissions integration
### Exit
- End-to-end PR/review/issues flows fully implemented and test-covered.

## Phase 2 (Weeks 9-14): CI/CD + Automation + External Integrations
### Scope
- Merge checks/gates completion
- Automation rules engine completion
- Workflow templates
- External CI integrations (GitLab CI, CircleCI, Buildkite, Jenkins)
- Code quality integrations (Codecov, Coveralls, SonarQube, Snyk deep integration)
- Jira hardening + Linear/Trello/ClickUp
### Exit
- Complete CI ecosystem coverage and automation reliability.

## Phase 3 (Weeks 15-20): Security, Compliance, Enterprise Controls
### Scope
- File-level permissions
- Secret scanning completion
- License compliance scanning
- RBAC admin UX completion
- API change awareness + breaking-change + migration detection
- Teams/Discord integrations for security/event alerts
### Exit
- Security/compliance controls production-validated.

## Phase 4 (Weeks 21-26): Analytics, Notification Intelligence, Extensibility
### Scope
- Merge frequency + workload insights completion
- Hotspot file detection
- Export metrics
- Custom dashboards
- Smart notifications + blocking alerts + daily/weekly digests
- Plugin system maturation
- API docs completeness (OpenAPI + examples + SDK parity)
### Exit
- Decision-quality analytics and notification intelligence ready.

## Phase 5 (Weeks 27-32): Platform and Operational Readiness
### Scope
- Kubernetes-native deployment experience + Helm chart
- Horizontal scaling hardening (merge queue/rate limit/distributed locking)
- Backup & restore tooling + restore drill automation
- Offline/air-gapped mode validation + docs
- Cloud integrations (AWS/GCP/Azure) from MVP to stable baseline
### Exit
- Self-hosting and operations fully production-ready.

## 5. Detailed Workstream Backlog With Acceptance Criteria

## WS1 Core Collaboration
- Implement custom PR states and state transitions.
- Add per-state reviewer requirements (user/team).
- Add suggested changes API + UI apply flow.
- Complete file-level and template-based review workflows.
- Complete issue workflows/custom fields/cross-repo issues.
Acceptance criteria:
- All new permissions enforced server-side.
- Migration + rollback scripts tested.
- E2E tests cover happy-path + authorization failures.

## WS2 CI/CD + Integrations
- Complete PR checks model and status propagation.
- Build provider adapters for external CI and quality tools.
- Complete automation engine actions/conditions/observability.
Acceptance criteria:
- Deterministic retry + dead-letter for failed webhooks/automation events.
- Integration contract tests per provider.

## WS3 Security + Compliance
- Complete CODEOWNERS policy enforcement.
- Harden secret scanning and compliance scanning.
- Complete RBAC admin and audit flows.
Acceptance criteria:
- Security regression suite must pass for every PR.
- All privileged APIs include authz tests.

## WS4 Analytics + Notifications + Extensibility
- Implement metrics exports and dashboard composer.
- Build prioritization model for smart notifications.
- Complete digest generation pipeline.
- Mature plugin lifecycle model and isolation.
Acceptance criteria:
- Query performance SLOs defined and validated.
- Notification relevance metrics tracked.

## WS5 Platform + Ops
- Helm chart and K8s operator-friendly configs.
- Distributed locks and queue correctness under multi-instance load.
- Automated backup/restore workflows.
Acceptance criteria:
- Load/stress test sign-off.
- Recovery time objective (RTO) and recovery point objective (RPO) measured.

## WS6 Docs + DX + Release Quality
- Every feature PR must include docs changes and changelog entry.
- API changes must update OpenAPI and examples.
- Add operator runbooks and troubleshooting guides.
Acceptance criteria:
- Docs lints/build passes in CI.
- No feature merges with stale docs.

## 6. Documentation Rollout Plan (both docs stacks)

## Documentation policy
- Single source of truth for implementation status: `doc/feature_audit.md` and this roadmap file.
- User-facing docs must be updated in both:
  - `docs/`
  - `docs-site/src/content/docs/`
- Required in every feature PR:
  - What changed
  - Configuration required
  - API/CLI changes
  - Security implications
  - Migration notes

## Docs Update Matrix

### Core Collaboration
- Update:
  - `docs/features/stacked-prs.md`
  - `docs/features/merge-queue.md`
  - `docs/features/ai-review.md`
  - `docs/guides/team-workflows.md`
  - `docs-site/src/content/docs/features/stacked-prs.md`
  - `docs-site/src/content/docs/features/merge-queue.md`
  - `docs-site/src/content/docs/features/ai-review.md`
  - `docs-site/src/content/docs/guides/team-workflows.md`

### CI/CD + Integrations
- Update:
  - `docs/development/testing.md`
  - `docs/guides/webhooks.md`
  - `docs/reference/cli-commands.md`
  - `docs-site/src/content/docs/features/ci-actions.md`
  - `docs-site/src/content/docs/guides/webhooks.md`
  - `docs-site/src/content/docs/reference/cli-core-commands.md`

### Security + Compliance
- Update:
  - `docs/administration/security.md`
  - `docs/guides/branch-protection.md`
  - `docs-site/src/content/docs/administration/security.md`
  - `docs-site/src/content/docs/guides/branch-protection.md`

### Analytics + Notifications
- Update:
  - `docs/administration/monitoring.md`
  - `docs/features/merge-queue.md` (metrics sections)
  - `docs-site/src/content/docs/features/developer-metrics.md`
  - `docs-site/src/content/docs/features/notifications.md`
  - `docs-site/src/content/docs/features/inbox.md`

### Platform + Self-host
- Update:
  - `docs/administration/deployment.md`
  - `docs/administration/configuration.md`
  - `docs-site/src/content/docs/administration/deploy-docker.md`
  - `docs-site/src/content/docs/administration/deploy-nginx.md`
  - add new Helm/K8s docs under both trees

## New docs files to add
- `docs/development/release-gates.md`
- `docs/administration/backup-restore.md`
- `docs/administration/horizontal-scaling.md`
- `docs/administration/air-gapped.md`
- `docs/reference/api-versioning.md`
- mirrored files in `docs-site/src/content/docs/...`

## 7. Governance, Ownership, and Tracking

## Ownership
- Tech Lead: roadmap execution and dependency management.
- Security Lead: threat model, authz reviews, compliance sign-off.
- Docs Lead: parity across both docs stacks.
- QA Lead: test strategy and release confidence.

## Tracking
- Create one epic per workstream and one issue per feature gap.
- Labeling model:
  - `roadmap/ws1` ... `roadmap/ws6`
  - `status/partial`, `status/missing`, `security`, `docs-required`
- Weekly KPI dashboard:
  - Partial count remaining
  - Missing count remaining
  - CI pass rate
  - Vulnerability count by severity
  - Docs parity completion %

## 8. Risk Register
- Scope expansion before baseline stability is restored.
- Integration vendor API drift.
- Schema migration regressions.
- Docs lagging behind feature implementation.
- Multi-instance correctness bugs (queues/locks/rate-limit).

Mitigation:
- Enforce phase gates.
- Contract tests for integrations.
- Migration rehearsal in staging.
- Docs-required check in PR template.
- Chaos/load testing before final release.

## 9. Immediate Next 14-Day Action Plan

1. Finish Phase 0 baseline stabilization.
2. Convert every `⚠️`/`❌` item into tracked issue with owner and estimate.
3. Start Phase 1 with this order:
   - Custom PR states
   - Required reviewers per state
   - CODEOWNERS enforcement
   - Suggested changes
   - Partial file approvals
4. Enable docs parity workflow in CI for both docs trees.

## 10. Definition Of Done Per Feature
- Code complete + migrations + backfill scripts
- Unit/integration/e2e tests
- Security review completed
- Performance impact measured
- Docs updated in `docs/` and `docs-site/src/content/docs/`
- Changelog updated
- Rollback plan documented

