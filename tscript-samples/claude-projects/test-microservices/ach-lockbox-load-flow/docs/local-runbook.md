# Local Runbook

## Prerequisites
1. Node.js 20 or higher.
2. Docker and Docker Compose.
3. npm available in PATH.

## Bootstrap
1. Install dependencies from project root.
2. Build the workspace.
3. Start infrastructure containers.

Example commands:
- npm install
- npm run build
- docker-compose up -d zookeeper kafka postgres redis

## Start Services
Start gateway and active vertical slice services first:
1. api-gateway
2. load-service
3. invoice-service
4. payment-service
5. reconciliation-service

If running from separate terminals, use workspace scripts for each package start command.

## Health Verification
1. Gateway health: GET /health on port 3000.
2. Core service health endpoints on ports 3020, 3021, 3023, and 3026.
3. Kafka and Postgres container status from docker-compose ps.

## Metrics Verification
1. Gateway metrics: GET /metrics on port 3000.
2. Service metrics: GET /metrics on each active service port.
3. Confirm request counters increment after smoke requests.

## Smoke Sequence
1. Create a load through gateway route prefix.
2. Submit an invoice for the load.
3. Authorize and initiate payment flows.
4. Create reconciliation match and run.
5. Confirm successful responses and inspect metrics route summaries.

## Shutdown
1. Stop service processes.
2. Stop infra containers with docker-compose down.
3. Optional cleanup with docker-compose down -v if data reset is needed.

## Troubleshooting
1. If Kafka is unavailable, services continue with reduced event publication behavior and warning logs.
2. If auth blocks requests unexpectedly, verify REQUIRE_AUTH and JWT environment values.
3. If gateway returns upstream errors, check target service health and gateway circuit/rate settings.
