# OpenCodeHub Graphite-Parity Plan

## Goal

Make OpenCodeHub feel like a unified, stack-first code review platform rather than a collection of separate features.

## Product target

Match the core workflow quality of Graphite across:

- stacked PR creation and maintenance
- PR inbox and review queue
- merge queue orchestration
- AI-assisted review inside the PR flow
- team notifications and reviewer routing
- delivery insights

## Delivery phases

### Phase 1 — Review Workflow Foundation

Focus on the daily reviewer loop.

- Smart PR inbox with urgency sorting
- stack-aware review context in inbox rows
- queue readiness and AI review signals in inbox
- stronger PR page summary and next-action surface

### Phase 2 — Modern PR Review Surface

Focus on the core PR page.

- review summary rail
- stack navigation and blockers summary
- check status rollup
- reviewer assignment and request actions
- higher-signal conversation and file review affordances

### Phase 3 — AI Reviewer Experience

Focus on a productized AI flow.

- AI review status in inbox and PR page
- AI findings grouped by severity
- suggested-fix application workflow
- conversational PR copilot / chat surface

### Phase 4 — Merge Orchestration

Focus on confident shipping.

- stack-aware merge queue UX
- speculative run visibility
- queue health and retry actions
- stronger protections and failure messaging

### Phase 5 — Team Workflow & Metrics

Focus on management and scale.

- reviewer load balancing
- smarter notifications and routing
- team review SLAs
- delivery dashboards tied to stacks and queue flow

## Current sprint

### Sprint A — Smart Inbox

Deliver a Graphite-style entry point for code review.

Planned scope:

1. overview cards for review workload
2. smart priority sort
3. stack, merge queue, and AI review signals in each row
4. fixed PR deep-links
5. client-side search for review triage

Status: shipped

### Sprint B — PR Review Cockpit

Deliver a Graphite-style PR command surface.

Planned scope:

1. review cockpit summary rail on the PR page
2. next-action guidance for review, queue, and merge
3. stack, queue, AI review, and checks signals in one place
4. real reviewers and assignees summary instead of placeholders
5. quick jump actions for conversation, files, and commits

Status: shipped

### Sprint C — AI Review Assistant

Deliver a productized AI reviewer inside the PR flow.

Planned scope:

1. strong empty, running, completed, and failed AI review states
2. grouped findings by severity and file
3. AI summary with model, provider, and run metadata
4. refresh and rerun controls from the review surface
5. first-pass guided triage for highest-risk findings

Status: shipped

### Sprint D — Merge Orchestration Console

Deliver a stronger queue operator experience.

Planned scope:

1. queue health summary and throughput signals
2. speculative run visibility on the merge queue page
3. failed entry recovery with retry and removal actions
4. clearer queue lane, attempt, and ETA metadata
5. tighter PR-to-queue workflow continuity

Status: shipped

### Sprint E — Team Workflow Command Center

Deliver a team-level workflow and metrics surface.

Planned scope:

1. reviewer load and active queue visibility on the dashboard
2. team flow metrics with merge and review throughput signals
3. notification routing and blocking alert summaries
4. SLA-style attention panels for overdue review work
5. tighter handoff between inbox, notifications, and repository work

Status: shipped

### Sprint F — Workflow Continuity Hub

Deliver tighter movement between review surfaces.

Planned scope:

1. inbox, dashboard, and notifications linked as one attention system
2. blocking notifications promoted into a dedicated lane
3. quick-jump actions to review, clear, and route work faster
4. stronger summary cards for notification pressure and review demand
5. consistent workflow framing across attention surfaces

Status: shipped

### Sprint G — Repository Review Operations

Deliver a repo-level review command surface.

Planned scope:

1. repository pull request metrics and review pressure summary
2. stronger row-level signals for queue, AI, and merge readiness
3. faster multi-select actions for merge-ready work
4. clearer handoff from repository pulls to queue and insights
5. tighter review operations framing on the repository PR list

Status: shipped

### Sprint H — Repository Insights Upgrade

Deliver a repo-level flow and delivery lens.

Planned scope:

1. review, queue, and AI pressure summaries on the insights page
2. stronger flow-health framing alongside pulse metrics
3. direct links from insights into pull requests and merge queue execution
4. contributor and workload sections aligned with review operations
5. clearer action-oriented repository intelligence instead of passive charts only

Status: shipped

### Sprint I — Reviewer Routing Center

Deliver faster reviewer and owner routing from the repository PR surface.

Planned scope:

1. load-aware reviewer suggestions for repository pull request operations
2. bulk request-reviewer actions from selected PRs
3. bulk assignee routing from selected PRs
4. required-vs-requested reviewer control for routing workflows
5. tighter workflow continuity between repo operations and reviewer ownership

Status: shipped

### Sprint J — Merge Queue Intake Lane

Deliver faster queue admission from repository pull request operations.

Planned scope:

1. bulk queue-add actions from the repository PR list
2. queue-ready selection for merge-clean pull requests that are not already queued
3. merge method and queue priority controls at routing time
4. partial-success queue intake feedback for maintainers operating many PRs
5. tighter handoff from review operations into merge queue execution

Status: shipped

### Sprint K — Merge Queue Control Lane

Deliver direct queue control from the repository PR list.

Planned scope:

1. queued-PR selection directly from the repository pull request surface
2. bulk queue reprioritization without opening the merge queue page
3. bulk queue removal for stale or blocked entries
4. queue control feedback with added, skipped, and failed style summaries
5. tighter continuity between queue intake and queue operations on one surface

Status: shipped

### Sprint L — Reviewer SLA Escalation Lane

Deliver review-health actioning from the repository PR list.

Planned scope:

1. stale review detection surfaced on repository pull request rows
2. reviewer SLA risk signals based on aging review requests
3. bulk dismissal of stale reviews from the repository operations surface
4. bulk reviewer escalation for overdue review requests
5. tighter continuity between reviewer routing and follow-through operations

Status: shipped

### Sprint M — Row-Level Quick Actions

Deliver one-click PR operations directly from repository PR rows.

Planned scope:

1. quick queue add and queue removal directly from PR rows
2. quick reviewer routing from PR rows using load-aware suggestions
3. quick stale-review dismissal from PR rows
4. quick reviewer SLA escalation from PR rows
5. tighter movement from repository scan to action without multi-select setup

Status: shipped

### Sprint N — Smart Row Controls

Deliver smarter one-click ownership and queue tuning on PR rows.

Planned scope:

1. quick owner routing from PR rows using repo-level candidate signals
2. quick queue priority boosting from PR rows for already queued pull requests
3. shared row-control settings for urgency and reviewer behavior
4. tighter row-level movement from detection to ownership and queue tuning
5. smarter single-PR actioning without opening side surfaces first

Status: shipped

### Sprint O — Compact Row Action Menu

Deliver denser, cleaner row-level actions without losing speed.

Planned scope:

1. compact expandable quick-action menu on each PR row
2. reduced visual clutter from many always-visible row buttons
3. preserved one-click execution inside the row action surface
4. stronger scan-to-action ergonomics for dense repository PR lists
5. tighter row-level control presentation aligned with a workflow cockpit feel

Status: shipped

### Sprint P — Repository Attention Lanes

Deliver one-click triage lanes for the repository PR surface.

Planned scope:

1. attention-lane presets for merge-ready, queue-ready, queued, stale-review, SLA-risk, draft, and AI-risk work
2. active lane framing kept visible beside current selection context
3. lane counts that adapt to current search and open/closed filtering
4. fast lane reset without losing the rest of the repo operations surface
5. tighter movement from repository scan into a specific bucket of action-ready work

Status: shipped

### Sprint Q — Lane Execution Paths

Deliver direct batch execution from repository attention lanes.

Planned scope:

1. one-click select-lane actions for the active repository workflow bucket
2. lane-specific batch execution for queue-ready, queued, stale-review, SLA-risk, and merge-ready work
3. lane routing and owner assignment using the same reviewer-routing controls already on the surface
4. active-lane execution counts kept visible beside lane actions
5. tighter movement from triage lane to bulk execution without rebuilding selection manually

Status: shipped

### Sprint R — Action Outcome Recap

Deliver visible post-action feedback for repository workflow execution.

Planned scope:

1. persistent recap of the last repository pull-request operation after reload
2. summary framing for bulk merge, queue, routing, and review-health actions
3. lane and row actions contribute to one shared repository operations recap surface
4. action recap kept dismissible so the cockpit stays clean after follow-up work
5. tighter confidence loop from execution into verification without leaving the PR surface

Status: shipped

### Sprint S — Saved Team Presets

Deliver reusable repository workflow presets for recurring triage patterns.

Planned scope:

1. save current lane, routing, queue, and SLA configuration as a named preset
2. apply saved presets directly from the repository PR cockpit
3. lightweight preset summaries that show lane, queue mode, and routing context at a glance
4. delete stale presets without leaving the surface
5. tighter reuse of team review operating modes across repeated repository triage sessions

Status: shipped

### Sprint T — Preset Execution Paths

Turn saved team presets into one-click repository workflow macros.

Planned scope:

1. attach a primary run action to each saved preset
2. auto-select the preset lane when applying or running a preset
3. run a preset directly from the repository PR cockpit without rebuilding selection manually
4. preserve routing and owner context so preset execution can drive reviewer and assignee actions
5. show preset execution intent inline so teams can distinguish state-only presets from executable ones

Status: shipped

### Sprint U — Lane-Aware Preset Recommendations

Surface lane-based preset suggestions directly inside the repository PR cockpit.

Planned scope:

1. recommend the best saved or generated preset for the highest-pressure repository lanes
2. attach one-click run and load actions to each recommendation
3. generate lane-aware defaults when no saved preset exists for the current workflow bucket
4. allow recommended presets to be saved into the reusable team preset library
5. explain why each recommendation is being surfaced so teams understand the lane pressure behind it

Status: shipped

### Sprint V — Scheduled Preset Runs

Let repository teams schedule recurring preset-driven workflow passes.

Planned scope:

1. create browser-backed schedules for saved or recommended presets
2. support recurring queue-intake and daily SLA-sweep schedule templates
3. show due state, next run time, and last run time for each preset schedule
4. allow operators to run, pause, resume, and delete scheduled presets from the repository cockpit
5. auto-run due schedules while the repository workflow surface is open

Status: shipped

### Sprint W — Schedule History and Delivery Reporting

Make scheduled preset runs observable with history and outcome reporting.

Planned scope:

1. persist a recent run history for scheduled presets across repository cockpit refreshes
2. capture delivery outcome, trigger mode, lane, action, and PR scope for each schedule run
3. show aggregate reporting for successful runs, warnings, automatic runs, and PRs touched
4. surface the latest delivery outcome directly on each scheduled preset row
5. let operators clear reporting history when they want a fresh operational view

Status: shipped

### Sprint X — Cross-Repo Preset Rollups

Expand preset operations from a single repository view into team-level reporting.

Planned scope:

1. preserve repository identity on saved presets, schedules, and schedule delivery history
2. roll up preset adoption and active schedules across repositories in one cockpit surface
3. show team-level schedule reporting by repository, including delivery volume and warning pressure
4. highlight the most reused preset names across repository workflow surfaces
5. keep current-repo actions intact while exposing cross-repo operational context

Status: shipped

### Sprint Y — Shared Team Preset Publishing

Turn reusable repo presets into a publish/import workflow across repositories.

Planned scope:

1. publish saved presets from one repository into a shared team preset library
2. import shared presets from other repositories into the current cockpit
3. sync imported presets to the latest shared version without rebuilding them manually
4. show which presets are published locally versus imported from another repo
5. preserve cross-repo preset sharing while keeping per-repository execution and schedule controls intact

Status: shipped

### Sprint Z — Shared Preset Permissions and Audit Trails

Add governance controls so shared presets can be safely operated across repositories.

Planned scope:

1. enforce publish and sync actions against the viewer's repository access level
2. let source repositories set who can import versus who can manage a shared preset
3. prevent imported presets from overwriting the source repository's shared definition
4. surface permission state inline where shared presets are published, imported, and reused
5. record a recent audit trail for shared preset publishes, permission changes, imports, and sync attempts

Status: shipped

### Sprint AA — CLI Workflow Cockpit Polish

Bring the terminal experience closer to the web cockpit with clearer stack-first review surfaces.

Planned scope:

1. turn the root CLI help into a grouped workflow command center instead of a flat command dump
2. upgrade pull request, inbox, queue, and AI review output with richer status chips and action-oriented summaries
3. make command output feel consistent across review, queue, and delivery flows
4. keep scripting-safe flags intact while improving the default human-facing presentation
5. preserve existing command behavior while making the CLI feel closer to Graphite-style review operations

Status: shipped

### Sprint AB — Interactive Terminal Focus View

Turn the CLI into an action surface, not just a reporting surface.

Planned scope:

1. add a terminal focus view that summarizes the current branch, linked PR, queue state, and tracked stack branches
2. let operators queue or dequeue pull requests without leaving the focus surface
3. allow stack sync from the same focus surface so rebases stay close to review work
4. support review approval from the same interactive cockpit to reduce context switching
5. preserve a non-interactive snapshot mode for scripts and terminal automation

Status: shipped

### Sprint AC — Reviewer Inbox Shortcuts in Focus

Expand the terminal focus cockpit so reviewer actions stay in one loop.

Planned scope:

1. add request-changes and comment shortcuts directly inside the focus prompt flow
2. trigger AI review from the same focus surface without switching commands
3. open the current branch PR in the browser from the focus cockpit when deeper inspection is needed
4. keep queue, sync, and approval actions intact while broadening the reviewer workflow path
5. preserve refreshable snapshot behavior so the focus surface remains safe for repeated use

Status: shipped

### Sprint AD — Focus Merge and Navigation Shortcuts

Keep more of the stacked delivery loop inside the same terminal cockpit.

Planned scope:

1. merge a selected pull request from the focus surface with explicit merge method control
2. check out a selected PR branch locally without leaving the focus loop
3. copy PR URLs or PR numbers for chat, tickets, and release coordination directly from focus
4. preserve current queue, review, and browser shortcuts while expanding terminal-native navigation
5. keep recap messaging strong so each shortcut confirms the exact branch or PR that changed

Status: shipped

### Sprint AE — Focus Reviewer and Queue Control Shortcuts

Expand `och focus` so maintainers can finish more review and queue work without leaving the cockpit.

Planned scope:

1. close a selected pull request from the focus surface with confirmation
2. preview a selected PR diff directly in the focus recap flow
3. assign requested or required reviewers from repository routing candidates
4. reprioritize or remove queued pull requests from the same interactive loop
5. preserve merge, browser, clipboard, and review shortcuts while broadening queue-control coverage

Status: shipped

### Sprint AF — Focus Diff Pager Depth

Deepen PR inspection inside `och focus` so long diffs do not force a context switch.

Planned scope:

1. open full PR diffs in the configured terminal pager when interactive mode is available
2. preserve quick diff previews in the focus recap lane for short inspection loops
3. support clipboard export for the full diff when reviewers need to share or archive it
4. keep colorized, readable diff output when paging through large patches
5. preserve the existing focus loop so diff inspection returns to the cockpit cleanly

Status: shipped

### Sprint AG — Stack Reorder Control

Bring stack structure editing into the CLI so operators can reshape stacked delivery lanes without dropping to the web UI.

Planned scope:

1. add an interactive `och stack reorder` flow that loads tracked stack PRs from the current repository
2. preview dependency-based stack suggestions before applying any metadata changes
3. support manual move-up and move-down style reordering from the terminal loop
4. apply the selected order through the stack-order API with clear recap output
5. preserve stack submit and sync flows while making stack structure changes easier from the CLI

Status: shipped

### Sprint AH — Stack Submit Preview and Parent Reassignment

Make stack maintenance safer by letting operators inspect the submit plan and repair parent links before pushing.

Planned scope:

1. add a stack submit preview mode that shows branch order, generated titles, and linked open PR coverage
2. surface whether each tracked stack branch already has an open PR on the same source branch
3. add a terminal command to inspect, reassign, or clear tracked parent branches
4. prevent obvious parent-cycle mistakes during reassignment
5. keep reorder, sync, and submit flows coherent after parent-link edits

Status: shipped

### Sprint AI — Stack Health Checks and Submit Gap Warnings

Make stack delivery safer by surfacing merge blockers and submission gaps before operators push or merge.

Planned scope:

1. add a dedicated `och stack health` command for the current tracked stack
2. flag missing linked PR coverage, draft PRs, and parent-target mismatches across the stack
3. surface PR merge-readiness blockers directly in terminal stack workflows
4. show richer warning panels inside `och stack submit --preview`
5. prompt before continuing with stack submit when interactive health checks find gaps or blockers

Status: shipped

### Sprint AJ — Stack Approval and Merge Terminal Flows

Keep the end of the stacked delivery lane inside the CLI by bringing approval requests and stack merge execution into the same terminal workflow.

Planned scope:

1. add a dedicated `och stack approvals` command for stack-wide approval visibility
2. support reviewer requests and dry-run reviewer eligibility checks from the terminal
3. surface stack merge blockers and approval status before queueing merge
4. add `och stack merge` with explicit merge method control and confirmation flow
5. support CLI bearer-token access for stack approval, readiness, and merge APIs

Status: shipped

### Sprint AK — Focus Stack Approval and Merge Cockpit

Keep the stack approval and merge finish line inside `och focus` so operators can stay in one interactive lane.

Planned scope:

1. surface the active remote stack directly inside the focus snapshot
2. add focus shortcuts for stack approval visibility and reviewer requests
3. add focus shortcuts for stack merge readiness and queueing merge
4. preserve the existing review, queue, and diff shortcuts while expanding stack operations
5. keep action recap messaging strong so focus remains a safe command loop

Status: shipped

### Sprint AL — Stack Auto-Update and Rebase Polish

Make stack maintenance more reliable from the terminal by surfacing behind status and clearer rebase outcomes.

Planned scope:

1. add a dedicated `och stack update` command for remote stack behind-status checks
2. support terminal auto-update and full remote stack rebase flows
3. enable CLI bearer-token access for stack auto-update and rebase APIs
4. show branch-level recaps after local stack sync operations
5. keep stack maintenance outcomes readable enough for quick operator follow-through

Status: shipped

### Sprint AM — Stack-Aware Reviewer Hints and Merge-Lane Queue Polish

Make the terminal stack cockpit smarter by showing reviewer-load guidance and adding a dedicated stack-to-queue lane command.

Planned scope:

1. surface stack-aware reviewer recommendations and load hints inside `och focus`
2. show stack position context in focus review rows and reviewer assignment choices
3. add a dedicated `och stack queue` command for merge-lane planning and execution
4. preview already-queued, skipped, and queueable stack PRs before writing queue state
5. keep stack routing and merge-lane actions readable enough for quick operator follow-through

Status: shipped

### Sprint AN — Focus Stack Queue Management and Queue-Health Hints

Make the terminal cockpit stronger at merge-lane execution by bringing stack queue controls and queue-pressure hints into `och focus`.

Planned scope:

1. add stack queue preview and execution directly inside `och focus`
2. support queued-stack reprioritize, removal, and failed-entry retry flows from the same loop
3. surface repository queue-health counters alongside active-stack queue coverage
4. show load hints for how much repository queue pressure sits ahead of the current stack lane
5. keep queue management readable enough that terminal operators can stay in one focus surface

Status: shipped

### Sprint AO — Focus Queue Operator Controls

Make the terminal cockpit usable for head-of-line merge-queue operations by bringing repository-level process and retry controls into `och focus`.

Planned scope:

1. add repository queue `process` control directly inside `och focus`
2. support failed-entry retry from the queue-management flow without leaving focus
3. keep reprioritize and removal paths available for active queue entries in the same control surface
4. reuse queue-health hints so operators can act on queue pressure with immediate context
5. keep queue operations readable enough for maintainers to stay inside one terminal loop

Status: shipped

### Sprint AP — Focus Queue Head and Failure Visibility

Make the terminal cockpit easier to operate under queue pressure by surfacing queue-head detail and failed-entry reasons directly in the focus summary.

Planned scope:

1. show richer queue-head detail inline in the `och focus` queue panel
2. preview recent failed-entry reasons without opening a separate queue surface
3. keep stack queue coverage and repository queue counts visible beside the new detail lines
4. help operators spot broken queue entries and active head-of-line state at a glance
5. keep the queue summary readable enough for one-loop terminal triage

Status: shipped

### Sprint AQ — Focus Queue Entry Drill-Down

Make the terminal cockpit better for queue triage by letting operators preview a selected queue entry in detail from `och focus`.

Planned scope:

1. add queue entry preview actions directly inside `och focus`
2. show status, CI state, timestamps, stack position, and failure reason for the selected entry
3. keep queue-head and failed-entry summaries visible in the main queue panel
4. help operators inspect individual queue entries without leaving the focus loop
5. keep the preview readable enough for quick merge-lane decision making

Status: shipped

### Sprint AR — Focus Queue Entry Direct Actions

Make queue triage faster by letting operators open or copy the selected queued PR directly from the focus queue flow.

Planned scope:

1. support opening the selected queued PR in the browser from `och focus`
2. support copying the queued PR URL, number, or both from the queue preview flow
3. preserve the detailed queue-entry preview as the default inspection path
4. keep queue-head and failure visibility intact alongside the new direct actions
5. keep queue triage fast enough that operators can stay inside one terminal loop

Status: shipped

### Sprint AS — Focus Cross-Repo Queue Pressure Summary

Make the terminal cockpit more useful for operators managing multiple repositories by surfacing queue pressure across sibling repos directly in `och focus`.

Planned scope:

1. load queue summaries for repositories under the current owner namespace
2. show queued, ready, pending, and failed pressure across sibling repos in one panel
3. keep the current repository visible in the same panel for quick comparison
4. surface the head queued PR for the busiest repos so operators can spot where flow is blocked
5. keep the cross-repo summary lightweight enough for fast focus-loop triage

Status: shipped

### Sprint AT — Focus Cross-Repo Queue Filtering and Sorting

Make the cross-repo queue pressure panel more operator-friendly by adding filter and sort controls directly inside `och focus`.

Planned scope:

1. add queue pressure filter controls for all repos, active repos, or failed repos
2. add sorting controls for pressure score, failures, queue size, ready count, and recency
3. keep the current repository pinned in the cross-repo panel for quick comparison
4. show the currently active filter and sort in the cross-repo summary footer
5. keep cross-repo queue triage adjustable without leaving the focus loop

Status: shipped

## Success criteria

- reviewers can see what needs attention first without opening multiple pages
- stack relationships are visible from the inbox
- merge-ready and blocked PRs are distinguishable at a glance
- AI review state is visible before opening the PR
- the UI feels consistent with the app design system
- the PR page exposes one clear next action without making the user inspect multiple widgets
- AI findings can be triaged directly from the PR page without scanning a flat wall of results
- queue operators can identify blocked entries and speculative execution state without digging into logs
- teams can spot overloaded reviewers, blocking alerts, and slow review flow from one dashboard surface
- users can move from dashboard to inbox to notifications without losing context about what needs action next
- repository maintainers can see review pressure and act on merge-ready PRs directly from the repo pull requests view
- repository maintainers can understand review and delivery health from the insights page without hopping across multiple tabs
- repository maintainers can route reviewers and assignees across multiple PRs without opening each PR individually
- repository maintainers can move queue-ready pull requests into the merge queue in bulk from the repository PR list
- repository maintainers can reprioritize or remove queued pull requests from the repository PR list without switching to the merge queue page
- repository maintainers can identify overdue or stale review work and action it directly from the repository PR list
- repository maintainers can take common queue and reviewer actions directly from an individual PR row
- repository maintainers can quickly assign owners and tune queue urgency directly from an individual PR row
- repository maintainers can access rich row-level actions without overwhelming the PR list with persistent controls
- repository maintainers can instantly focus the PR list on one action lane without leaving the repository workflow surface
- repository maintainers can execute the active repository attention lane in bulk without rebuilding selection first
- repository maintainers can verify the outcome of their latest repository PR action even after the page refreshes
- repository maintainers can reuse saved lane and action configurations for repeated team review workflows
- repository maintainers can auto-select and execute saved repository workflow presets in one click
- repository maintainers can see and act on lane-aware preset recommendations from the repository PR cockpit
- repository maintainers can schedule recurring preset runs such as queue intake and SLA sweeps from the repository PR cockpit
- repository maintainers can review delivery history and recent outcomes for scheduled preset runs from the repository PR cockpit
- repository maintainers can review cross-repo preset adoption and team-level schedule reporting from the repository PR cockpit
- repository maintainers can publish, import, and sync shared team presets across repository workflow cockpits
- repository maintainers can govern shared preset access and review audit history from the repository PR cockpit
- terminal users can triage inbox, PR, queue, and AI review workflows from a more polished stack-first CLI cockpit
- terminal users can close PRs, preview diffs, route reviewers, and manage queue priority from the same focus loop
- terminal users can inspect long PR diffs in a pager without leaving the focus cockpit
- terminal users can reorder tracked stack PRs and apply updated stack metadata directly from the CLI
- terminal users can preview stack submission intent and repair tracked parent links before pushing
- terminal users can inspect stack health and merge blockers before submitting or merging a stacked lane
- terminal users can request stack approvals and queue stack merges without leaving the terminal cockpit
- terminal users can trigger stack approval and stack merge flows from the same interactive `och focus` cockpit
- terminal users can inspect stack behind-status and run auto-update or rebase flows directly from the CLI
- terminal users can see stack-aware reviewer load hints in `och focus` and add the full stack to the merge lane from one command
- terminal users can queue, sync, and approve review work from one interactive focus surface
- terminal users can request changes, comment, trigger AI review, and open the current PR from the same focus surface
- terminal users can merge, check out, and copy PR references from the same focus surface
