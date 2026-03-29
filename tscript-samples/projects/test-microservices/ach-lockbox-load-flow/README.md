# ACH Lockbox Load Flow Microservices

A comprehensive Node.js TypeScript microservices system for ACH lockbox payment reconciliation, built with event-driven architecture, Kafka messaging, and PostgreSQL event sourcing.

## Project Overview

This project implements a complete payment reconciliation platform with the following characteristics:

- **14 Microservices**: 4 simulators, 7 domain services, 2 financial infrastructure services, and 1 API gateway
- **5 Shared Libraries**: Event types, authentication, validation, logging, and error taxonomy
- **Event-Driven Architecture**: Kafka-based event streaming with 19 topics (+ DLQs)
- **Event Sourcing**: PostgreSQL event store with append-only logging
- **RBAC Security**: JWT RS256 authentication with role-based access control
- **Observability**: Structured JSON logging, correlation IDs, and in-memory request metrics
- **Local Development**: Docker Compose orchestration with all services + infrastructure

## Phase 3 Status

Phase 3 is active with a working vertical slice:

- load-service endpoints are implemented with in-memory state and event publication hooks
- invoice-service endpoints are implemented with AR-linking and event publication hooks
- payment-service endpoints are implemented for authorization, initiation, and inbound receipt
- reconciliation-service endpoints are implemented for match creation and run completion
- api-gateway is implemented and proxies core service routes

See docs/phase3-kickoff.md for the current endpoint inventory.

## Phase 5 Status

Phase 5 has started with baseline observability instrumentation:

- shared logger now includes an in-memory HTTP metrics collector
- api-gateway exposes `/metrics` for aggregated request/error/latency visibility
- load-service exposes `/metrics` with service request stats and domain counters
- invoice-service exposes `/metrics` with service request stats and domain counters
- payment-service exposes `/metrics` with service request stats and domain counters
- reconciliation-service exposes `/metrics` with service request stats and domain counters

See docs/phase5-observability.md for implementation details.

## Phase 6 Status

Phase 6 documentation delivery has been started with a full operational and architecture set:

- docs/architecture.md
- docs/service-catalog.md
- docs/event-catalog.md
- docs/topic-matrix.md
- docs/local-runbook.md
- docs/security-model.md
- docs/failure-recovery-playbook.md
- docs/production-hardening-recommendations.md

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js 20 LTS, TypeScript 5.3+ | Latest |
| **Message Bus** | Kafka + Zookeeper | 7.6.0 |
| **Database** | PostgreSQL | 16 |
| **Cache** | Redis | 7 Alpine |
| **API Framework** | Express.js | 4.18.2 |
| **Authentication** | JWT RS256 + Custom Middleware | Built-in |
| **Validation** | Zod | 3.22.4 |
| **Logging** | Pino + Pino-HTTP | 8.17.1 |
| **Containerization** | Docker Multi-Stage Builds | Alpine |
| **Orchestration** | Docker Compose | v3.8 |

## Project Structure

```
ach-lockbox-load-flow/
├── services/                      # 14 microservices
│   ├── api-gateway/              # HTTP routing, auth enforcement
│   ├── carrier-simulator/         # Load submission simulator
│   ├── factor-simulator/          # Factoring assignment simulator
│   ├── broker-simulator/          # Payment approval simulator
│   ├── bank-simulator/            # ACH/EFT settlement simulator
│   ├── load-service/              # Load CRUD and metadata
│   ├── invoice-service/           # Invoice submission and AR linkage
│   ├── factoring-service/         # Factoring assignments and advances
│   ├── payment-service/           # AP authorization and ACH initiation
│   ├── fuel-service/              # Fuel card advances and tracking
│   ├── lockbox-service/           # Check image ingestion and OCR
│   ├── reconciliation-service/    # ML-assisted payment matching
│   ├── ledger-service/            # Event-sourced immutable store
│   └── accounting-service/        # Multi-entity GL projections
├── shared/                        # 5 reusable libraries
│   ├── event-types/              # Event envelope, Kafka topics, consumer groups
│   ├── auth-helpers/             # JWT validation, RBAC policies
│   ├── validation/               # Zod schemas, request DTOs
│   ├── logger/                   # Structured logging, correlation IDs
│   └── error-taxonomy/           # Standard error types with HTTP status mapping
├── docs/
│   ├── service-specification.md                  # Original specification (Section 1: 13 participants)
│   ├── sequence-diagram.md                       # Original workflow diagrams
│   ├── PHASE1-TOPOLOGY.md                        # Phase 1 topology, Kafka layout, consumer groups
│   ├── architecture.md                           # System architecture and current implementation posture
│   ├── service-catalog.md                        # Service inventory and current runtime status
│   ├── event-catalog.md                          # Event definitions and topic mapping summary
│   ├── topic-matrix.md                           # Topic-to-consumer-group matrix
│   ├── local-runbook.md                          # Local setup, run, smoke, and troubleshooting steps
│   ├── security-model.md                         # JWT/RBAC and gateway security controls
│   ├── failure-recovery-playbook.md              # Incident response and recovery procedures
│   └── production-hardening-recommendations.md   # Production readiness backlog
├── package.json                  # Root monorepo config with 19 workspaces
├── tsconfig.json                 # Shared strict-mode TypeScript config
├── docker-compose.yml            # Local orchestration (20 containers)
├── .env.example                  # Global environment template
├── .gitignore                    # Git exclusions
├── Dockerfile                    # (Not needed; per-service Dockerfiles included)
└── README.md                     # This file
```

## Service Overview

### Simulators (External Actors)

| Service | Port | Purpose |
|---------|------|---------|
| carrier-simulator | 3010 | Submits loads, invoices, assigns factoring |
| factor-simulator | 3011 | Receives assignments, issues cash advances |
| broker-simulator | 3012 | Approves payments, processes settlements |
| bank-simulator | 3013 | Simulates ACH/EFT settlement, lockbox files |

### Domain Services (Core Workflows)

| Service | Port | Purpose |
|---------|------|---------|
| load-service | 3020 | Load CRUD, BO/POD document storage, metadata |
| invoice-service | 3021 | Invoice submission, AR linkage, invoice status |
| factoring-service | 3022 | Factoring assignments, advance issuance, settlements |
| payment-service | 3023 | AP authorization, ACH/EFT initiation, settlement status |
| fuel-service | 3024 | Fuel card advances, charge tracking, offset reconciliation |
| lockbox-service | 3025 | Check image ingestion, OCR extraction, AR matching |
| reconciliation-service | 3026 | ML-assisted payment matching, exception handling |

### Financial Infrastructure

| Service | Port | Purpose |
|---------|------|---------|
| ledger-service | 3030 | Event-sourced immutable event store, snapshots |
| accounting-service | 3031 | Multi-entity GL projections, intercompany settlements |

### API Gateway

| Service | Port | Purpose |
|---------|------|---------|
| api-gateway | 3000 | REST request routing, JWT enforcement, correlation ID injection |

## Kafka Topology

### Event Topics (19 Total, with DLQs)

Events are organized by domain with the format: `{domain}.{verb}` (e.g., `load.created`, `payment.initiated`)

**Load Domain:**

- `load.created` → Load submitted by carrier
- `load.dlq` → Dead-letter queue for load events

**Invoice Domain:**

- `invoice.submitted` → Invoice registered
- `invoice.dlq`

**Factoring Domain:**

- `factoring.assigned` → Factoring assignment created
- `factoring.advanced` → Cash advance issued
- `factoring.settled` → Settlement completed
- `factoring.dlq`

**Payment Domain:**

- `payment.authorized` → AP payment approved
- `payment.initiated` → ACH/EFT initiated
- `payment.settled` → Settlement completed
- `payment.received` → Lockbox cash received
- `payment.dlq`

**Fuel Domain:**

- `fuel.advanced` → Fuel card advance issued
- `fuel.settled` → Charge offset completed
- `fuel.dlq`

**Lockbox Domain:**

- `lockbox.received` → Check image ingested
- `lockbox.extracted` → OCR extraction completed
- `lockbox.dlq`

**Reconciliation Domain:**

- `reconciliation.matched` → Payment matched to item
- `reconciliation.completed` → Reconciliation run complete
- `reconciliation.dlq`

**Ledger Domain:**

- `ledger.event-appended` → Event persisted to store
- `ledger.snapshot-created` → Snapshot taken
- `ledger.dlq`

**Accounting Domain:**

- `accounting.posting` → GL entry created
- `accounting.dlq`

### Consumer Groups (8 Total)

- `ledger-events`: Ledger service subscribes to all events for persistence
- `accounting-projections`: Accounting service subscribes to ledger + domain events for GL
- `reconciliation-matchers`: Reconciliation service subscribes to payment + lockbox events
- `payment-handlers`: Payment service subscribes to payment + lockbox events
- `factoring-handlers`: Factoring service subscribes to load + factoring events
- `fuel-handlers`: Fuel service subscribes to fuel domain events
- `invoice-handlers`: Invoice service subscribes to load + invoice events
- `load-handlers`: Load service subscribes to load domain events

## Getting Started

### Prerequisites

- Docker & Docker Compose v3.8+
- Node.js 20 LTS (for local development without Docker)
- Yarn 1.22+ (for monorepo management)
- PostgreSQL 16 (optional, runs in Docker)
- Kafka/Zookeeper (optional, runs in Docker)

### 1. Environment Setup

```bash
cd ach-lockbox-load-flow

# Copy environment template to all services
cp .env.example .env

# Copy per-service env templates if doing local development
for dir in services/*/; do
  cp "$dir/.env.example" "$dir/.env"
done
```

### 2. Docker Compose (Recommended)

```bash
# Start all services and infrastructure
docker-compose up -d

# Verify all services are healthy
docker-compose ps

# View logs for a specific service
docker-compose logs -f api-gateway

# Stop all services
docker-compose down

# Clean up volumes (WARNING: deletes data)
docker-compose down -v
```

### 3. Local Development (Without Docker)
```bash
# Install dependencies for all workspaces
yarn install

# Build all services and shared libraries
yarn build

# Build in watch mode (incremental)
yarn build:watch

# Start infrastructure only (Kafka, PostgreSQL, Redis)
docker-compose up -d zookeeper kafka postgres redis

# Start individual services
yarn workspace @ach-lockbox/api-gateway start
yarn workspace @ach-lockbox/load-service start
# ... (start other services similarly)

# Start all services at once (requires background process management)
yarn start:all
```

### 4. Verify Installation

```bash
# Health checks via API Gateway
curl http://localhost:3000/health

# View Kafka topics
docker exec ach-lockbox-load-flow-kafka-1 kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list

# Connect to PostgreSQL
PGPASSWORD=password psql -h localhost -d ach_lockbox

# Monitor logs
yarn logs
```

### 5. Phase 3 Gateway Smoke Test

```bash
# Gateway health
curl http://localhost:3000/health

# Create load through gateway
curl -X POST http://localhost:3000/api/load-service/loads \
  -H "content-type: application/json" \
  -d '{"carrierId":"11111111-1111-1111-1111-111111111111","shipmentDate":"2026-03-28T00:00:00.000Z","pickupLocation":"Dallas, TX","deliveryLocation":"Phoenix, AZ","weightLbs":20000,"miles":1050,"ratePerMile":2.1}'
```

## Development Workflow

### Adding a New Endpoint

1. Create a route handler in the service's `src/routes/` folder
2. Use shared `createAuthMiddleware()` from `@ach-lockbox/auth-helpers`
3. Validate input with Zod schemas from `@ach-lockbox/validation`
4. Use `@ach-lockbox/logger` for structured logging
5. Publish events to Kafka using `EventEnvelope` from `@ach-lockbox/event-types`

### Publishing Events

```typescript
import { EventEnvelope, TOPICS } from '@ach-lockbox/event-types';
import { kafka } from './kafka-client';

const event: EventEnvelope<{ loadId: string }> = {
  id: 'evt-xyz',
  source: 'carrier-simulator',
  type: 'load.created',
  version: 1,
  payload: { loadId: 'load-123' },
  timestamp: new Date(),
  correlationId: 'corr-abc',
};

const producer = kafka.producer();
await producer.send({
  topic: TOPICS.LOAD_CREATED,
  messages: [{ value: JSON.stringify(event) }],
});
```

### Consuming Events

```typescript
import { TOPICS, CONSUMER_GROUPS } from '@ach-lockbox/event-types';
import { kafka } from './kafka-client';

const consumer = kafka.consumer({ groupId: CONSUMER_GROUPS.LEDGER_EVENTS });
await consumer.subscribe({ topic: TOPICS.LOAD_CREATED });
await consumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value.toString());
    // Process event
  },
});
```

## Testing

```bash
# Run unit tests (all services)
yarn test

# Run tests in watch mode
yarn test:watch

# Generate coverage report
yarn test -- --coverage
```

## Phase 1 Completion Status

### ✅ Completed

- [x] Service-to-participant mapping (14 services + 5 shared packages)
- [x] Directory structure and workspace configuration
- [x] Root `package.json` with Yarn workspaces
- [x] Root `tsconfig.json` with strict mode + composite builds
- [x] Docker Compose orchestration (20 containers: 14 services + 6 infrastructure)
- [x] Per-service `package.json` with correct dependencies
- [x] Per-service `tsconfig.json` with TypeScript compilation config
- [x] Per-service `Dockerfile` with multi-stage Alpine builds
- [x] Per-service `.env.example` templates
- [x] Global `.env.example` template
- [x] Shared package definitions (event-types, auth-helpers, validation, logger, error-taxonomy)
- [x] [PHASE1-TOPOLOGY.md](docs/PHASE1-TOPOLOGY.md) documentation
- [x] `.gitignore` for the entire project

### 🔲 Next (Phase 2: Shared Platform Layer)

- [ ] Expand event-types with full event definitions (LoadCreated, InvoiceSubmitted, etc.)
- [ ] Implement JWT validation middleware with public key loading
- [ ] Implement Zod schema validators for all request DTOs
- [ ] Implement Pino logger factory with correlation ID context
- [ ] Implement error handler middleware with standardized responses
- [ ] Set up Kafka client factories and retry policies

### 🔜 Future (Phases 3-6)

- Phase 3: Implement service logic (simulators, domain services, financial infrastructure)
- Phase 4: Gateway routing, security, retries, DLQ, idempotency, graceful shutdown
- Phase 5: OpenTelemetry tracing, metrics, structured logs, distributed tracing
- Phase 6: Documentation finalization, hardening, production readiness

## Configuration Reference

### Environment Variables

**Global** (`.env`):

- `NODE_ENV`: `development` | `production` | `test`
- `LOG_LEVEL`: `debug` | `info` | `warn` | `error`
- `KAFKA_BROKER`: Kafka bootstrap servers (default: `localhost:9092`)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_PUBLIC_KEY`: Public key for JWT validation
- `JWT_ISSUER`: JWT issuer claim value
- `JWT_AUDIENCE`: JWT audience claim value

**Service-Specific**:

- `SERVICE_NAME`: Service identifier for logging
- `SERVICE_PORT`: HTTP port (see Service Overview above)
- `ML_CONFIDENCE_THRESHOLD`: (reconciliation-service) ML match confidence threshold
- `EVENT_RETENTION_DAYS`: (ledger-service) Event retention policy
- `SNAPSHOT_INTERVAL`: (ledger-service) Event snapshots interval

## Deployment

### Local Docker Compose

```bash
docker-compose up -d
docker-compose logs -f
```

### Production Deployment

For production deployment, refer to Phase 6 hardening recommendations (pending Phase 1 approval).
Currently supports local Docker Compose. Kubernetes/cloud deployments to be scoped in Phase 4+.

## Troubleshooting

### Services won't start

1. Check Docker Compose logs: `docker-compose logs <service-name>`
2. Verify Kafka is running: `docker-compose logs kafka | grep "ready to accept"`
3. Check PostgreSQL is accessible: `PGPASSWORD=password psql -h localhost -d ach_lockbox`
4. Ensure ports aren't already in use (Ctrl+F for "Address already in use")

### Kafka topics not created

```bash
# Manually create missing topics
docker exec ach-lockbox-load-flow-kafka-1 kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --topic load.created --partitions 3 --replication-factor 1
```

### Database connection errors

```bash
# Verify PostgreSQL is up
docker-compose exec postgres pg_isready -h localhost

# Check database exists
docker-compose exec postgres psql -U postgres -l | grep ach_lockbox

# Create database if missing
docker-compose exec postgres psql -U postgres -c \
  "CREATE DATABASE ach_lockbox;"
```

## Contributing

- Follow TypeScript strict mode conventions
- Use shared libraries for cross-cutting concerns
- Publish domain events for choreography
- Include correlation IDs in all logs
- Write unit tests for new logic

## License

Internal use only.

## Documentation

- [Phase 1 Topology](docs/PHASE1-TOPOLOGY.md) - Service mapping, Kafka layout, tech stack
- [Service Specification](docs/service-specification.md) - Original ACH lockbox requirement
- [Sequence Diagrams](docs/sequence-diagram.md) - Workflow diagrams

## Support

Refer to the documentation or the project maintainers for questions.
