# Phase 2: Shared Platform Layer - USAGE GUIDE

Complete code examples for integrating all 6 shared packages into microservices.

---

## Quick Start: Bootstrap a New Service

Every service follows this basic structure:

```typescript
// src/index.ts
import express from 'express';
import { createLogger, createLogMiddleware, getCorrelationId } from '@ach-lockbox/logger';
import { createAuthMiddleware, RBAC_POLICIES } from '@ach-lockbox/auth-helpers';
import { createValidationMiddleware, parseRequestContext } from '@ach-lockbox/validation';
import { createErrorHandlerMiddleware, asyncHandler } from '@ach-lockbox/error-taxonomy';
import { createKafkaClient, KafkaProducer, KafkaConsumer } from '@ach-lockbox/kafka';
import { TOPICS, CONSUMER_GROUPS } from '@ach-lockbox/event-types';

const PORT = process.env.PORT || 3020;
const SERVICE_NAME = 'load-service';

// Initialize logger
const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

// Initialize Express
const app = express();

// Initialize Kafka
const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});

const producer = new KafkaProducer(kafka, logger);
const consumer = new KafkaConsumer(kafka, logger, {
  groupId: CONSUMER_GROUPS.LEDGER_EVENTS,
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// 1. Logging (first - captures all requests)
app.use(createLogMiddleware({ logger }));

// 2. Body parsing
app.use(express.json());

// 3. Authentication
app.use(createAuthMiddleware({
  publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || 'keys/public.key',
  algorithms: ['RS256'],
}));

// ============================================================================
// ROUTES
// ============================================================================

app.post('/loads', 
  createValidationMiddleware(CreateLoadRequestSchema),
  createRBACMiddleware(RBAC_POLICIES.BROKER_ONLY),
  asyncHandler(async (req, res, next) => {
    const context = parseRequestContext(req);
    const load = await createLoad(req.body, context);
    
    // Publish event
    await producer.publishEvent(TOPICS.LOAD_CREATED, {
      id: load.id,
      correlationId: context.correlationId,
      source: SERVICE_NAME,
      type: TOPICS.LOAD_CREATED,
      version: 1,
      timestamp: new Date(),
      entityId: load.id,
      userId: context.userId,
      payload: load,
    });
    
    res.status(201).json(load);
  })
);

// Error handler (last)
app.use(createErrorHandlerMiddleware(logger));

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function start() {
  try {
    // Connect Kafka
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ 
      topics: [TOPICS.INVOICE_SUBMITTED, TOPICS.FACTORING_ASSIGNMENT] 
    });
    
    // Run consumer in background
    consumer.run(async (payload, event) => {
      logger.info('Received event', { type: event.type });
      // Handle event...
    }).catch(error => {
      logger.error('Consumer error', error);
      process.exit(1);
    });
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`${SERVICE_NAME} running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Startup failed', error as Error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await producer.disconnect();
  await consumer.disconnect();
  process.exit(0);
});
```

---

## 1. Event Types Guide

**Location:** `shared/event-types/src/index.ts`

### Creating Events

```typescript
import { 
  EventEnvelope, 
  TOPICS, 
  LoadCreatedPayload,
  createEventEnvelope 
} from '@ach-lockbox/event-types';

// Method 1: Using factory function
const event = createEventEnvelope<LoadCreatedPayload>(
  TOPICS.LOAD_CREATED,
  {
    carrierId: 'carrier-123',
    shipmentDate: new Date(),
    pickupLocation: 'Chicago, IL',
    destination: 'Los Angeles, CA',
    commodityType: 'Full Truckload',
    weight: 45000,
    rate: 450000,
  },
  {
    correlationId: 'corr-xyz',
    userId: 'user-123',
    entityId: 'load-456',
  }
);

// Method 2: Manual creation (for more control)
const manualEvent: EventEnvelope<LoadCreatedPayload> = {
  id: uuidv4(),
  correlationId: 'corr-xyz',
  source: 'load-service',
  type: TOPICS.LOAD_CREATED,
  version: 1,
  timestamp: new Date(),
  entityId: 'load-456',
  userId: 'user-123',
  payload: {
    carrierId: 'carrier-123',
    // ... payload fields
  },
};
```

### Publishing Events

```typescript
import { KafkaProducer } from '@ach-lockbox/kafka';
import { TOPICS } from '@ach-lockbox/event-types';

const producer = new KafkaProducer(kafka, logger);
await producer.connect();

// Publish single event
const result = await producer.publishEvent(TOPICS.LOAD_CREATED, event);
// result: [{ topic, partition, offset, timestamp }]

// Publish batch
const results = await producer.publishBatch(
  TOPICS.INVOICE_SUBMITTED,
  invoiceEvents,
  (event) => event.payload.loadId // Key extractor
);
```

### Subscribing to Events

```typescript
import { KafkaConsumer } from '@ach-lockbox/kafka';
import { TOPICS, CONSUMER_GROUPS } from '@ach-lockbox/event-types';

const consumer = new KafkaConsumer(kafka, logger, {
  groupId: CONSUMER_GROUPS.RECONCILIATION_MATCHERS,
});

await consumer.connect();
await consumer.subscribe({
  topics: [
    TOPICS.LOAD_CREATED,
    TOPICS.INVOICE_SUBMITTED,
    TOPICS.PAYMENT_RECEIVED,
  ],
});

// Handle messages
await consumer.run(async (payload, event) => {
  const { correlationId, type, payload: data } = event;
  
  logger.info('Processing event', { type, correlationId });
  
  switch (type) {
    case TOPICS.LOAD_CREATED:
      // data is LoadCreatedPayload
      await reconciliationService.addLoad(data);
      break;
      
    case TOPICS.INVOICE_SUBMITTED:
      // data is InvoiceSubmittedPayload
      await reconciliationService.addInvoice(data);
      break;
      
    case TOPICS.PAYMENT_RECEIVED:
      // data is PaymentReceivedPayload
      await reconciliationService.matchPayment(data);
      break;
  }
});
```

### Available Topics

```typescript
import { TOPICS, CONSUMER_GROUPS } from '@ach-lockbox/event-types';

// Publishing topics:
TOPICS.LOAD_CREATED           // load.created
TOPICS.LOAD_ASSIGNED          // load.assigned
TOPICS.LOAD_DELIVERED         // load.delivered
TOPICS.INVOICE_SUBMITTED      // invoice.submitted
TOPICS.INVOICE_LINKED_TO_AR   // invoice.linked_to_ar
TOPICS.FACTORING_ASSIGNMENT   // factoring.assignment
TOPICS.FACTORING_ADVANCE_ISSUED // factoring.advance_issued
TOPICS.FACTORING_SETTLEMENT   // factoring.settlement
TOPICS.PAYMENT_AUTHORIZED     // payment.authorized
TOPICS.PAYMENT_INITIATED      // payment.initiated
TOPICS.PAYMENT_SETTLED        // payment.settled
TOPICS.PAYMENT_RECEIVED       // payment.received
TOPICS.FUEL_CARD_ADVANCE_ISSUED // fuel.card_advance_issued
TOPICS.FUEL_CHARGE_SETTLED    // fuel.charge_settled
TOPICS.LOCKBOX_FILE_RECEIVED  // lockbox.file_received
TOPICS.LOCKBOX_PAYMENT_EXTRACTED // lockbox.payment_extracted
TOPICS.PAYMENT_MATCHED        // reconciliation.payment_matched
TOPICS.RECONCILIATION_COMPLETED // reconciliation.completed
TOPICS.UNMATCHED_PAYMENT_EXCEPTION // reconciliation.unmatched_payment_exception

// Consumer groups:
CONSUMER_GROUPS.LEDGER_EVENTS
CONSUMER_GROUPS.ACCOUNTING_PROJECTIONS
CONSUMER_GROUPS.RECONCILIATION_MATCHERS
CONSUMER_GROUPS.PAYMENT_HANDLERS
CONSUMER_GROUPS.FACTORING_HANDLERS
CONSUMER_GROUPS.FUEL_HANDLERS
CONSUMER_GROUPS.INVOICE_HANDLERS
CONSUMER_GROUPS.LOAD_HANDLERS
```

---

## 2. Authentication & Authorization Guide

**Location:** `shared/auth-helpers/src/index.ts`

### Setup Auth Middleware

```typescript
import { createAuthMiddleware, createRBACMiddleware, RBAC_POLICIES } from '@ach-lockbox/auth-helpers';

const app = express();

// Add JWT validation
app.use(createAuthMiddleware({
  publicKeyPath: 'keys/public.key',
  algorithms: ['RS256'],
  issuer: 'ach-lockbox',
  audience: 'ach-lockbox-api',
}));

// Optional: Add RBAC on specific routes
app.post('/loads', 
  createRBACMiddleware(RBAC_POLICIES.BROKER_ONLY),
  (req, res) => {
    // Only broker admins can create loads
  }
);

app.get('/loads',
  createRBACMiddleware(RBAC_POLICIES.AUTHENTICATED_USERS),
  (req, res) => {
    // Any authenticated user can list loads
  }
);

app.get('/admin/reports',
  createRBACMiddleware(RBAC_POLICIES.ADMIN_ONLY),
  (req, res) => {
    // Only system admins
  }
);
```

### Access Token in Handlers

```typescript
import { AuthenticatedRequest } from '@ach-lockbox/auth-helpers';

app.get('/profile', (req: AuthenticatedRequest, res) => {
  const user = req.user; // DecodedToken
  
  console.log(user.sub);        // User ID
  console.log(user.role);       // 'broker-admin', 'carrier-user', etc.
  console.log(user.entityId);   // Scoped entity
  console.log(user.email);      // User email
  console.log(user.name);       // User name
  
  res.json({ user });
});
```

### Custom RBAC Policies

```typescript
import { createAdminOverridePolicy, enforceRBACPolicy } from '@ach-lockbox/auth-helpers';

// Create custom policy
const loadServicePolicy = {
  allowedRoles: ['broker-admin', 'carrier-user'],
  allowedEntities: [], // Empty = all entities
  requireAdmin: false,
};

// Check policy manually
app.post('/loads', (req: AuthenticatedRequest, res) => {
  enforceRBACPolicy(req.user, loadServicePolicy);
  // If policy fails, throws ForbiddenError
});

// Admin override
const policyWithAdminOverride = createAdminOverridePolicy(loadServicePolicy);

// Entity-scoped policy
const entityPolicy = {
  allowedRoles: ['carrier-user'],
  allowedEntities: [req.user.entityId], // Only access own entity
  requireAdmin: false,
};
```

### Token Introspection

```typescript
import { isRoleAuthorized, canAccessEntity, getUserEntityId } from '@ach-lockbox/auth-helpers';

app.get('/loads/:id', (req: AuthenticatedRequest, res) => {
  const { user } = req;
  
  // Check role
  if (!isRoleAuthorized(user.role, ['broker-admin', 'carrier-user'])) {
    throw new ForbiddenError('Insufficient permissions');
  }
  
  // Check entity access
  const entityId = req.params.entityId;
  if (!canAccessEntity(user, entityId)) {
    throw new ForbiddenError('Cannot access entity');
  }
  
  // Get user entity
  const userEntity = getUserEntityId(user);
});
```

---

## 3. Input Validation Guide

**Location:** `shared/validation/src/index.ts`

### Validating Request Bodies

```typescript
import { CreateLoadRequestSchema, createValidationMiddleware } from '@ach-lockbox/validation';

app.post('/loads',
  createValidationMiddleware(CreateLoadRequestSchema),
  (req, res) => {
    // req.body is validated and type-safe
    const load = req.body; // CreateLoadRequest
    res.json(load);
  }
);
```

### Validating Query Parameters

```typescript
import { SearchLoadRequest, createQueryValidationMiddleware } from '@ach-lockbox/validation';

app.get('/loads',
  createQueryValidationMiddleware(SearchLoadRequest),
  (req, res) => {
    // req.query is validated
    const { carrierId, status, page, limit } = req.query;
  }
);
```

### Creating Custom Validators

```typescript
import { z } from 'zod';
import { UUIDSchema, ISODateSchema } from '@ach-lockbox/validation';

const CustomRequestSchema = z.object({
  id: UUIDSchema,
  date: ISODateSchema,
  amount: z.number().positive(),
  email: z.string().email(),
});

type CustomRequest = z.infer<typeof CustomRequestSchema>;

app.post('/custom',
  createValidationMiddleware(CustomRequestSchema),
  (req, res) => {
    const data: CustomRequest = req.body;
  }
);
```

### Manual Validation

```typescript
import { safeValidate, validateOrThrow } from '@ach-lockbox/validation';

// Soft validation (returns result object)
const result = safeValidate(CreateLoadRequestSchema, data);
if (!result.success) {
  console.log(result.error); // Zod error
} else {
  console.log(result.data); // Validated data
}

// Hard validation (throws ValidationError)
try {
  const validated = validateOrThrow(CreateLoadRequestSchema, data);
} catch (error) {
  // error is ValidationError
}
```

### Request Context

```typescript
import { parseRequestContext } from '@ach-lockbox/validation';

app.post('/loads', (req, res) => {
  const context = parseRequestContext(req);
  
  console.log(context.correlationId); // From x-correlation-id header
  console.log(context.userId);        // From x-user-id header
  console.log(context.entityId);      // From x-entity-id header
  console.log(context.role);          // From JWT token
  console.log(context.timestamp);     // Request time
});
```

---

## 4. Logging Guide

**Location:** `shared/logger/src/index.ts`

### Initialize Logger

```typescript
import { createLogger, createLogMiddleware } from '@ach-lockbox/logger';

const logger = createLogger({
  serviceName: 'load-service',
  level: 'info',
  prettyPrint: process.env.NODE_ENV !== 'production',
});

// Add HTTP logging middleware
app.use(createLogMiddleware({ logger }));
```

### Log Messages

```typescript
// Info level (standard operations)
logger.info('User created', {
  userId: 'user-123',
  email: 'user@example.com',
  timestamp: Date.now(),
});

// Debug level (development)
logger.debug('Cache hit', {
  key: 'load:123',
  ttl: 3600,
});

// Warn level (deprecated, slow operations)
logger.warn('Slow query detected', {
  query: 'SELECT ... FROM loads',
  duration: 2500, // milliseconds
});

// Error level (exceptions, failures)
logger.error('Database connection failed', error, {
  host: 'localhost',
  port: 5432,
});
```

### Correlation IDs

```typescript
import { getCorrelationId, setCorrelationId } from '@ach-lockbox/logger';

// Middleware automatically sets correlation ID
app.get('/loads/:id', (req, res) => {
  const correlationId = getCorrelationId(); // Already set by middleware
  logger.info('Fetching load', { correlationId, loadId: req.params.id });
});

// Manual override if needed
setCorrelationId('custom-correlation-id');
logger.info('Manual event');
```

### Domain-Specific Loggers

```typescript
import { 
  createContextualLogger, 
  logError, 
  logWithTiming,
  logDatabaseQuery,
  logKafkaMessage 
} from '@ach-lockbox/logger';

// Create logger with preset context
const contextLogger = createContextualLogger(logger, {
  userId: 'user-123',
  loadId: 'load-456',
});

contextLogger.info('Processing load'); // Includes userId and loadId

// Log errors with stack trace
const error = new Error('Something went wrong');
logError(logger, error, { context: 'user creation' });

// Log operation with timing
await logWithTiming(logger, 'Creating load', async () => {
  return await createLoad(data);
});

// Log database query
await logDatabaseQuery(logger, 'INSERT INTO loads', ['load-123'], 125); // duration in ms

// Log Kafka message
await logKafkaMessage(logger, 'publishing', TOPICS.LOAD_CREATED, event);
```

### Batch Logging

```typescript
import { BatchLogger } from '@ach-lockbox/logger';

const batchLogger = new BatchLogger(logger);

for (const item of items) {
  batchLogger.add({
    level: 'info',
    message: 'Processing item',
    data: { itemId: item.id },
  });
}

await batchLogger.flush(); // Flushes all logs at once
```

---

## 5. Error Handling Guide

**Location:** `shared/error-taxonomy/src/index.ts`

### Throwing Errors in Handlers

```typescript
import { 
  ValidationError, 
  NotFoundError, 
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  asyncHandler 
} from '@ach-lockbox/error-taxonomy';

app.post('/loads',
  asyncHandler(async (req, res) => {
    // Validation error
    if (!req.body.carrierId) {
      throw new ValidationError('carrier_id is required');
    }
    
    // Not found error
    const carrier = await getCarrier(req.body.carrierId);
    if (!carrier) {
      throw new NotFoundError(`Carrier ${req.body.carrierId} not found`);
    }
    
    // Authorization error
    if (req.user.role !== 'broker-admin') {
      throw new ForbiddenError('Only brokers can create loads');
    }
    
    // Conflict error (duplicate)
    const existing = await findLoadByKey(req.body.key);
    if (existing) {
      throw new ConflictError(`Load already exists: ${req.body.key}`);
    }
    
    res.json(await createLoad(req.body));
  })
);
```

### Global Error Handler

```typescript
import { createErrorHandlerMiddleware } from '@ach-lockbox/error-taxonomy';

// Must be LAST middleware
app.use(createErrorHandlerMiddleware(logger, {
  isDevelopment: process.env.NODE_ENV === 'development',
  includeStackTrace: true,
}));

// This catches all errors thrown in handlers and returns standardized response:
// {
//   error: "VALIDATION_ERROR",
//   message: "carrier_id is required",
//   code: "VALIDATION_ERROR",
//   statusCode: 400,
//   timestamp: "2024-01-01T00:00:00Z",
//   correlationId: "correlation-id-xyz"
// }
```

### Error Type Guards

```typescript
import { 
  isOperationalError, 
  isClientError, 
  isServerError 
} from '@ach-lockbox/error-taxonomy';

try {
  await someOperation();
} catch (error) {
  if (isOperationalError(error)) {
    // Expected error (client sent bad data, resource not found, etc.)
    logger.warn('Operational error', { code: error.code });
  } else if (isClientError(error)) {
    // 4xx error
    logger.warn('Client error', { statusCode: error.statusCode });
  } else if (isServerError(error)) {
    // 5xx error
    logger.error('Server error', error);
  }
}
```

### Batch Error Collection

```typescript
import { BatchErrorCollector } from '@ach-lockbox/error-taxonomy';

const errors = new BatchErrorCollector();

for (const item of items) {
  try {
    await processItem(item);
  } catch (error) {
    errors.add(error as Error);
  }
}

// Throw if any errors
errors.throwIfErrors(`Failed to process ${items.length} items`);
```

### Retry Logic

```typescript
import { withRetry } from '@ach-lockbox/error-taxonomy';

const data = await withRetry(
  async () => {
    return await kafkaProducer.publishEvent(topic, event);
  },
  {
    maxAttempts: 3,
    delayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
  },
  logger
);
```

---

## 6. Kafka Infrastructure Guide

**Location:** `shared/kafka/src/index.ts`

### Initializing Kafka Client

```typescript
import { createKafkaClient } from '@ach-lockbox/kafka';

const kafka = createKafkaClient({
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
  clientId: 'load-service',
  connectionTimeout: 10000,
  requestTimeout: 30000,
  ssl: false,
  // For SASL authentication:
  // sasl: {
  //   mechanism: 'plain',
  //   username: 'user',
  //   password: 'password',
  // },
  logLevel: 'warn',
});
```

### Using Producers

```typescript
import { KafkaProducer } from '@ach-lockbox/kafka';
import { TOPICS } from '@ach-lockbox/event-types';

const producer = new KafkaProducer(kafka, logger, {
  allowAutoTopicCreation: true,
  timeout: 30000,
  idempotent: true,
});

await producer.connect();

// Publish single event
await producer.publishEvent(TOPICS.LOAD_CREATED, event, event.entityId);

// Publish batch
await producer.publishBatch(
  TOPICS.INVOICE_SUBMITTED,
  invoiceEvents,
  (event) => event.payload.loadId // Partition key
);

await producer.disconnect();
```

### Using Consumers

```typescript
import { KafkaConsumer } from '@ach-lockbox/kafka';
import { TOPICS, CONSUMER_GROUPS } from '@ach-lockbox/event-types';

const consumer = new KafkaConsumer(kafka, logger, {
  groupId: CONSUMER_GROUPS.LEDGER_EVENTS,
  fromBeginning: false,
  sessionTimeout: 30000,
});

await consumer.connect();
await consumer.subscribe({
  topics: [TOPICS.LOAD_CREATED, TOPICS.INVOICE_SUBMITTED],
});

// Message-by-message processing
await consumer.run(async (payload, event) => {
  logger.info('Processing event', { type: event.type });
  
  // Handle based on type
  switch (event.type) {
    case TOPICS.LOAD_CREATED:
      await ledgerService.recordLoadCreated(event.payload);
      break;
  }
});

// Or batch processing
await consumer.runBatch(async (payload) => {
  const batched = payload.batch.messages.map(msg => 
    JSON.parse(msg.value.toString())
  );
  
  await ledgerService.recordBatch(batched);
  await payload.resolveOffset(
    payload.batch.messages[payload.batch.messages.length - 1].offset
  );
  await payload.heartbeat();
});
```

### Dead Letter Queue

```typescript
import { DLQProducer } from '@ach-lockbox/kafka';

const dlqProducer = new DLQProducer(producer, logger);

// In error handler
try {
  await consumer.run(async (payload, event) => {
    throw new Error('Processing failed');
  });
} catch (error) {
  await dlqProducer.sendToDLQ(
    'events-dlq',
    payload.topic,
    payload,
    'Failed to process event',
    error as Error,
    0 // retry count
  );
}
```

### Health Checking

```typescript
import { KafkaHealthChecker } from '@ach-lockbox/kafka';

const healthChecker = new KafkaHealthChecker(kafka, logger);

app.get('/health/kafka', async (req, res) => {
  const status = await healthChecker.check([
    TOPICS.LOAD_CREATED,
    TOPICS.INVOICE_SUBMITTED,
    TOPICS.PAYMENT_RECEIVED,
  ]);
  
  const code = status.healthy ? 200 : 503;
  res.status(code).json({
    healthy: status.healthy,
    brokers: status.brokers,
    topics: {
      ready: status.topicsReady,
      missing: status.topicsMissing,
    },
  });
});
```

---

## Complete Service Example

Here's a complete Load Service implementation:

```typescript
// services/load-service/src/index.ts
import express from 'express';
import { createLogger, createLogMiddleware } from '@ach-lockbox/logger';
import { createAuthMiddleware, createRBACMiddleware, RBAC_POLICIES } from '@ach-lockbox/auth-helpers';
import { CreateLoadRequestSchema, createValidationMiddleware, parseRequestContext } from '@ach-lockbox/validation';
import { createErrorHandlerMiddleware, asyncHandler, NotFoundError } from '@ach-lockbox/error-taxonomy';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';
import { TOPICS, createEventEnvelope } from '@ach-lockbox/event-types';

const PORT = process.env.PORT || 3020;
const logger = createLogger({ serviceName: 'load-service' });
const app = express();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: 'load-service',
});

const producer = new KafkaProducer(kafka, logger);

// Middleware
app.use(createLogMiddleware({ logger }));
app.use(express.json());
app.use(createAuthMiddleware({
  publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || 'keys/public.key',
}));

// Routes
app.post('/loads',
  createValidationMiddleware(CreateLoadRequestSchema),
  createRBACMiddleware(RBAC_POLICIES.BROKER_ONLY),
  asyncHandler(async (req, res) => {
    const context = parseRequestContext(req);
    
    const load = {
      id: 'load-' + Date.now(),
      ...req.body,
      createdAt: new Date(),
      status: 'created',
    };
    
    // Publish event
    const event = createEventEnvelope(TOPICS.LOAD_CREATED, load, {
      correlationId: context.correlationId,
      userId: context.userId,
      entityId: load.id,
    });
    
    await producer.publishEvent(TOPICS.LOAD_CREATED, event);
    
    logger.info('Load created', { loadId: load.id, correlationId: context.correlationId });
    res.status(201).json(load);
  })
);

app.get('/loads/:id',
  createRBACMiddleware(RBAC_POLICIES.AUTHENTICATED_USERS),
  asyncHandler(async (req, res) => {
    const load = { id: req.params.id /* fetch from DB */ };
    if (!load) {
      throw new NotFoundError(`Load ${req.params.id} not found`);
    }
    res.json(load);
  })
);

// Error handler (last)
app.use(createErrorHandlerMiddleware(logger));

// Startup
async function start() {
  try {
    await producer.connect();
    app.listen(PORT, () => {
      logger.info(`Load service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Startup failed', error as Error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  await producer.disconnect();
  process.exit(0);
});
```

---

## Environment Variables

All services should support these environment variables:

```bash
# Service Configuration
PORT=3020
SERVICE_NAME=load-service
NODE_ENV=development
LOG_LEVEL=info

# Authentication
JWT_PUBLIC_KEY_PATH=keys/public.key
JWT_ALGORITHM=RS256

# Kafka
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_SASL_ENABLED=false
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=

# Database (for Phase 3)
DATABASE_URL=postgresql://user:password@localhost:5432/ach-lockbox
REDIS_URL=redis://localhost:6379
```

---

**All shared packages are now fully integrated and ready for service implementation! 🚀**
