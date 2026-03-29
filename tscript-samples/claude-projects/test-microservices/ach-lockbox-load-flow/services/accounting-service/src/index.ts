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
  CreateGLPostingRequest,
  CreateGLPostingRequestSchema,
  CreateIntercompanySettlementRequest,
  CreateIntercompanySettlementRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  EventEnvelope,
  GLPostingCreatedPayload,
  IntercompanySettlementPayload,
  TOPICS,
  CONSUMER_GROUPS,
  CONSUMER_SUBSCRIPTIONS,
} from '@ach-lockbox/event-types';

const SERVICE_NAME = 'accounting-service';
const PORT = Number(process.env.PORT || 3031);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

// ─── Domain Records ───────────────────────────────────────────────────────────

interface GLPostingRecord {
  id: string;
  journalEntryId: string;
  accountNumber: string;
  debitAmount?: number;
  creditAmount?: number;
  description: string;
  postingDate: Date;
  entityId: string;
  departmentId?: string;
  sourceEventType?: string;
  createdAt: Date;
}

interface IntercompanySettlementRecord {
  id: string;
  fromEntity: string;
  toEntity: string;
  amount: number;
  settlementDate: Date;
  journalEntryId: string;
  description: string;
  sourceEventType?: string;
  createdAt: Date;
}

const glPostings = new Map<string, GLPostingRecord>();
const intercompanySettlements = new Map<string, IntercompanySettlementRecord>();

// ─── Kafka setup ──────────────────────────────────────────────────────────────

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

// ─── Publish helpers ─────────────────────────────────────────────────────────

async function publishGLPosting(posting: GLPostingRecord): Promise<void> {
  if (!producerReady) return;

  const payload: GLPostingCreatedPayload = {
    postingId: posting.id,
    journalEntryId: posting.journalEntryId,
    accountNumber: posting.accountNumber,
    debitAmount: posting.debitAmount,
    creditAmount: posting.creditAmount,
    description: posting.description,
    postingDate: posting.postingDate,
    entityId: posting.entityId,
    departmentId: posting.departmentId,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.ACCOUNTING_GL_POSTING,
    payload,
    posting.id,
    'system',
    { correlationId: uuidv4() }
  );

  await kafkaProducer.send({
    topic: TOPICS.ACCOUNTING_GL_POSTING,
    messages: [{ key: posting.id, value: JSON.stringify(event) }],
  });
}

async function publishIntercompanySettlement(
  settlement: IntercompanySettlementRecord
): Promise<void> {
  if (!producerReady) return;

  const payload: IntercompanySettlementPayload = {
    settlementId: settlement.id,
    fromEntity: settlement.fromEntity,
    toEntity: settlement.toEntity,
    amount: settlement.amount,
    settlementDate: settlement.settlementDate,
    journalEntryId: settlement.journalEntryId,
    description: settlement.description,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.ACCOUNTING_INTERCOMPANY_SETTLEMENT,
    payload,
    settlement.id,
    'system',
    { correlationId: uuidv4() }
  );

  await kafkaProducer.send({
    topic: TOPICS.ACCOUNTING_INTERCOMPANY_SETTLEMENT,
    messages: [{ key: settlement.id, value: JSON.stringify(event) }],
  });
}

// ─── Auto-projection logic (GL rules per domain event type) ──────────────────

function projectGLFromEvent(event: EventEnvelope): GLPostingRecord[] {
  const journalEntryId = uuidv4();
  const now = new Date();
  const payload = event.payload as Record<string, unknown>;
  const postings: GLPostingRecord[] = [];

  switch (event.type) {
    case TOPICS.INVOICE_SUBMITTED: {
      // AR debit — carrier or entity earns a receivable
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '1200',           // Accounts Receivable
        debitAmount: payload.amount as number | undefined,
        description: `AR created for invoice ${payload.invoiceId}`,
        postingDate: now,
        entityId: (payload.carrierId as string | undefined) ?? event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '4000',           // Revenue
        creditAmount: payload.amount as number | undefined,
        description: `Revenue recognised for invoice ${payload.invoiceId}`,
        postingDate: now,
        entityId: (payload.carrierId as string | undefined) ?? event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      break;
    }

    case TOPICS.PAYMENT_INITIATED: {
      // AP debit, Cash-in-Transit credit
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '2000',           // Accounts Payable
        debitAmount: payload.amount as number | undefined,
        description: `AP cleared on payment initiation ${payload.paymentId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '1050',           // Cash-in-Transit
        creditAmount: payload.amount as number | undefined,
        description: `Cash-in-transit for payment ${payload.paymentId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      break;
    }

    case TOPICS.PAYMENT_SETTLED: {
      // Cash-in-Transit debit, Cash credit
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '1050',           // Cash-in-Transit
        debitAmount: payload.amount as number | undefined,
        description: `CiT cleared on settlement ${payload.paymentId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '1000',           // Cash
        creditAmount: payload.amount as number | undefined,
        description: `Cash posted on settlement ${payload.paymentId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      break;
    }

    case TOPICS.FACTORING_ADVANCED: {
      // Factor AP debit, Cash credit (factor pays carrier)
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '2010',           // Factor Advance Payable
        debitAmount: payload.netAdvanceAmount as number | undefined,
        description: `Factoring advance disbursed ${payload.factorAssignmentId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '1000',           // Cash
        creditAmount: payload.netAdvanceAmount as number | undefined,
        description: `Cash outflow for factoring advance ${payload.factorAssignmentId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      break;
    }

    case TOPICS.FUEL_CHARGE_SETTLED: {
      // Fuel Advance Liability debit, AR credit (offsets carrier payout)
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '2020',           // Fuel Advance Liability
        debitAmount: payload.offsetAmount as number | undefined,
        description: `Fuel advance offset ${payload.fuelAdvanceId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      postings.push({
        id: uuidv4(),
        journalEntryId,
        accountNumber: '1200',           // Accounts Receivable
        creditAmount: payload.offsetAmount as number | undefined,
        description: `AR reduction for fuel offset ${payload.fuelAdvanceId}`,
        postingDate: now,
        entityId: event.entityId,
        sourceEventType: event.type,
        createdAt: now,
      });
      break;
    }

    default:
      break;
  }

  return postings;
}

// ─── HTTP Endpoints ───────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'ok',
    producerReady,
    consumerReady,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.status(200).json({
    ...metricsCollector.snapshot(),
    domainState: {
      glPostings: glPostings.size,
      intercompanySettlements: intercompanySettlements.size,
    },
  });
});

// Manual GL posting (e.g. from reconciliation adjustments — Activity 17)
app.post(
  '/accounting/gl-postings',
  createValidationMiddleware(CreateGLPostingRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateGLPostingRequest;
    const id = uuidv4();
    const now = new Date();

    const posting: GLPostingRecord = {
      id,
      journalEntryId: body.journalEntryId,
      accountNumber: body.accountNumber,
      debitAmount: body.debitAmount,
      creditAmount: body.creditAmount,
      description: body.description,
      postingDate: now,
      entityId: body.entityId,
      departmentId: body.departmentId,
      createdAt: now,
    };
    glPostings.set(id, posting);

    try {
      await publishGLPosting(posting);
    } catch (error) {
      logger.warn('GL posting created but event publish failed', {
        postingId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(posting);
  })
);

app.get('/accounting/gl-postings', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(glPostings.values()));
});

app.get(
  '/accounting/gl-postings/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const posting = glPostings.get(id);
    if (!posting) throw new NotFoundError(`GL posting not found: ${id}`);
    res.status(200).json(posting);
  })
);

// Activity 9: Intercompany Settlement — cross-entity due-to/due-from entries
app.post(
  '/accounting/intercompany',
  createValidationMiddleware(CreateIntercompanySettlementRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateIntercompanySettlementRequest;
    const id = uuidv4();
    const now = new Date();

    const settlement: IntercompanySettlementRecord = {
      id,
      fromEntity: body.fromEntity,
      toEntity: body.toEntity,
      amount: body.amount,
      settlementDate: now,
      journalEntryId: uuidv4(),
      description: body.description,
      createdAt: now,
    };
    intercompanySettlements.set(id, settlement);

    // Create balancing GL entries: due-from (asset) and due-to (liability)
    const dueFrom: GLPostingRecord = {
      id: uuidv4(),
      journalEntryId: settlement.journalEntryId,
      accountNumber: '1300',             // Due-From Intercompany
      debitAmount: body.amount,
      description: `Due-from ${body.toEntity}: ${body.description}`,
      postingDate: now,
      entityId: body.fromEntity,
      sourceEventType: 'intercompany.settlement',
      createdAt: now,
    };
    const dueTo: GLPostingRecord = {
      id: uuidv4(),
      journalEntryId: settlement.journalEntryId,
      accountNumber: '2100',             // Due-To Intercompany
      creditAmount: body.amount,
      description: `Due-to ${body.fromEntity}: ${body.description}`,
      postingDate: now,
      entityId: body.toEntity,
      sourceEventType: 'intercompany.settlement',
      createdAt: now,
    };

    glPostings.set(dueFrom.id, dueFrom);
    glPostings.set(dueTo.id, dueTo);

    try {
      await publishIntercompanySettlement(settlement);
      await publishGLPosting(dueFrom);
      await publishGLPosting(dueTo);
    } catch (error) {
      logger.warn('Intercompany settlement created but event publish failed', {
        settlementId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json({ settlement, entries: [dueFrom, dueTo] });
  })
);

app.get('/accounting/intercompany', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(intercompanySettlements.values()));
});

app.use(createErrorHandlerMiddleware(logger));

// ─── Kafka Consumer: project GL entries from financial domain events ──────────

async function startConsumer(): Promise<void> {
  const topics = CONSUMER_SUBSCRIPTIONS[CONSUMER_GROUPS.ACCOUNTING_PROJECTIONS];

  consumer = kafka.consumer({
    groupId: CONSUMER_GROUPS.ACCOUNTING_PROJECTIONS,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    allowAutoTopicCreation: true,
  });

  await consumer.connect();

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  consumerReady = true;
  logger.info('Accounting consumer subscribed', { topics });

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      const raw = payload.message.value?.toString();
      if (!raw) return;

      try {
        const event = JSON.parse(raw) as EventEnvelope;
        const projectedPostings = projectGLFromEvent(event);

        for (const posting of projectedPostings) {
          glPostings.set(posting.id, posting);
          publishGLPosting(posting).catch((err: Error) =>
            logger.warn('Failed to publish projected GL posting', { error: err.message })
          );
        }

        if (projectedPostings.length > 0) {
          logger.info('GL projections created', {
            eventType: event.type,
            count: projectedPostings.length,
          });
        }
      } catch (err) {
        logger.error('Failed to project GL from domain event', err as Error, {
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
    logger.warn('Kafka consumer unavailable; auto-projection disabled', {
      error: (error as Error).message,
    });
  }

  app.listen(PORT, () => {
    logger.info('Accounting service started', { port: PORT });
  });
}

void start();
