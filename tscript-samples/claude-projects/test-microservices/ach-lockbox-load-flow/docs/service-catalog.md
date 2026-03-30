# Service Catalog

## Gateway
| Service | Port | Purpose | Status |
|---|---:|---|---|
| api-gateway | 3000 | HTTP routing, auth and role policy checks, rate limit, circuit controls, timeout, correlation propagation | Active |

## Simulators
| Service | Port | Purpose | Status |
|---|---:|---|---|
| carrier-simulator | 3010 | Simulate carrier interactions for load and invoice flows | Scaffolded |
| factor-simulator | 3011 | Simulate factor-side assignment and advance interactions | Scaffolded |
| broker-simulator | 3012 | Simulate broker approvals and payment actions | Scaffolded |
| bank-simulator | 3013 | Simulate ACH and lockbox interactions | Scaffolded |

## Domain Services
| Service | Port | Purpose | Status |
|---|---:|---|---|
| load-service | 3020 | Load lifecycle endpoints and load-created event publication | Active vertical slice |
| invoice-service | 3021 | Invoice submission, AR linking, invoice events | Active vertical slice |
| factoring-service | 3022 | Factoring lifecycle operations | Scaffolded |
| payment-service | 3023 | Payment authorization/initiation/inbound receipt events | Active vertical slice |
| fuel-service | 3024 | Fuel advance and settlement offset workflows | Scaffolded |
| lockbox-service | 3025 | Lockbox image/payment extraction workflows | Scaffolded |
| reconciliation-service | 3026 | Match and run-completion workflows with reconciliation events | Active vertical slice |

## Financial Infrastructure
| Service | Port | Purpose | Status |
|---|---:|---|---|
| ledger-service | 3030 | Immutable event persistence and snapshot workflows | Scaffolded |
| accounting-service | 3031 | Multi-entity accounting projections and intercompany logic | Scaffolded |

## Shared Libraries
| Package | Purpose |
|---|---|
| @ach-lockbox/event-types | Event envelope, topic constants, consumer group mappings, payload types |
| @ach-lockbox/auth-helpers | JWT decoding/validation and RBAC utility policies |
| @ach-lockbox/validation | Zod schemas and middleware for API validation |
| @ach-lockbox/logger | Structured logging, correlation handling, request metrics collector |
| @ach-lockbox/error-taxonomy | Standardized app error classes, middleware, and retry utilities |
| @ach-lockbox/kafka | Kafka producer-consumer wrappers, DLQ helpers, health checking |

## Runtime Endpoints Baseline
1. Health endpoint: /health on gateway and implemented core services.
2. Metrics endpoint: /metrics on gateway, load-service, invoice-service, payment-service, and reconciliation-service.
3. Gateway route prefixes:
   - /api/load-service
   - /api/invoice-service
   - /api/payment-service
   - /api/reconciliation-service
