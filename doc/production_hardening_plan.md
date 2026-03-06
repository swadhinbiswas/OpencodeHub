# OpenCodeHub Production Hardening Plan
Date: 2026-02-20
Owner: Platform/Core
Source: `doc/production_readiness_gap_2026-02-20.md`

## Goal
Close the measured production gap (28 points) and reach a stable, evidence-backed production-grade baseline aligned with OpenCodeHub philosophy (self-hosted, secure-by-default, high-velocity workflows).

## Current Baseline
- Readiness score: 72/100
- Typecheck: PASS
- Lint: FAIL (`npm run lint`)
- Tests: PASS (`npm run test` => 279/279)

## P0 Track (Blockers)
| ID | Work Item | Status | Evidence/Command | Exit Criteria | Target |
|---|---|---|---|---|---|
| P0-1 | Fix known failing tests on `main` baseline | Completed | `npm run test` | Zero known failing tests in default test run | 2026-02-20 |
| P0-2 | Make lint baseline green | In Progress | `npm run lint` | `astro check` exits 0 on clean branch | 2026-02-24 |
| P0-3 | Enforce red-build protection policy | Pending | branch protection + required checks | PR merge blocked unless CI green | 2026-02-25 |

## P1 Track (Critical Hardening)
| ID | Work Item | Status | Evidence/Command | Exit Criteria | Target |
|---|---|---|---|---|---|
| P1-1 | Reduce `@ts-expect-error` in core API/security paths | Pending | static scan count | 30% reduction in first pass | 2026-03-07 |
| P1-2 | Reduce explicit `any` in core API/security paths | Pending | static scan count | 25% reduction in first pass | 2026-03-10 |
| P1-3 | Define and publish SLOs + alerts | Pending | `docs/administration/monitoring.md` update | SLO doc + alert thresholds committed | 2026-03-12 |
| P1-4 | Backup + restore drill automation | Pending | CI/nightly job + drill report | Successful restore drill evidence | 2026-03-15 |
| P1-5 | Add SAST + secret scan CI gates | Pending | `.github/workflows/ci.yml` | Gates run on PR and fail on high severity | 2026-03-18 |

## P2 Track (Confidence Multipliers)
| ID | Work Item | Status | Evidence/Command | Exit Criteria | Target |
|---|---|---|---|---|---|
| P2-1 | Add required e2e smoke flow in CI | Pending | Playwright CI step | Auth/repo/PR/merge smoke passes in PR CI | 2026-03-22 |
| P2-2 | Add load/perf regression checks | Pending | perf scripts + report | Baseline p95s documented + thresholds | 2026-03-26 |
| P2-3 | Publish deployment compatibility matrix | Pending | docs update | matrix for single-node/HA/air-gapped/object storage | 2026-03-28 |

## Immediate Progress Log
- 2026-02-20: Started P0 execution.
- 2026-02-20: Notifications route regressions fixed (unit failures addressed in route fallback + tests updated).
- 2026-02-20: Full test baseline confirmed green (`npm run test` => 87 files, 279 tests passed).

## Weekly Checkpoint Template
- Week of: YYYY-MM-DD
- Score: XX/100 (delta +N)
- P0 status: 
- New blockers:
- Risks:
- Next week commits:
