# GitHub Issue Checklist: Partial + Missing Gaps

Generated: 2026-02-15
Source: `doc/feature_audit.md`

Total gaps: **67** (Partial: **29**, Missing: **38**)

## How To Use
1. Create one GitHub issue per checklist line.
2. Use the line text as the issue title and metadata.
3. Apply listed labels exactly and assign an owner.
4. Add links to code paths + docs updates in `docs/` and `docs-site/src/content/docs/`.

## Issue Body Template
```md
## Problem
Current state and gap from feature audit.

## Scope
- Backend/API changes
- UI/UX changes
- Data model/migrations
- Docs updates (`docs/` + `docs-site/src/content/docs/`)

## Acceptance Criteria
- [ ] Feature behavior complete
- [ ] Authorization/security checks in place
- [ ] Unit/integration/e2e tests added
- [ ] `lint` + `typecheck` + tests pass
- [ ] Docs updated in both doc trees

## Technical Notes
Relevant files/modules, rollout/rollback plan, migration details.
```

## WS1 Core Collaboration

- [ ] G001 | [Partial] Monorepo support | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/partial,phase/1,priority/medium,docs-required`
- [ ] G002 | [Partial] Repository templates | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/partial,phase/1,priority/medium,docs-required`
- [ ] G003 | [Partial] Cross-PR dependency detection | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/partial,phase/1,priority/high,docs-required`
- [ ] G004 | [Partial] Stack rebase & auto-update | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/partial,phase/1,priority/high,docs-required`
- [ ] G005 | [Partial] Stack-level approvals | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/partial,phase/1,priority/high,docs-required`
- [ ] G006 | [Partial] Bulk merge (merge stacks) | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/partial,phase/1,priority/medium,docs-required`
- [ ] G007 | [Partial] Auto-merge rules | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/partial,phase/1,priority/high,docs-required`
- [ ] G008 | [Partial] Batch comments | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/partial,phase/1,priority/medium,docs-required`
- [ ] G009 | [Partial] Code owner enforcement | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/partial,phase/1,priority/high,docs-required`
- [ ] G010 | [Partial] Multi-reviewer rules | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/partial,phase/1,priority/high,docs-required`
- [ ] G011 | [Partial] PR ↔ Issue linking | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/partial,phase/1,priority/medium,docs-required`
- [ ] G012 | [Missing] File-level permissions | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/missing,phase/1,priority/high,docs-required`
- [ ] G013 | [Missing] Custom PR states | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/missing,phase/1,priority/high,docs-required`
- [ ] G014 | [Missing] Required reviewers per state | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/missing,phase/1,priority/high,docs-required`
- [ ] G015 | [Missing] PR checks | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/missing,phase/1,priority/high,docs-required`
- [ ] G016 | [Missing] Suggested changes | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/missing,phase/1,priority/medium,docs-required`
- [ ] G017 | [Missing] Review templates | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/missing,phase/1,priority/medium,docs-required`
- [ ] G018 | [Missing] Partial file approvals | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/missing,phase/1,priority/high,docs-required`
- [ ] G019 | [Missing] Custom issue fields | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/missing,phase/1,priority/medium,docs-required`
- [ ] G020 | [Missing] Issue workflows | WS: `WS1` | Phase: `1` | Priority: `high` | Labels: `roadmap/ws1,status/missing,phase/1,priority/high,docs-required`
- [ ] G021 | [Missing] Cross-repo issues | WS: `WS1` | Phase: `1` | Priority: `medium` | Labels: `roadmap/ws1,status/missing,phase/1,priority/medium,docs-required`

## WS2 CI/CD + Integrations

- [ ] G022 | [Partial] External CI integration | WS: `WS2` | Phase: `2` | Priority: `high` | Labels: `roadmap/ws2,status/partial,phase/2,priority/high,docs-required`
- [ ] G023 | [Partial] Merge checks & gates | WS: `WS2` | Phase: `2` | Priority: `high` | Labels: `roadmap/ws2,status/partial,phase/2,priority/high,docs-required`
- [ ] G024 | [Partial] Automation rules engine | WS: `WS2` | Phase: `2` | Priority: `high` | Labels: `roadmap/ws2,status/partial,phase/2,priority/high,docs-required`
- [ ] G025 | [Partial] Snyk | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/partial,phase/2,priority/medium,docs-required`
- [ ] G026 | [Partial] Jira | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/partial,phase/2,priority/medium,docs-required`
- [ ] G027 | [Missing] Workflow templates | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G028 | [Missing] Codecov | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G029 | [Missing] Coveralls | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G030 | [Missing] SonarQube | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G031 | [Missing] GitLab CI | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G032 | [Missing] CircleCI | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G033 | [Missing] Buildkite | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G034 | [Missing] Jenkins | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G035 | [Missing] Linear | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G036 | [Missing] Trello | WS: `WS2` | Phase: `2` | Priority: `low` | Labels: `roadmap/ws2,status/missing,phase/2,priority/low,docs-required`
- [ ] G037 | [Missing] ClickUp | WS: `WS2` | Phase: `2` | Priority: `low` | Labels: `roadmap/ws2,status/missing,phase/2,priority/low,docs-required`
- [ ] G038 | [Missing] Microsoft Teams | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G039 | [Missing] Discord | WS: `WS2` | Phase: `2` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/2,priority/medium,docs-required`
- [ ] G040 | [Missing] AWS | WS: `WS2` | Phase: `5` | Priority: `low` | Labels: `roadmap/ws2,status/missing,phase/5,priority/low,docs-required`
- [ ] G041 | [Missing] Google Cloud | WS: `WS2` | Phase: `5` | Priority: `low` | Labels: `roadmap/ws2,status/missing,phase/5,priority/low,docs-required`
- [ ] G042 | [Missing] Microsoft Azure | WS: `WS2` | Phase: `5` | Priority: `low` | Labels: `roadmap/ws2,status/missing,phase/5,priority/low,docs-required`
- [ ] G043 | [Missing] Terraform/IaC hooks | WS: `WS2` | Phase: `5` | Priority: `medium` | Labels: `roadmap/ws2,status/missing,phase/5,priority/medium,docs-required`

## WS3 Security + Compliance

- [ ] G044 | [Partial] API change awareness | WS: `WS3` | Phase: `3` | Priority: `medium` | Labels: `roadmap/ws3,status/partial,phase/3,priority/medium,docs-required`
- [ ] G045 | [Partial] Role-based access control (RBAC) | WS: `WS3` | Phase: `3` | Priority: `high` | Labels: `roadmap/ws3,status/partial,phase/3,priority/high,docs-required`
- [ ] G046 | [Partial] Secret scanning | WS: `WS3` | Phase: `3` | Priority: `high` | Labels: `roadmap/ws3,status/partial,phase/3,priority/high,docs-required`
- [ ] G047 | [Missing] Cross-repo change sets | WS: `WS3` | Phase: `3` | Priority: `medium` | Labels: `roadmap/ws3,status/missing,phase/3,priority/medium,docs-required`
- [ ] G048 | [Missing] Breaking-change detection | WS: `WS3` | Phase: `3` | Priority: `medium` | Labels: `roadmap/ws3,status/missing,phase/3,priority/medium,docs-required`
- [ ] G049 | [Missing] Database migration detection | WS: `WS3` | Phase: `3` | Priority: `medium` | Labels: `roadmap/ws3,status/missing,phase/3,priority/medium,docs-required`
- [ ] G050 | [Missing] License compliance scanning | WS: `WS3` | Phase: `3` | Priority: `medium` | Labels: `roadmap/ws3,status/missing,phase/3,priority/medium,docs-required`

## WS4 Analytics + Notifications + Extensibility

- [ ] G051 | [Partial] Email notifications | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/partial,phase/4,priority/medium,docs-required`
- [ ] G052 | [Partial] Merge frequency metrics | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/partial,phase/4,priority/medium,docs-required`
- [ ] G053 | [Partial] Developer workload insights | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/partial,phase/4,priority/medium,docs-required`
- [ ] G054 | [Partial] Smart notifications | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/partial,phase/4,priority/medium,docs-required`
- [ ] G055 | [Partial] Blocking alerts | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/partial,phase/4,priority/medium,docs-required`
- [ ] G056 | [Partial] Plugin/extension system | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/partial,phase/4,priority/medium,docs-required`
- [ ] G057 | [Partial] API documentation | WS: `WS4` | Phase: `4` | Priority: `high` | Labels: `roadmap/ws4,status/partial,phase/4,priority/high,docs-required`
- [ ] G058 | [Missing] Hotspot file detection | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/missing,phase/4,priority/medium,docs-required`
- [ ] G059 | [Missing] Export metrics | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/missing,phase/4,priority/medium,docs-required`
- [ ] G060 | [Missing] Custom dashboards | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/missing,phase/4,priority/medium,docs-required`
- [ ] G061 | [Missing] Daily/weekly digests | WS: `WS4` | Phase: `4` | Priority: `medium` | Labels: `roadmap/ws4,status/missing,phase/4,priority/medium,docs-required`

## WS5 Platform + Self-host + Scalability

- [ ] G062 | [Partial] Repository mirroring | WS: `WS5` | Phase: `5` | Priority: `high` | Labels: `roadmap/ws5,status/partial,phase/5,priority/high,docs-required`
- [ ] G063 | [Partial] Kubernetes deployment | WS: `WS5` | Phase: `5` | Priority: `medium` | Labels: `roadmap/ws5,status/partial,phase/5,priority/medium,docs-required`
- [ ] G064 | [Partial] Horizontal scaling | WS: `WS5` | Phase: `5` | Priority: `high` | Labels: `roadmap/ws5,status/partial,phase/5,priority/high,docs-required`
- [ ] G065 | [Missing] Kubernetes-native | WS: `WS5` | Phase: `5` | Priority: `medium` | Labels: `roadmap/ws5,status/missing,phase/5,priority/medium,docs-required`
- [ ] G066 | [Missing] Backup & restore tools | WS: `WS5` | Phase: `5` | Priority: `high` | Labels: `roadmap/ws5,status/missing,phase/5,priority/high,docs-required`
- [ ] G067 | [Missing] Offline/air-gapped mode | WS: `WS5` | Phase: `5` | Priority: `medium` | Labels: `roadmap/ws5,status/missing,phase/5,priority/medium,docs-required`

