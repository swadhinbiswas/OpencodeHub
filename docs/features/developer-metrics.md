# Developer Metrics

> Track velocity, review efficiency, and team performance

OpenCodeHub includes built-in developer metrics that help teams understand their engineering performance without needing external tools.

---

## Overview

### What Gets Measured

- **Cycle Time** — Time from first commit to merge
- **Throughput** — PRs merged per week
- **Review Time** — Time from PR open to first review
- **Review Load** — How many reviews each team member handles
- **Code Churn** — Lines added/deleted over time
- **Merge Queue Efficiency** — Queue wait times and batch success rates

---

## Dashboard

Access metrics at:
- **Repository** → Insights → Metrics
- **Organization** → Insights (aggregated across repos)
- **Personal** → Profile → Contributions

### Key Charts

| Chart | Description |
|-------|-------------|
| Cycle Time Trend | Average days from commit to merge over time |
| PR Velocity | PRs opened vs merged per week |
| Review Heatmap | Who reviews whom |
| Code Frequency | Commits per day/week |
| Queue Health | Merge queue wait times and success rates |

---

## Metric Definitions

### Cycle Time

```
Cycle Time = (PR merged_at) - (First commit timestamp)
```

**Benchmarks:**
- < 1 day: Excellent
- 1-3 days: Good
- 3-7 days: Fair
- > 7 days: Needs attention

### Review Turnaround

```
Review Time = (First review comment) - (PR opened_at)
```

**Benchmarks:**
- < 4 hours: Excellent
- 4-24 hours: Good
- 1-3 days: Fair
- > 3 days: Needs attention

### Review Load Balance

Shows whether review work is evenly distributed:

```
Review Load = Number of reviews given per person per week
```

Imbalanced load (>2x difference between team members) indicates:
- Knowledge silos
- Bottlenecks
- Burnout risk

---

## Using Metrics for Improvement

### Identify Bottlenecks

High cycle time + high review time = Review bottleneck
- Solution: Require faster reviews, add reviewers

High cycle time + low review time = CI/test bottleneck
- Solution: Optimize pipeline, parallelize tests

### Track Goals

Set team goals and track progress:

```
Goal: Reduce average cycle time from 5 days to 2 days
Goal: Achieve < 24h review turnaround for 90% of PRs
Goal: Keep review load within 20% across team members
```

### Sprint Retrospectives

Use metrics in retrospectives:
1. Review cycle time trends
2. Identify PRs that took unusually long
3. Discuss blockers and process improvements

---

## CLI Access

```bash
# View personal metrics
och metrics --me

# View team metrics
och metrics --team

# View repository metrics
och metrics --repo owner/repo

# Export to CSV
och metrics --repo owner/repo --format csv --output metrics.csv
```

---

## API Access

```bash
# Get repository metrics
curl https://git.yourcompany.com/api/repos/owner/repo/metrics \
  -H "Authorization: Bearer $TOKEN"

# Get user metrics
curl https://git.yourcompany.com/api/users/username/metrics \
  -H "Authorization: Bearer $TOKEN"

# Get organization metrics
curl https://git.yourcompany.com/api/orgs/org-name/metrics \
  -H "Authorization: Bearer $TOKEN"
```

---

## Privacy

- Personal metrics are visible to the user and organization admins
- Repository metrics are visible to repo members
- Raw data is never shared externally
- AI models do not train on metrics data

---

## See Also

- [Stacked Pull Requests](stacked-prs.md)
- [Smart Merge Queue](merge-queue.md)
- [Team Workflows](../guides/team-workflows.md)
