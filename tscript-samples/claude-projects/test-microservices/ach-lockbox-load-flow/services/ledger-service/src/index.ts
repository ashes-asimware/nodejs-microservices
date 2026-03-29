import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import {
  createHttpMetricsMiddleware,
  createLogger,
  createLogMiddleware,
  HttpMetricsCollector,
} from '@ach-lockbox/logger';
import {
  asyncHandler,
  createErrorHandlerMiddleware,
  NotFoundError,
} from '@ach-lockbox/error-taxonomy';
import {
  createValidationMiddleware,
  AppendLedgerEventRequest,
  AppendLedgerEventRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  EventEnvelope,
  LedgerEventAppendedPayload,
  SnapshotCreatedPayload,
  TOPICS,
  CONSUMER_GROUPS,
  CONSUMER_SUBSCRIPTIONS,
} from '@ach-lockbox/event-types';

const SERVICE_NAME = 'ledger-service';
const PORT = Number(process.env.PORT || 3030);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

// ─── Immutable Event Store ────────────────────────────────────────────────────

interface LedgerEntry {
  id: string;
  sequenceNumber: number;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: Record<string, unknown>;
  correlationId: string;
  source: string;
  appendedAt: Date;
}

interface SnapshotRecord {
  id: string;
  aggregateId: string;
  aggregateType: string;
  sequenceNumber: number;
  snapshotData: Record<string, unknown>;
  createdAt: Date;
}

// Append-only ordered log; never mutated after insertion
const ledgerLog: LedgerEntry[] = [];
let globalSequence = 0;

// Index: aggregateId → [entry indices] for fast per-aggregate queries
const aggregateIndex = new Map<string, number[]>();

// Latest snapshot per aggregateId
const snapshots = new Map<string, SnapshotRecord>();

// ─── Kafka (producer for ledger events, consumer for all domain events) ───────

const kafka = new Kafka({
  clientId: SERVICE_NAME,
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: 1, // WARN
  retry: { retries: 8 },
});

const kafkaProducer = kafka.producer({ idempotent: true, allowAutoTopicCreation: true });
let producerReady = false;

let consumer: Consumer | null = null;
let consumerReady = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function appendEntry(
  aggregateId: string,
  aggregateType: string,
  eventType: string,
  eventData: Record<string, unknown>,
  correlationId: string,
  source: string
): LedgerEntry {
  const seq = ++globalSequence;
  const entry: LedgerEntry = {
    id: uuidv4(),
    sequenceNumber: seq,
    aggregateId,
    aggregateType,
    eventType,
    eventData,
    correlationId,
    source,
    appendedAt: new Date(),
  };

  const idx = ledgerLog.length;
  ledgerLog.push(entry);

  const indices = aggregateIndex.get(aggregateId) ?? [];
  indices.push(idx);
  aggregateIndex.set(aggregateId, indices);

  return entry;
}

async function publishLedgerAppended(entry: LedgerEntry): Promise<void> {
  if (!producerReady) return;

  const payload: LedgerEventAppendedPayload = {
    eventId: entry.id,
    sequenceNumber: entry.sequenceNumber,
    aggregateId: entry.aggregateId,
    aggregateType: entry.aggregateType,
    eventType: entry.eventType,
    eventData: entry.eventData,
    appendedDate: entry.appendedAt,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.LEDGER_EVENT_APPENDED,
    payload,
    entry.id,
    'system',
    { correlationId: entry.correlationId }
  );

  await kafkaProducer.send({
    topic: TOPICS.LEDGER_EVENT_APPENDED,
    messages: [{ key: entry.id, value: JSON.stringify(event) }],
  });
}

async function publishSnapshotCreated(snapshot: SnapshotRecord): Promise<void> {
  if (!producerReady) return;

  const payload: SnapshotCreatedPayload = {
    snapshotId: snapshot.id,
    aggregateId: snapshot.aggregateId,
    aggregateType: snapshot.aggregateType,
    sequenceNumber: snapshot.sequenceNumber,
    snapshotData: snapshot.snapshotData,
    createdDate: snapshot.createdAt,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.LEDGER_SNAPSHOT_CREATED,
    payload,
    snapshot.id,
    'system',
    { correlationId: uuidv4() }
  );

  await kafkaProducer.send({
    topic: TOPICS.LEDGER_SNAPSHOT_CREATED,
    messages: [{ key: snapshot.id, value: JSON.stringify(event) }],
  });
}

// ─── HTTP Endpoints ───────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'ok',
    producerReady,
    consumerReady,
    totalEvents: ledgerLog.length,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.status(200).json({
    ...metricsCollector.snapshot(),
    domainState: {
      totalEvents: ledgerLog.length,
      globalSequence,
      aggregatesTracked: aggregateIndex.size,
      snapshots: snapshots.size,
    },
  });
});

// Manual event append (Activities 1–17 can also write directly)
app.post(
  '/ledger/events',
  createValidationMiddleware(AppendLedgerEventRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as AppendLedgerEventRequest;
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) || uuidv4();

    const entry = appendEntry(
      body.aggregateId,
      body.aggregateType,
      body.eventType,
      body.eventData,
      correlationId,
      SERVICE_NAME
    );

    try {
      await publishLedgerAppended(entry);
    } catch (error) {
      logger.warn('Ledger entry appended but event publish failed', {
        entryId: entry.id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(entry);
  })
);

// Get full history for an aggregate
app.get(
  '/ledger/events/:aggregateId',
  asyncHandler(async (req: Request, res: Response) => {
    const aggregateId = String(req.params.aggregateId);
    const indices = aggregateIndex.get(aggregateId);
    if (!indices || indices.length === 0) {
      throw new NotFoundError(`No ledger events for aggregate: ${aggregateId}`);
    }
    const events = indices.map((i) => ledgerLog[i]);
    res.status(200).json(events);
  })
);

app.get('/ledger/events', (_req: Request, res: Response) => {
  const limit = Math.min(Number(_req.query.limit ?? 100), 500);
  const offset = Number(_req.query.offset ?? 0);
  res.status(200).json({
    total: ledgerLog.length,
    offset,
    limit,
    events: ledgerLog.slice(offset, offset + limit),
  });
});

// Create a snapshot for an aggregate (captures current state up to a sequence)
app.post(
  '/ledger/snapshots',
  asyncHandler(async (req: Request, res: Response) => {
    const { aggregateId, aggregateType, snapshotData } = req.body as {
      aggregateId: string;
      aggregateType: string;
      snapshotData: Record<string, unknown>;
    };

    if (!aggregateId || !aggregateType) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'aggregateId and aggregateType required' });
      return;
    }

    const indices = aggregateIndex.get(aggregateId) ?? [];
    const latestSeq =
      indices.length > 0 ? ledgerLog[indices[indices.length - 1]].sequenceNumber : 0;

    const snapshot: SnapshotRecord = {
      id: uuidv4(),
      aggregateId,
      aggregateType,
      sequenceNumber: latestSeq,
      snapshotData: snapshotData ?? {},
      createdAt: new Date(),
    };
    snapshots.set(aggregateId, snapshot);

    try {
      await publishSnapshotCreated(snapshot);
    } catch (error) {
      logger.warn('Snapshot created but event publish failed', {
        snapshotId: snapshot.id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(snapshot);
  })
);

app.get(
  '/ledger/snapshots/:aggregateId',
  asyncHandler(async (req: Request, res: Response) => {
    const aggregateId = String(req.params.aggregateId);
    const snapshot = snapshots.get(aggregateId);
    if (!snapshot) throw new NotFoundError(`No snapshot for aggregate: ${aggregateId}`);
    res.status(200).json(snapshot);
  })
);

app.use(createErrorHandlerMiddleware(logger));

// ─── Kafka Consumer: subscribe to ALL domain events ──────────────────────────

async function startConsumer(): Promise<void> {
  const topics = CONSUMER_SUBSCRIPTIONS[CONSUMER_GROUPS.LEDGER_EVENTS];

  consumer = kafka.consumer({
    groupId: CONSUMER_GROUPS.LEDGER_EVENTS,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    allowAutoTopicCreation: true,
  });

  await consumer.connect();

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  consumerReady = true;
  logger.info('Ledger consumer subscribed', { topics });

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      const raw = payload.message.value?.toString();
      if (!raw) return;

      try {
        const event = JSON.parse(raw) as EventEnvelope;
        const entry = appendEntry(
          event.entityId,
          event.type.split('.')[0],    // e.g. "load" from "load.created"
          event.type,
          event.payload as Record<string, unknown>,
          event.correlationId,
          event.source
        );

        // Fire-and-forget publish of ledger.event-appended
        publishLedgerAppended(entry).catch((err: Error) =>
          logger.warn('Failed to publish ledger.event-appended', { error: err.message })
        );
      } catch (err) {
        logger.error('Failed to process incoming domain event', err as Error, {
          topic: payload.topic,
          offset: payload.message.offset,
        });
      }
    },
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await kafkaProducer.connect();
    producerReady = true;
    logger.info('Kafka producer connected');
  } catch (error) {
    producerReady = false;
    logger.warn('Kafka producer unavailable', { error: (error as Error).message });
  }

  try {
    await startConsumer();
  } catch (error) {
    consumerReady = false;
    logger.warn('Kafka consumer unavailable; auto-ingestion disabled', {
      error: (error as Error).message,
    });
  }

  app.listen(PORT, () => {
    logger.info('Ledger service started', { port: PORT });
  });
}

void start();
