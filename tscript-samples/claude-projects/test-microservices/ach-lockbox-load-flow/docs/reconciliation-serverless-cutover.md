# Reconciliation Service Serverless Cutover Plan

## Goal

Migrate reconciliation-service from always-on container runtime to a serverless execution model while preserving event integrity, deterministic matching behavior, and existing API compatibility through api-gateway.

## Scope

In scope:

- Reconciliation match creation flow currently exposed by POST /reconciliation/matches
- Reconciliation run execution flow currently exposed by POST /reconciliation/runs
- Event-driven processing for payment.received and lockbox.extracted inputs
- Idempotent event publication for reconciliation.matched and reconciliation.completed

Out of scope:

- Rewriting payment-service or invoice-service logic
- Replacing api-gateway routing model
- Global topic or schema redesign

## Current-to-Target Mapping

Current runtime:

- Containerized HTTP service behind api-gateway
- Synchronous route handlers and shared Kafka publish wrappers

Target runtime:

- Serverless HTTP functions for externally triggered reconciliation commands
- Serverless event functions for Kafka-triggered matching workflows
- Durable state in existing persistence layer (or equivalent durable store) for run progress and idempotency checkpoints

## Function Decomposition

1. http-create-match

- Trigger: HTTP POST /reconciliation/matches
- Responsibility: Validate request, create match command, enqueue or process workflow, return command acceptance
- Output events: reconciliation.matched when completed

1. http-start-run

- Trigger: HTTP POST /reconciliation/runs
- Responsibility: Create reconciliation run, set run status pending or running, dispatch processing
- Output events: reconciliation.completed on successful finalization

1. evt-payment-received

- Trigger: payment.received topic
- Responsibility: Apply matching rules and ML scoring against open items
- Output events: reconciliation.matched or unapplied cash marker event

1. evt-lockbox-extracted

- Trigger: lockbox.extracted topic
- Responsibility: Correlate extracted remittance and check data with invoices and loads
- Output events: reconciliation.matched or exception or unapplied marker

1. run-finalizer

- Trigger: internal queue, timer, or event after work completion criteria
- Responsibility: Finalize run and emit reconciliation.completed exactly once

## API Contract Strategy

Keep gateway-visible API unchanged:

- POST /api/reconciliation-service/reconciliation/matches
- POST /api/reconciliation-service/reconciliation/runs
- GET endpoints remain available via read-model function or thin compatibility service

Response behavior:

- Return 202 Accepted for async operations where completion is event driven
- Include correlationId, commandId, and runId for tracking

## Idempotency and Exactly-Once-Effect Pattern

Use at-least-once delivery with idempotent write guards.

Idempotency keys:

- HTTP commands: hash of caller identity plus business key plus normalized payload
- Kafka events: topic plus partition plus offset as transport key, plus domain key for semantic dedupe

Idempotency store requirements:

- Conditional insert with first writer wins
- State transitions: received to processing to completed or failed
- TTL for short-lived command keys, and no TTL for critical completion markers

Outbox and publish safety:

- Persist result and outbound event intent in one transactional boundary, or transactional outbox equivalent
- Publisher retries remain safe due to eventId dedupe

## Retry, Timeout, and DLQ Policy

HTTP-triggered functions:

- Timeout: short request timeout and enqueue long processing
- Retries: client-driven retry with the same idempotency key

Event-triggered functions:

- Retry with exponential backoff
- Max attempts per event before dead-letter
- Dead-letter payload includes eventId, correlationId, error class, stack or message, and replay hint

Replay model:

- Replay from DLQ requires operator approval and dedupe check against idempotency store

## State and Data Model Updates

Add or confirm durable entities:

- reconciliation_runs
- reconciliation_matches
- idempotency_records
- processing_checkpoints

Required fields:

- correlation_id, causation_id, entity_id
- run_id, match_id, status, attempt_count
- created_at, updated_at, completed_at

## Security Model

Inbound HTTP:

- Keep JWT validation and role checks at api-gateway
- Pass signed user and context claims to functions via trusted headers

Function identity:

- Least-privilege access to storage, message topics, and secret store
- Separate identity for publish versus read or write data operations where supported

Secrets:

- Use managed secret store and rotate keys without code changes

## Observability and SLOs

Emit standardized telemetry from every function:

- request_count, success_count, error_count
- processing_latency_ms at p50, p95, p99
- retry_count, dlq_count
- dedupe_hit_count

Trace propagation:

- Preserve correlationId end-to-end from gateway through event handlers

Initial SLO targets:

- 99 percent command acceptance under 300 ms
- 99 percent event processing under 5 seconds, excluding downstream outages
- Under 0.5 percent DLQ rate per day

## Rollout Plan

Phase A: Shadow mode

- Deploy serverless handlers in parallel with container service
- Mirror selected events and commands to serverless path
- Compare output parity for match decisions and completion counts

Phase B: Readiness gates

- Pass parity threshold, for example 99.5 percent identical decisions
- No unbounded retries
- DLQ rate below agreed threshold for 7 consecutive days

Phase C: Progressive traffic shift

- Route 10 percent of write commands to serverless
- Then 25 percent, 50 percent, and 100 percent with rollback checkpoints at each stage
- Keep instant rollback switch in api-gateway route config

Phase D: Decommission

- Freeze container write path
- Retain read-only compatibility endpoint temporarily
- Remove container from compose or runtime after observation window

## Rollback Plan

Immediate rollback triggers:

- Spike in failed commands or DLQ beyond threshold
- Duplicate completion events
- Material mismatch in financial reconciliation outputs

Rollback actions:

- Set gateway routing weight to container path at 100 percent
- Pause serverless event consumers
- Drain and inspect in-flight queue and DLQ
- Reconcile partial writes using idempotency records and run checkpoints

## Test Plan

1. Contract tests

- Validate unchanged gateway request and response contracts

1. Determinism tests

- Same input set yields same match results as container implementation

1. Failure injection

- Simulate Kafka outage, storage timeout, and partial publish failures

1. Replay tests

- DLQ replay produces no duplicate business effects

1. Load tests

- Burst payment.received and lockbox.extracted events
- Confirm scale-out and bounded latency

## Required Implementation Tasks

1. Add idempotency middleware and helpers for reconciliation commands and event handlers
1. Add durable run checkpoint model and completion guard
1. Add transactional outbox or equivalent safe publish mechanism
1. Add serverless handler adapters for HTTP and Kafka triggers
1. Add dual-run comparator tooling for shadow phase
1. Add traffic-splitting toggle in api-gateway route config
1. Add dashboards and alerts for retries, DLQ, dedupe hits, and completion lag

## Cutover Exit Criteria

- Functional parity verified against baseline container behavior
- No unresolved high-severity incidents during staged rollout
- SLOs met for 2 consecutive weeks at 100 percent traffic
- Runbook and on-call procedures validated in game-day simulation
