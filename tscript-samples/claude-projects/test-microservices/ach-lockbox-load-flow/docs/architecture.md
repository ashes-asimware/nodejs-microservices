# Architecture Overview

## Scope
This repository contains an event-driven microservices platform for transportation payment reconciliation across AP, AR, factoring, fuel advances, lockbox ingestion, reconciliation, and ledger-accounting projection workflows.

## Runtime Components
1. API gateway for north-south HTTP traffic and policy enforcement.
2. Domain services for load, invoice, factoring, payment, fuel, lockbox, and reconciliation domains.
3. Infrastructure services for immutable ledger and accounting projections.
4. Actor simulators for carrier, factor, broker, and bank workflows.
5. Shared packages for event contracts, auth, validation, logging, error taxonomy, and Kafka wrappers.

## Integration Patterns
1. REST at service boundaries through the API gateway.
2. Async choreography with Kafka topics for domain events.
3. Event envelope standardization through shared event-types package.
4. Correlation propagation via x-correlation-id headers.
5. In-memory phase baseline implementations for current vertical slices, with persistence-oriented architecture targets documented for later phases.

## Data and Consistency Model
1. Event sourcing is the target system-of-record pattern.
2. Domain services emit immutable events and consumers build projections.
3. Idempotent consumption and DLQ behavior are design requirements for production hardening.
4. Multi-entity settlement is handled by accounting projections and intercompany entries.

## Security Model Summary
1. JWT validation and role checks are centralized at gateway and shared auth helper layer.
2. Route-level role policies gate service access.
3. Correlation IDs and user context headers are forwarded downstream.
4. Auth may be toggled for local smoke testing, but production posture requires strict enablement.

## Reliability Model Summary
1. Gateway includes rate limiting, route-level circuit controls, and upstream timeouts.
2. Services expose health endpoints for readiness and runtime checks.
3. Kafka publishing is guarded with non-fatal fallback behavior in current vertical slices.
4. Additional failure drills and durable state strategies are listed in the recommendations log.

## Observability Model Summary
1. Structured logs via shared logger middleware.
2. Correlation-aware request tracking.
3. Baseline in-memory HTTP metrics collector with per-route latency and status counters.
4. Metrics endpoints available on gateway and currently implemented core services.

## Current Delivery Status
1. Shared platform layer and core vertical slice services are implemented.
2. Gateway security and reliability controls are implemented.
3. Observability baseline is implemented for gateway plus load, invoice, payment, and reconciliation services.
4. Remaining simulator and domain service runtime logic should be expanded to match full topology expectations.
