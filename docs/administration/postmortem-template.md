# OpenCodeHub Incident Postmortem Template

## Postmortem: [Brief incident title]

**Date of incident:** YYYY-MM-DD
**Date of postmortem:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P0 / P1 / P2 / P3
**Prepared by:** @username
**Reviewers:** @username, @username

---

## 1. Summary

Brief (2-3 sentence) description of what happened, who was affected, and the impact.

Example: On 2026-04-21, the CI/CD pipeline failed for 3 hours, blocking all merges to main. 
~50 PRs were queued and 12 deployments were delayed. No data loss occurred.

---

## 2. Impact

| Metric | Value |
|---|---|
| Duration | X hours Y minutes |
| Users affected | N (X% of active users) |
| Deployments blocked | N |
| Data loss | Yes / No |
| Revenue impact | $X / None |

---

## 3. Timeline (UTC)

| Time | Event |
|---|---|
| HH:MM | Alert fired — first symptoms noticed |
| HH:MM | On-call paged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |
| HH:MM | Postmortem created |

---

## 4. Root Cause

Explain the technical root cause in plain language. What actually broke, not just symptoms.

Example: A recent migration added a NOT NULL constraint to `workflow_secrets.encrypted_value` 
without a default, but existing rows had NULL values. On deploy, the constraint check failed, 
preventing the migration from running, leaving the app in a half-upgraded state.

---

## 5. Contributing Factors

- Factor 1
- Factor 2
- Factor 3

---

## 6. What Went Well

- Monitoring alerted quickly (within X minutes)
- Runbook was followed correctly
- Communication was timely and clear
- Mitigation was effective while investigation continued

---

## 7. What Could Be Improved

- More comprehensive monitoring for [specific symptom]
- Runbook missing steps for [scenario]
- Communication could be faster
- Testing didn't catch this scenario

---

## 8. Action Items

| Action | Owner | Due Date | Priority |
|---|---|---|---|
| Add migration rollback guardrail | @user | YYYY-MM-DD | P1 |
| Add monitoring for [metric] | @user | YYYY-MM-DD | P2 |
| Update runbook section | @user | YYYY-MM-DD | P2 |
| Add test coverage for [scenario] | @user | YYYY-MM-DD | P2 |
| Add alerting for [condition] | @user | YYYY-MM-DD | P2 |

---

## 9. Lessons Learned

What did we learn as a team from this incident?

---

## 10. Related Incidents

Link any related past incidents for context.

---

**Status:** Open / Closed
**Next review:** YYYY-MM-DD (30-day check-in)