# Load Testing

k6-based load tests for OpenCodeHub. These scripts validate performance under various load conditions.

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

## Test Scenarios

| Script                | Purpose        | Users    | Target      |
| --------------------- | -------------- | -------- | ----------- |
| `k6-smoke.js`         | Sanity check   | 5        | P95 < 500ms |
| `k6-load.js`          | Sustained load | 100      | P99 < 1s    |
| `k6-stress.js`        | Beyond limits  | 500      | P99 < 3s    |
| `k6-spike.js`         | Sudden burst   | 10 → 500 | P95 < 3s    |
| `k6-api-lifecycle.js` | API flows      | 50       | P99 < 1s    |

## Running

```bash
# Start the app first
npm run build && npm run preview

# Smoke test (quick)
k6 run tests/load/k6-smoke.js

# Load test (100 users, 11 minutes)
k6 run tests/load/k6-load.js

# Stress test (500 users, 16 minutes)
k6 run tests/load/k6-stress.js

# Spike test (burst to 500)
k6 run tests/load/k6-spike.js

# API lifecycle (authenticated)
k6 run tests/load/k6-api-lifecycle.js --env AUTH_TOKEN=your_token

# Custom base URL
k6 run tests/load/k6-load.js --env BASE_URL=https://staging.example.com
```

## Dashboard Output

Export to InfluxDB/Grafana for visual dashboards:

```bash
k6 run --out influxdb=http://localhost:8086/k6 tests/load/k6-load.js
```

## Thresholds

Tests will **fail** if thresholds are not met:

- **Smoke**: P95 < 500ms, <1% error rate
- **Load**: P99 < 1s, <5% error rate
- **Stress**: P99 < 3s, <10% error rate, <50 5xx errors
- **Spike**: P95 < 3s, <15% error rate during spike
- **API**: P99 < 1s, <5% error rate
