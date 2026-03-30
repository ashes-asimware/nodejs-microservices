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
  AssignFactoringRequest,
  AssignFactoringRequestSchema,
  IssueFactoringAdvanceRequest,
  IssueFactoringAdvanceRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  FactoringAssignmentPayload,
  FactoringAdvanceIssuedPayload,
  FactoringSettlementPayload,
  TOPICS,
} from '@ach-lockbox/event-types';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';

const SERVICE_NAME = 'factoring-service';
const PORT = Number(process.env.PORT || 3022);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

type AssignmentStatus = 'ASSIGNED' | 'ADVANCED' | 'SETTLED';

interface FactoringAssignmentRecord {
  id: string;
  invoiceId: string;
  carrierId: string;
  factorId: string;
  advancePercentage: number;
  advanceAmount: number;
  status: AssignmentStatus;
  advanceAmount_net?: number;
  settlementAmount?: number;
  factorDiscount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const assignments = new Map<string, FactoringAssignmentRecord>();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});
const producer = new KafkaProducer(kafka, logger);
let kafkaReady = false;

async function publishAssigned(assignment: FactoringAssignmentRecord): Promise<void> {
  if (!kafkaReady) return;

  const payload: FactoringAssignmentPayload = {
    factorAssignmentId: assignment.id,
    invoiceId: assignment.invoiceId,
    carrierId: assignment.carrierId,
    advancePercentage: assignment.advancePercentage,
    advanceAmount: assignment.advanceAmount,
    assignedDate: assignment.createdAt,
    factorId: assignment.factorId,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.FACTORING_ASSIGNED,
    payload,
    assignment.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.FACTORING_ASSIGNED, event, assignment.id);
}

async function publishAdvanced(
  assignment: FactoringAssignmentRecord,
  advanceAmount: number,
  discountAmount: number,
  bankAccountId: string
): Promise<void> {
  if (!kafkaReady) return;

  const payload: FactoringAdvanceIssuedPayload = {
    factorAssignmentId: assignment.id,
    advanceAmount,
    discountAmount,
    netAdvanceAmount: advanceAmount - discountAmount,
    advanceDate: assignment.updatedAt,
    bankAccountId,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.FACTORING_ADVANCED,
    payload,
    assignment.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.FACTORING_ADVANCED, event, assignment.id);
}

async function publishSettled(assignment: FactoringAssignmentRecord): Promise<void> {
  if (!kafkaReady) return;

  const payload: FactoringSettlementPayload = {
    factorAssignmentId: assignment.id,
    invoiceId: assignment.invoiceId,
    settlementAmount: assignment.settlementAmount ?? assignment.advanceAmount,
    settlementDate: assignment.updatedAt,
    factorDiscount: assignment.factorDiscount ?? 0,
    carrierId: assignment.carrierId,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.FACTORING_SETTLED,
    payload,
    assignment.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.FACTORING_SETTLED, event, assignment.id);
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
    domainState: { totalAssignments: assignments.size },
  });
});

// Activity 3: Factoring Assignment — carrier assigns invoice to factor
app.post(
  '/factoring/assignments',
  createValidationMiddleware(AssignFactoringRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as AssignFactoringRequest;
    const id = uuidv4();
    const now = new Date();
    // Advance amount placeholder; a real implementation would fetch invoice amount
    const invoiceAmountCents = Number(req.body.invoiceAmountCents ?? 100000);
    const advanceAmount = Math.round(invoiceAmountCents * (body.advancePercentage / 100));

    const assignment: FactoringAssignmentRecord = {
      id,
      invoiceId: body.invoiceId,
      carrierId: body.carrierId,
      factorId: body.factorId,
      advancePercentage: body.advancePercentage,
      advanceAmount,
      status: 'ASSIGNED',
      createdAt: now,
      updatedAt: now,
    };
    assignments.set(id, assignment);

    try {
      await publishAssigned(assignment);
    } catch (error) {
      logger.warn('Factoring assigned but event publish failed', {
        assignmentId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(assignment);
  })
);

// Activity 4: Factor Advance to Carrier — factor issues advance before broker pays
app.post(
  '/factoring/assignments/:id/advance',
  createValidationMiddleware(IssueFactoringAdvanceRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body as IssueFactoringAdvanceRequest;
    const assignment = assignments.get(id);
    if (!assignment) throw new NotFoundError(`Assignment not found: ${id}`);

    assignment.advanceAmount = body.advanceAmount;
    assignment.advanceAmount_net = body.advanceAmount - body.discountAmount;
    assignment.status = 'ADVANCED';
    assignment.updatedAt = new Date();
    assignments.set(id, assignment);

    try {
      await publishAdvanced(assignment, body.advanceAmount, body.discountAmount, body.bankAccountId);
    } catch (error) {
      logger.warn('Factoring advance issued but event publish failed', {
        assignmentId: id,
        error: (error as Error).message,
      });
    }

    res.status(200).json(assignment);
  })
);

// Activity 14: Factor Final Settlement — reserves released, fees applied
app.post(
  '/factoring/assignments/:id/settle',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const assignment = assignments.get(id);
    if (!assignment) throw new NotFoundError(`Assignment not found: ${id}`);

    assignment.settlementAmount =
      typeof req.body?.settlementAmount === 'number'
        ? req.body.settlementAmount
        : assignment.advanceAmount;
    assignment.factorDiscount =
      typeof req.body?.factorDiscount === 'number' ? req.body.factorDiscount : 0;
    assignment.status = 'SETTLED';
    assignment.updatedAt = new Date();
    assignments.set(id, assignment);

    try {
      await publishSettled(assignment);
    } catch (error) {
      logger.warn('Factoring settled but event publish failed', {
        assignmentId: id,
        error: (error as Error).message,
      });
    }

    res.status(200).json(assignment);
  })
);

app.get(
  '/factoring/assignments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const assignment = assignments.get(id);
    if (!assignment) throw new NotFoundError(`Assignment not found: ${id}`);
    res.status(200).json(assignment);
  })
);

app.get('/factoring/assignments', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(assignments.values()));
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
    logger.info('Factoring service started', { port: PORT });
  });
}

void start();
