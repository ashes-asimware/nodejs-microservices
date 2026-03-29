# Production Hardening Recommendations

## Priority 0
1. Turn on strict JWT enforcement in all non-local environments.
2. Replace in-memory state in active services with durable persistence.
3. Enforce idempotency keys and duplicate-event protection across consumers.

## Priority 1
1. Add contract tests for event payload compatibility by topic.
2. Add integration tests for gateway auth, rate limit, circuit, and timeout behavior.
3. Add end-to-end workflow tests for the 17-step domain scenario.
4. Add DLQ replay tooling and runbook automation.

## Priority 2
1. Introduce OpenTelemetry traces and centralized metrics backend.
2. Add Prometheus-compatible metrics exposition and scrape jobs.
3. Add dashboards and alert thresholds for error rate, latency, and circuit-open events.

## Priority 3
1. Add policy-as-code checks for RBAC route mappings.
2. Add secrets manager integration and key rotation controls.
3. Add environment promotion gates including load and resilience checks.

## Priority 4
1. Scale profile validation for Kafka partitions and consumer group throughput.
2. Backpressure handling for burst lockbox ingestion and reconciliation workloads.
3. Capacity tuning for PostgreSQL and Redis under replay and settlement peaks.

## Tracking Guidance
1. Keep this document as a living backlog.
2. Mark each recommendation with owner, target milestone, and validation evidence.
3. Review after each phase increment and incident postmortem.
