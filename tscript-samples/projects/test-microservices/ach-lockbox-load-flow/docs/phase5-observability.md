# Phase 5 Observability Baseline

Phase 5 introduces service-level metrics visibility while preserving the existing structured logging and correlation-id flow.

## Implemented Scope

1. Added a reusable in-memory HTTP metrics collector in `@ach-lockbox/logger`.
2. Added automatic request metrics middleware for:
   - api-gateway
   - load-service
   - invoice-service
   - payment-service
   - reconciliation-service
3. Added `/metrics` endpoint to each service listed above.
4. Added route-level response status counts and latency metrics (average and max).
5. Added domain-state counters in service metrics payloads (for quick operational inspection).

## Metrics Response Shape

Each `/metrics` endpoint returns:

1. serviceName
2. startedAt
3. totalRequests
4. totalErrors
5. averageLatencyMs
6. routes[] with per-method and per-route totals, error counts, status distribution, and latency summaries
7. service-specific state block:
   - `gatewayState` for api-gateway
   - `domainState` for domain services

## Notes

1. Metrics are in-memory and reset when a process restarts.
2. `/health` remains the liveness endpoint; `/metrics` is for runtime behavior inspection.
3. Cardinality is controlled with lightweight path normalization (UUID and numeric segments become `:id`).
4. This baseline is suitable for local development and integration smoke tests.

## Suggested Next Step

1. Add a Prometheus exposition format endpoint (or OpenTelemetry exporter) and scrape configuration in Docker Compose for persistent metrics monitoring.
