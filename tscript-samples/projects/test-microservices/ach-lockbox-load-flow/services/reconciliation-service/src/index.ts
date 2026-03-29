import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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
  MatchPaymentRequest,
  MatchPaymentRequestSchema,
  CompleteReconciliationRequest,
  CompleteReconciliationRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  PaymentMatchedPayload,
  ReconciliationCompletedPayload,
  TOPICS,
} from '@ach-lockbox/event-types';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';

const SERVICE_NAME = 'reconciliation-service';
const PORT = Number(process.env.PORT || 3026);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

interface PaymentMatchRecord {
  id: string;
  paymentId: string;
  invoiceId: string;
  matchType: 'EXACT' | 'FUZZY' | 'MANUAL';
  matchScore: number;
  matcherUserId?: string;
  createdAt: Date;
}

interface ReconciliationRunRecord {
  id: string;
  customerId: string;
  startDate: Date;
  endDate: Date;
  totalItemsProcessed: number;
  itemsMatched: number;
  itemsUnmatched: number;
  completedAt: Date;
}

const matches = new Map<string, PaymentMatchRecord>();
const runs = new Map<string, ReconciliationRunRecord>();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});
const producer = new KafkaProducer(kafka, logger);
let kafkaReady = false;

async function publishPaymentMatched(match: PaymentMatchRecord): Promise<void> {
  if (!kafkaReady) {
    return;
  }

  const payload: PaymentMatchedPayload = {
    matchId: match.id,
    paymentId: match.paymentId,
    invoiceId: match.invoiceId,
    matchType: match.matchType,
    matchScore: match.matchScore,
    matchedDate: match.createdAt,
    matcherUserId: match.matcherUserId,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.RECONCILIATION_PAYMENT_MATCHED,
    payload,
    match.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.RECONCILIATION_PAYMENT_MATCHED, event, match.id);
}

async function publishReconciliationCompleted(run: ReconciliationRunRecord): Promise<void> {
  if (!kafkaReady) {
    return;
  }

  const payload: ReconciliationCompletedPayload = {
    reconciliationRunId: run.id,
    customerId: run.customerId,
    startDate: run.startDate,
    endDate: run.endDate,
    totalItemsProcessed: run.totalItemsProcessed,
    itemsMatched: run.itemsMatched,
    itemsUnmatched: run.itemsUnmatched,
    completedDate: run.completedAt,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.RECONCILIATION_COMPLETED,
    payload,
    run.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.RECONCILIATION_COMPLETED, event, run.id);
}

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'ok',
    kafkaReady,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.status(200).json({
    ...metricsCollector.snapshot(),
    domainState: {
      totalMatches: matches.size,
      totalRuns: runs.size,
    },
  });
});

app.post(
  '/reconciliation/matches',
  createValidationMiddleware(MatchPaymentRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as MatchPaymentRequest;

    const match: PaymentMatchRecord = {
      id: uuidv4(),
      paymentId: body.paymentId,
      invoiceId: body.invoiceId,
      matchType: body.matchType,
      matchScore: body.matchScore,
      matcherUserId: body.matcherUserId,
      createdAt: new Date(),
    };

    matches.set(match.id, match);

    try {
      await publishPaymentMatched(match);
    } catch (error) {
      logger.warn('Payment match created but event publish failed', {
        matchId: match.id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(match);
  })
);

app.post(
  '/reconciliation/runs',
  createValidationMiddleware(CompleteReconciliationRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CompleteReconciliationRequest;

    const runId = uuidv4();
    const allMatches = Array.from(matches.values());
    const customerMatchCount = allMatches.length;

    const run: ReconciliationRunRecord = {
      id: runId,
      customerId: body.customerId,
      startDate: body.startDate,
      endDate: body.endDate,
      totalItemsProcessed: customerMatchCount,
      itemsMatched: customerMatchCount,
      itemsUnmatched: 0,
      completedAt: new Date(),
    };

    runs.set(runId, run);

    try {
      await publishReconciliationCompleted(run);
    } catch (error) {
      logger.warn('Reconciliation completed but event publish failed', {
        runId,
        error: (error as Error).message,
      });
    }

    res.status(201).json(run);
  })
);

app.get(
  '/reconciliation/runs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const run = runs.get(id);
    if (!run) {
      throw new NotFoundError(`Reconciliation run not found: ${id}`);
    }

    res.status(200).json(run);
  })
);

app.get('/reconciliation/runs', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(runs.values()));
});

app.get('/reconciliation/matches', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(matches.values()));
});

app.use(createErrorHandlerMiddleware(logger));

async function start(): Promise<void> {
  try {
    await producer.connect();
    kafkaReady = true;
    logger.info('Kafka producer connected');
  } catch (error) {
    kafkaReady = false;
    logger.warn('Kafka unavailable; service will run without event publishing', {
      error: (error as Error).message,
    });
  }

  app.listen(PORT, () => {
    logger.info('Reconciliation service started', { port: PORT });
  });
}

void start();
