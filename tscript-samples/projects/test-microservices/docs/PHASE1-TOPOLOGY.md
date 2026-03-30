# Phase 1: Topology and Architecture Setup

## System Overview

A 14-service microservices platform for ACH Lockbox payment reconciliation, event-sourced ledger, and multi-entity accounting. All participants from Section 1 of the service specification are implemented as separate deployable services.

### Participant-to-Service Mapping

#### Actor Simulators (External Systems)
Lightweight services that simulate external actors and drive realistic end-to-end workflows.

| Participant | Service Name | Port | Repository | Role |
|------------|-------------|------|------------|------|
| C (Carrier) | carrier-simulator | 3010 | services/carrier-simulator | Submits loads, invoices, assigns factoring |
| F (Factor) | factor-simulator | 3011 | services/factor-simulator | Receives assignments, issues advances, settles |
| B (Broker) | broker-simulator | 3012 | services/broker-simulator | Approves settlements, receives/sends payments |
| Bank | bank-simulator | 3013 | services/bank-simulator | Simulates ACH/EFT settlement, lockbox files |

#### Core Domain Services (Full Implementation)
Operational and financial services that process events, enforce business rules, and maintain state.

| Participant | Service Name | Port | Repository | Domain |
|------------|-------------|------|------------|--------|
| Ld (Load Service) | load-service | 3020 | services/load-service | Load Management |
| Inv (Invoice Service) | invoice-service | 3021 | services/invoice-service | Receivables (AR) |
| Fac (Factoring Service) | factoring-service | 3022 | services/factoring-service | Factoring |
| Pay (Payment Orchestration) | payment-service | 3023 | services/payment-service | Payables (AP) |
| Fuel (Fuel Card Service) | fuel-service | 3024 | services/fuel-service | Fuel Advances |
| Lock (Lockbox Ingestion) | lockbox-service | 3025 | services/lockbox-service | Lockbox & Inbound |
| Recon (Reconciliation Engine) | reconciliation-service | 3026 | services/reconciliation-service | Reconciliation & ML |

#### Financial Infrastructure Services
Authority services for event persistence and multi-entity accounting.

| Participant | Service Name | Port | Repository | Domain |
|------------|-------------|------|------------|--------|
| Led (Event-Sourced Ledger) | ledger-service | 3030 | services/ledger-service | Event Store & Persistence |
| Ent (Entity Accounting) | accounting-service | 3031 | services/accounting-service | Multi-Entity Accounting |

#### API Gateway
Entry point for all external client requests.

| Service Name | Port | Repository | Role |
|------------|------|------------|------|
| api-gateway | 3000 | services/api-gateway | REST request routing, auth enforcement, correlation ID injection |

### Shared Packages

All shared packages live under `shared/` and are included in the monorepo workspaces.

| Package Name | Location | Purpose |
|------------|----------|---------|
| event-types | shared/event-types | Event envelope, versioning, schema definitions for all 17+ events |
| auth-helpers | shared/auth-helpers | JWT middleware, RBAC policy enforcement, token validation |
| validation | shared/validation | Input schema validation (Zod-based), DTO definitions |
| logger | shared/logger | Structured JSON logging, correlation ID injection, log levels |
| error-taxonomy | shared/error-taxonomy | Standard error types, HTTP status mapping, error context enrichment |

### Infrastructure Services

Deployed via Docker Compose, available to all services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| PostgreSQL | postgres:16 | 5432 | Event store, read model projections, domain state |
| Kafka | confluentinc/cp-kafka:7.6.0 | 9092 | Event bus, async messaging, choreography |
| Zookeeper | confluentinc/cp-zookeeper:7.6.0 | 2181 | Kafka coordination |
| Jaeger | jaegertracing/all-in-one | 6831/16686 | Distributed tracing, trace UI |
| Redis | redis:7-alpine | 6379 | Read model caching, idempotency keys |

---

## Kafka Topic Topology

All topics follow the convention: `{domain}.{aggregate}.{event-type}` or `{domain}.{descriptor}`

### Load Management Domain
- `load.created` - LoadCreated event
- `load.created.dlq` - Dead-letter topic for load.created

### Receivables (AR) Domain
- `invoice.submitted` - InvoiceSubmitted event
- `invoice.submitted.dlq` - Dead-letter topic
- `factoring.assignment` - FactoringAssignment event
- `factoring.assignment.dlq` - Dead-letter topic
- `factoring.advance` - FactoringAdvancePaid event
- `factoring.advance.dlq` - Dead-letter topic
- `factoring.settlement` - FactoringSettlementCompleted event
- `factoring.settlement.dlq` - Dead-letter topic

### Payables (AP) Domain
- `payment.authorized` - PaymentAuthorized event
- `payment.authorized.dlq` - Dead-letter topic
- `payment.initiated` - PaymentInitiated event
- `payment.initiated.dlq` - Dead-letter topic
- `payment.settled` - PaymentSettled event (outbound ACH confirmation)
- `payment.settled.dlq` - Dead-letter topic
- `payment.received` - PaymentReceived event (inbound ACH/checks)
- `payment.received.dlq` - Dead-letter topic

### Fuel Advances Domain
- `fuel.advance.issued` - FuelCardAdvanceIssued event
- `fuel.advance.issued.dlq` - Dead-letter topic
- `fuel.charge.settled` - FuelCardChargeSettled event (offset during settlement)
- `fuel.charge.settled.dlq` - Dead-letter topic

### Lockbox & Inbound Domain
- `lockbox.file.received` - LockboxFileReceived event
- `lockbox.file.received.dlq` - Dead-letter topic
- `lockbox.payment.extracted` - LockboxPaymentExtracted event (OCR results)
- `lockbox.payment.extracted.dlq` - Dead-letter topic

### Reconciliation & Matching Domain
- `reconciliation.payment.matched` - PaymentMatched event
- `reconciliation.payment.matched.dlq` - Dead-letter topic
- `reconciliation.unapplied.cash` - UnappliedCashCreated event (low confidence)
- `reconciliation.unapplied.cash.dlq` - Dead-letter topic
- `reconciliation.manual.adjustment` - ManualAdjustmentCreated event
- `reconciliation.manual.adjustment.dlq` - Dead-letter topic
- `reconciliation.completed` - ReconciliationCompleted event
- `reconciliation.completed.dlq` - Dead-letter topic

### Financial Ledger Domain
- `ledger.events.committed` - All committed events (used for projection replay)
- `ledger.events.committed.dlq` - Dead-letter for ledger events
- `ledger.intercompany` - IntercompanySettlement event
- `ledger.intercompany.dlq` - Dead-letter topic

### Internal Infrastructure
- `internal.correlation` - Span context and correlation ID propagation (optional, for tracing)

---

## Consumer Group Strategy

Each service subscribes to topics relevant to its domain via dedicated consumer groups:

| Service | Consumer Group | Topics | Purpose |
|---------|----------------|--------|---------|
| ledger-service | ledger-events | All `*.created`, `*.submitted`, `*.issued`, etc. | Append all events to immutable event store |
| accounting-service | accounting-projections | ledger.events.committed, ledger.intercompany | Build read models and GL projections |
| reconciliation-service | reconciliation-matchers | payment.received, lockbox.payment.extracted, invoice.submitted, factoring.* | Perform payment matching and ML analysis |
| payment-service | payment-handlers | reconciliation.payment.matched, fuel.charge.settled | Execute settlement and fuel offset logic |
| factoring-service | factoring-handlers | factoring.assignment, factoring.advance, reconciliation.payment.matched | Track factoring lifecycle |
| fuel-service | fuel-handlers | fuel.advance.issued, payment.initiated | Track fuel advances and settle offsets |
| load-service, invoice-service, lockbox-service | Service-specific handlers | subscription-based on domain events | Optional: can listen and log for observability |

---

## Environment Variables & Configuration

### Standard Variables (All Services)
```bash
NODE_ENV=development              # dev, staging, production
LOG_LEVEL=debug                   # debug, info, warn, error
KAFKA_BROKER=kafka:29092          # Kafka bootstrap servers
KAFKA_CLIENT_ID=service-name      # Unique client ID per service
DATABASE_URL=postgresql://...     # For event store / read models

# JWT Configuration
JWT_PUBLIC_KEY=base64-encoded-key # RS256 public key for token validation
JWT_ISSUER=ach-lockbox-platform   # Expected token issuer
JWT_AUDIENCE=api                  # Expected audience claim

# Service Discovery
SERVICE_NAME=load-service         # Service identifier
API_GATEWAY_URL=http://api-gateway:3000  # For inter-service calls

# Observability
JAEGER_AGENT_HOST=jaeger          # For OpenTelemetry (Phase 5)
JAEGER_AGENT_PORT=6831            # UDP port for Jaeger
OTEL_ENABLED=false                # Enable/disable tracing (Phase 5)
```

### Service-Specific Variables
Each service may have additional variables (documented in service README):
- Simulators: AUTH_SECRET, SIMULATE_DELAY_MS
- Business services: Domain-specific configuration (e.g., ML_CONFIDENCE_THRESHOLD for reconciliation)
- Ledger: EVENT_RETENTION_DAYS, SNAPSHOT_INTERVAL
- Accounting: GL_ACCOUNT_CHART, CONSOLIDATION_ENTITY_ID

---

## Directory Structure

```
test-microservices/
├── services/
│   ├── api-gateway/           # REST gateway; routes to downstream services
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── carrier-simulator/     # External actor simulation
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── factor-simulator/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── broker-simulator/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── bank-simulator/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── load-service/          # Domain services
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── invoice-service/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── factoring-service/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── payment-service/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── fuel-service/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── lockbox-service/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── reconciliation-service/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── ledger-service/        # Financial infrastructure
│   │   ├── src/
│   │   ├── prisma/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   ├── accounting-service/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│
├── shared/
│   ├── event-types/           # Event envelope, schemas, and versioning
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── envelope.ts
│   │   │   ├── events/
│   │   │   │   ├── load.ts
│   │   │   │   ├── invoice.ts
│   │   │   │   ├── factoring.ts
│   │   │   │   ├── payment.ts
│   │   │   │   ├── fuel.ts
│   │   │   │   ├── lockbox.ts
│   │   │   │   ├── reconciliation.ts
│   │   │   │   └── ledger.ts
│   │   │   └── topics.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── auth-helpers/          # JWT middleware and RBAC
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── jwt.ts
│   │   │   ├── rbac.ts
│   │   │   └── policies.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── validation/            # Input validation and DTOs
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── base-schemas.ts
│   │   │   ├── request-dtos.ts
│   │   │   └── validators.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── logger/                # Structured logging
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── pino-config.ts
│   │   │   ├── middleware.ts
│   │   │   └── context.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── error-taxonomy/        # Standard error types
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── error-types.ts
│   │   │   ├── http-mapping.ts
│   │   │   └── error-context.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│
├── docs/
│   ├── PHASE1-TOPOLOGY.md      # This file
│   ├── PARTICIPANT-MAPPING.md  # Service-to-participant breakdown
│   ├── KAFKA-TOPOLOGY.md       # Topic layout and consumer groups (generated)
│   ├── SECURITY-MODEL.md       # JWT, RBAC, and policies (generated)
│   ├── LOCAL-RUNBOOK.md        # How to start and operate locally (Phase 6)
│   └── ARCHITECTURE.md         # High-level overview and assumptions (Phase 6)
│
├── package.json               # Root monorepo config
├── tsconfig.json              # Shared TypeScript configuration
├── docker-compose.yml         # Local infrastructure and service orchestration
├── .dockerignore               # Docker build context filter
└── .env.example               # Template with all required variables
```

---

## Technology Stack

### Runtime & Language
- **Node.js**: v20 LTS
- **TypeScript**: v5+ (strict mode enforced)
- **Module System**: CommonJS

### Core Libraries
- **Express.js**: REST API framework
- **KafkaJS**: Event streaming and messaging
- **PostgreSQL** (node-postgres or Prisma): Event store, read models
- **Pino**: Structured JSON logging
- **Zod**: Input validation and schema definition
- **JsonWebToken**: JWT token signing and verification
- **OpenTelemetry**: Distributed tracing (Phase 5)

### Development & Build
- **tsc**: TypeScript compiler
- **Jest** or **Mocha**: Unit testing (Phase 5)
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Docker**: Containerization for local and cloud deployment

---

## Getting Started (Local Development)

### Prerequisites
- Docker and Docker Compose v2+
- Node.js v20 LTS
- npm or yarn

### Start Local Environment
```bash
# 1. Install dependencies
yarn install

# 2. Build all services and shared packages
yarn build

# 3. Start infrastructure (Postgres, Kafka, Jaeger, Redis)
docker-compose up -d

# 4. Run migrations (if any)
yarn db:migrate

# 5. Start individual services or all in background
# Option A: Start all services concurrently
yarn start:all

# Option B: Start individual services for debugging
yarn workspace load-service start
yarn workspace api-gateway start
```

### Verify Setup
```bash
# Check Kafka broker status
docker-compose exec kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Check PostgreSQL connection
docker-compose exec postgres psql -U postgres -d appdb -c "SELECT now();"

# Check Jaeger UI
open http://localhost:16686

# Health check API gateway
curl http://localhost:3000/health
```

---

## Next Steps After Phase 1

- **Phase 2**: Implement shared packages (event envelope, auth, validation, logging)
- **Phase 3**: Implement all 14 services with HTTP and Kafka integration
- **Phase 4**: Add API gateway routing, security policies, and reliability controls
- **Phase 5**: Add observability (traces, metrics, structured logs)
- **Phase 6**: Finalize documentation and deliver hardening recommendations

