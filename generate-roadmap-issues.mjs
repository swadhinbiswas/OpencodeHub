#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const checklistPath = path.join(repoRoot, 'github-issues-checklist.md');
const outputPath = path.join(repoRoot, 'github-roadmap-issues.json');

const source = fs.readFileSync(checklistPath, 'utf8');
const lines = source.split(/\r?\n/);

const issueLine = /^- \[ \] (G\d{3}) \| \[(Partial|Missing)\] (.+?) \| WS: `(WS\d+)` \| Phase: `(\d+)` \| Priority: `(low|medium|high)` \| Labels: `([^`]+)`$/;

const issues = [];

for (const line of lines) {
  const match = line.match(issueLine);
  if (!match) continue;

  const [, id, status, feature, ws, phase, priority, labelCsv] = match;
  const labels = labelCsv.split(',').map((label) => label.trim()).filter(Boolean);

  const title = `[${id}] ${feature}`;
  const body = [
    `<!-- roadmap-id:${id} -->`,
    '',
    `## Metadata`,
    `- Gap ID: ${id}`,
    `- Status: ${status}`,
    `- Workstream: ${ws}`,
    `- Phase: ${phase}`,
    `- Priority: ${priority}`,
    '',
    '## Problem',
    'Current state and gap from feature audit.',
    '',
    '## Scope',
    '- Backend/API changes',
    '- UI/UX changes',
    '- Data model/migrations',
    '- Docs updates (`docs/` + `docs-site/src/content/docs/`)',
    '',
    '## Acceptance Criteria',
    '- [ ] Feature behavior complete',
    '- [ ] Authorization/security checks in place',
    '- [ ] Unit/integration/e2e tests added',
    '- [ ] `lint` + `typecheck` + tests pass',
    '- [ ] Docs updated in both doc trees',
    '',
    '## Technical Notes',
    'Relevant files/modules, rollout/rollback plan, migration details.',
    '',
    '## Source',
    '- Checklist: `github-issues-checklist.md`',
    '- Roadmap: `notimplemented.md`',
  ].join('\n');

  issues.push({
    id,
    status: status.toLowerCase(),
    feature,
    ws,
    phase: Number(phase),
    priority,
    labels,
    title,
    body,
  });
}

if (issues.length === 0) {
  throw new Error('No issue rows parsed from github-issues-checklist.md');
}

issues.sort((a, b) => a.id.localeCompare(b.id));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(issues, null, 2)}\n`, 'utf8');

console.log(`Generated ${issues.length} issues -> ${path.relative(repoRoot, outputPath)}`);
