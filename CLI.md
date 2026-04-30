# CLI Plan

## Goal

Turn the OpenCodeHub CLI into a Graphite-style terminal cockpit where stacked delivery, queue control, and review actions happen from one fast interactive surface.

## Current shipped phases

1. Root CLI command center polish
2. PR, queue, inbox, and AI review terminal UI refresh
3. Interactive `och focus` cockpit
4. Reviewer shortcuts inside `och focus`

## Immediate phase

### Focus cross-repo queue pressure controls

Make the focus cockpit more useful for operators managing multiple repositories under one owner namespace:

- show queue pressure across sibling repositories directly inside `och focus`
- compare queued, ready, pending, and failed counts for nearby repositories in the same owner namespace
- keep the current repository visible in the same cross-repo pressure panel for fast comparison
- add filter and sort controls for the cross-repo queue pressure panel without leaving the focus loop

## Next planned CLI phases

### 1. Focus merge and navigation depth

- add merge method selection directly in `focus`
- support branch checkout without leaving the focus loop
- support copying PR references for chat, issues, and release notes
- keep the current branch/PR lane visible after each action recap

### 2. Focus reviewer productivity pack

- open full PR details in browser or terminal pager
- surface AI review severity and queue readiness inline in selection lists
- add richer reviewer load hints and queue lane metadata to selection lists
- keep diff previews readable without dropping out of the focus loop

### 3. Stack reorder control

- preview suggested stack ordering from the terminal
- apply stack order without leaving the CLI
- show parent-child transitions before rewriting stack metadata
- keep stack sync and submit flows aligned with the reordered result

### 4. Stack operations parity

- stack branch reordering helpers
- stacked PR submit/update preview
- branch parent reassignment from terminal
- stack health checks before submit and merge

### 5. Submit and merge confidence

- show stack submission gaps before push time
- highlight missing linked PR coverage in preview mode
- validate stack chain continuity after parent edits
- keep merge readiness and submit intent visible from one CLI surface

### 6. Team operations cockpit

- cross-repo focus mode
- reviewer workload snapshot in terminal
- queue bottleneck summary across repositories
- schedule and preset visibility from CLI

### 7. Automation and scripting parity

- stable JSON output for all focus sub-surfaces
- non-interactive single-action flags for CI and shell aliases
- clipboard/browser fallbacks with clearer OS detection
- action audit summaries for terminal workflows

## Quality bar

- every shortcut must keep the user in one command loop
- every action must return a clear recap panel
- interactive mode must stay safe and recoverable after failures
- non-interactive and JSON modes must remain script-friendly
- build and tests must stay green after each phase
