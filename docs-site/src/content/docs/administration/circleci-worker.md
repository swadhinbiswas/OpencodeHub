---
title: "Run Workers on CircleCI"
description: "Run OpenCodeHub background workers using CircleCI instead of GitHub Actions"
---

> **Goal:** Run OpenCodeHub background workers using CircleCI instead of GitHub Actions.

OpenCodeHub's worker (`scripts/worker.ts`) is a **long-running background process** that continuously processes:
- Merge queue items
- Mirror sync jobs
- Cleanup tasks
- Webhook deliveries

Since CircleCI is primarily a CI/CD platform (not a background process host), there are **three approaches** to run the worker on CircleCI infrastructure.

---

## Approach 1: Self-Hosted CircleCI Runner (Recommended)

Use CircleCI's [self-hosted runner](https://circleci.com/docs/runner-overview/) on your own VPS. The runner stays online and executes the worker process continuously.

### Why This Works Best
- The runner is a persistent agent on your server
- Can run long-lived processes like the OpenCodeHub worker
- You control the machine (RAM, disk, Docker access)
- Can also run CI/CD jobs for repositories

### Step 1: Install CircleCI Runner on Your VPS

```bash
# Download and install the runner
curl -sSL https://runner.circleci.com/install.sh | bash

# Configure the runner
sudo mkdir -p /var/lib/circleci-runner
cat > /var/lib/circleci-runner/launch-agent-config.yaml << 'EOF'
api:
  auth_token: "${CIRCLECI_RUNNER_TOKEN}"
runner:
  name: opencodehub-worker-1
  working_directory: /var/lib/circleci-runner/workdir
  cleanup_working_directory: true
EOF

# Start the runner service
sudo circleci-runner service install
sudo circleci-runner service start
```

### Step 2: Create `.circleci/config.yml` in OpenCodeHub Repo

```yaml
version: 2.1

executors:
  och-worker:
    machine:
      image: ubuntu-2204:current
    resource_class: your-namespace/opencodehub-runner  # Your self-hosted runner

jobs:
  # ──────────────────────────────────────────────
  # Job 1: Run Background Worker (Continuous)
  # ──────────────────────────────────────────────
  worker:
    executor: och-worker
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      WORKER_INTERVAL: 5000
      WORKER_HEALTH_PORT: 9090
    steps:
      - checkout

      - run:
          name: Install Bun
          command: |
            curl -fsSL https://bun.sh/install | bash
            echo 'export PATH="$HOME/.bun/bin:$PATH"' >> $BASH_ENV
            source $BASH_ENV

      - run:
          name: Install dependencies
          command: |
            for i in 1 2 3; do
              bun install --frozen-lockfile && break
              echo "Attempt $i failed, retrying..."
              sleep 10
            done

      - run:
          name: Start OpenCodeHub Worker
          command: |
            echo "Starting OpenCodeHub background worker..."
            bun run scripts/worker.ts &
            WORKER_PID=$!
            echo "Worker PID: $WORKER_PID"
            
            # Wait for health check to pass
            for i in $(seq 1 30); do
              if curl -sf http://localhost:9090/health; then
                echo "✅ Worker is healthy"
                break
              fi
              echo "Waiting for worker to start... ($i/30)"
              sleep 2
            done
            
            # Keep the job alive (CircleCI will show it as "Running")
            echo "Worker running. Press Ctrl+C to stop."
            wait $WORKER_PID
          no_output_timeout: 24h  # Keep worker running for up to 24 hours

      - run:
          name: Worker crashed - restart logic
          command: |
            echo "Worker exited. Checking logs..."
            # CircleCI will automatically retry based on job settings
          when: on_fail

  # ──────────────────────────────────────────────
  # Job 2: Run Worker Tasks On-Demand
  # ──────────────────────────────────────────────
  worker-tasks:
    executor: och-worker
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    steps:
      - checkout

      - run:
          name: Install Bun
          command: |
            curl -fsSL https://bun.sh/install | bash
            echo 'export PATH="$HOME/.bun/bin:$PATH"' >> $BASH_ENV
            source $BASH_ENV

      - run:
          name: Install dependencies
          command: |
            for i in 1 2 3; do
              bun install --frozen-lockfile && break
              echo "Attempt $i failed, retrying..."
              sleep 10
            done

      - run:
          name: Run Merge Queue Processor
          command: |
            echo "Processing merge queues..."
            bun run scripts/worker.ts --once  # If you add a --once flag
            # OR run a specific task script
            # bun run scripts/process-merge-queue.ts

      - run:
          name: Run Mirror Sync
          command: |
            echo "Syncing mirrors..."
            # bun run scripts/sync-mirrors.ts

      - run:
          name: Run Cleanup
          command: |
            echo "Running cleanup tasks..."
            # bun run scripts/cleanup-repos.ts

  # ──────────────────────────────────────────────
  # Job 3: Health Check (Scheduled)
  # ──────────────────────────────────────────────
  worker-health-check:
    executor: och-worker
    steps:
      - run:
          name: Check Worker Health
          command: |
            curl -sf http://localhost:9090/health || exit 1
            echo "✅ Worker is healthy"

workflows:
  version: 2

  # Continuous worker (always running)
  worker-continuous:
    jobs:
      - worker:
          filters:
            branches:
              only:
                - main

  # Scheduled tasks (every 5 minutes)
  worker-scheduled:
    triggers:
      - schedule:
          cron: "*/5 * * * *"
          filters:
            branches:
              only:
                - main
    jobs:
      - worker-tasks

  # Health check every hour
  worker-health:
    triggers:
      - schedule:
          cron: "0 * * * *"
          filters:
            branches:
              only:
                - main
    jobs:
      - worker-health-check
```

### Step 3: Set Environment Variables in CircleCI

Go to **Project Settings** → **Environment Variables**:

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://...` | Your PostgreSQL connection string |
| `REDIS_URL` | `redis://...` | Your Redis connection string |
| `JWT_SECRET` | `...` | JWT secret |
| `SESSION_SECRET` | `...` | Session secret |
| `WORKFLOW_SECRET_ENCRYPTION_KEY` | `...` | For CI secrets |
| `CIRCLECI_RUNNER_TOKEN` | `...` | Runner registration token |

---

## Approach 2: CircleCI Scheduled Pipelines (No Self-Hosted Runner)

If you don't want to manage a self-hosted runner, use CircleCI's [scheduled pipelines](https://circleci.com/docs/scheduled-pipelines/) to run the worker periodically.

### Limitations
- Jobs have a maximum runtime (5 hours on free plan, longer on paid)
- Worker will restart every 5 hours
- Not truly "continuous" but works for light workloads

### `.circleci/config.yml`

```yaml
version: 2.1

executors:
  bun-executor:
    docker:
      - image: oven/bun:1
    resource_class: medium

jobs:
  merge-queue-worker:
    executor: bun-executor
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      WORKER_INTERVAL: 5000
      WORKER_STALE_TIMEOUT: 300000
    steps:
      - checkout

      - run:
          name: Install dependencies
          command: |
            for i in 1 2 3; do
              bun install --frozen-lockfile && break
              echo "Attempt $i failed, retrying..."
              sleep 10
            done

      - run:
          name: Run Merge Queue Worker
          command: |
            echo "Starting worker for 4.5 hours..."
            timeout 16200 bun run scripts/worker.ts || true
            echo "Worker cycle complete. Will restart on next schedule."
          no_output_timeout: 4.5h

  mirror-sync:
    executor: bun-executor
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
    steps:
      - checkout

      - run:
          name: Install dependencies
          command: bun install --frozen-lockfile

      - run:
          name: Sync Mirrors
          command: bun run scripts/worker.ts --task=mirror-sync

  cleanup:
    executor: bun-executor
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
    steps:
      - checkout

      - run:
          name: Install dependencies
          command: bun install --frozen-lockfile

      - run:
          name: Run Cleanup
          command: bun run scripts/worker.ts --task=cleanup

workflows:
  # Run merge queue worker every 5 hours
  merge-queue-schedule:
    triggers:
      - schedule:
          cron: "0 */5 * * *"
          filters:
            branches:
              only: main
    jobs:
      - merge-queue-worker

  # Run mirror sync every hour
  mirror-sync-schedule:
    triggers:
      - schedule:
          cron: "0 * * * *"
          filters:
            branches:
              only: main
    jobs:
      - mirror-sync

  # Run cleanup daily at 3 AM
  cleanup-schedule:
    triggers:
      - schedule:
          cron: "0 3 * * *"
          filters:
            branches:
              only: main
    jobs:
      - cleanup
```

---

## Approach 3: CircleCI Webhook-Triggered Worker

Trigger the worker via API/webhook when specific events happen (push, PR created, merge queue updated).

### API Triggered Workflow

```yaml
version: 2.1

executors:
  bun-executor:
    docker:
      - image: oven/bun:1

parameters:
  event_type:
    type: string
    default: "merge-queue"
  repo_id:
    type: string
    default: ""
  pr_id:
    type: string
    default: ""

jobs:
  process-event:
    executor: bun-executor
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    steps:
      - checkout

      - run:
          name: Install dependencies
          command: bun install --frozen-lockfile

      - run:
          name: Process Event
          command: |
            echo "Processing event: << pipeline.parameters.event_type >>"
            case "<< pipeline.parameters.event_type >>" in
              merge-queue)
                bun run scripts/worker.ts --task=merge-queue --repo-id=<< pipeline.parameters.repo_id >>
                ;;
              mirror-sync)
                bun run scripts/worker.ts --task=mirror-sync
                ;;
              cleanup)
                bun run scripts/worker.ts --task=cleanup
                ;;
              *)
                echo "Unknown event type"
                exit 1
                ;;
            esac

workflows:
  event-driven-worker:
    when:
      equal: [ webhook, << pipeline.trigger_source >> ]
    jobs:
      - process-event
```

### Trigger via API from OpenCodeHub

In your OpenCodeHub webhook handler, trigger CircleCI:

```typescript
// When merge queue is updated
transportToCircleCI({
  event_type: "merge-queue",
  repo_id: repository.id,
  pr_id: pullRequest.id,
});

async function transportToCircleCI(params: { event_type: string; repo_id: string; pr_id?: string }) {
  const response = await fetch(
    `https://circleci.com/api/v2/project/gh/${org}/${repo}/pipeline`,
    {
      method: "POST",
      headers: {
        "Circle-Token": process.env.CIRCLECI_API_TOKEN!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: "main",
        parameters: params,
      }),
    }
  );
  return response.json();
}
```

---

## Approach Comparison

| Feature | Self-Hosted Runner | Scheduled Pipelines | Webhook-Triggered |
|---------|-------------------|---------------------|-------------------|
| **Continuous?** | ✅ Yes | ⚠️ Every 5 hours | ✅ Event-driven |
| **Setup Complexity** | Medium (VPS needed) | Low | Medium |
| **Cost** | VPS cost only | CircleCI compute minutes | CircleCI compute minutes |
| **Best For** | Production workloads | Light workloads | Event-specific tasks |
| **Docker Support** | ✅ Full | ✅ Yes | ✅ Yes |
| **Persistence** | ✅ Local disk | ❌ Ephemeral | ❌ Ephemeral |

---

## Recommended Setup for Production

### Architecture

```
VPS (e.g., Hetzner/DigitalOcean)
├── OpenCodeHub Main App (port 4321)
├── PostgreSQL (port 5432)
├── Redis (port 6379)
└── CircleCI Self-Hosted Runner
    └── Runs: bun run scripts/worker.ts
```

### Why Self-Hosted Runner Wins
1. **Persistence** — Runner stays on your VPS, has access to local git repos
2. **Network** — Can reach PostgreSQL/Redis on `localhost`
3. **Cost** — No CircleCI compute minutes used
4. **Control** — You manage the machine

### Quick Start Script

```bash
#!/bin/bash
# setup-circleci-worker.sh

# 1. Install CircleCI runner
curl -sSL https://runner.circleci.com/install.sh | bash

# 2. Create runner config
mkdir -p /var/lib/circleci-runner
cat > /var/lib/circleci-runner/launch-agent-config.yaml << EOF
api:
  auth_token: "$CIRCLECI_RUNNER_TOKEN"
runner:
  name: "opencodehub-worker-$(hostname)"
  working_directory: /var/lib/circleci-runner/workdir
  cleanup_working_directory: true
EOF

# 3. Install and start service
circleci-runner service install
circleci-runner service start

# 4. Verify
systemctl status circleci-runner
```

---

## Monitoring

### Worker Health Check

```bash
# Check if worker is running
curl http://localhost:9090/health

# Expected output
{
  "status": "healthy",
  "uptime": 86400,
  "lastQueueRun": "2026-05-02T12:00:00.000Z",
  "consecutiveErrors": 0,
  "shuttingDown": false
}
```

### CircleCI Dashboard

Monitor runner status at:
```
https://app.circleci.com/settings/runner
```

### Alerts

Set up alerts in CircleCI when:
- Runner goes offline
- Job fails more than 3 times
- Worker health check returns `unhealthy`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Runner not picking up jobs"** | Check runner token is correct. Verify runner is online in CircleCI dashboard. |
| **"Database connection refused"** | Ensure DATABASE_URL uses correct host. For self-hosted runner on same VPS, use `localhost`. |
| **"Worker exits after 5 hours"** | Scheduled pipeline limit. Use self-hosted runner for continuous operation. |
| **"No output for 10 minutes"** | CircleCI kills idle jobs. The worker logs regularly, but add `no_output_timeout: 24h`. |
| **"Cannot find module"** | Make sure `bun install` ran successfully. Check `node_modules` exists. |
| **"Permission denied on repos"** | Runner user needs read/write access to OpenCodeHub's repo storage directory. |

---

## Next Steps

- [CircleCI Integration Guide](/guides/circleci-integration/) — For CI/CD pipelines
- [Deployment Guide](/administration/deployment/) — Production setup
- [Merge Queue](/features/merge-queue/) — How merge queue works
