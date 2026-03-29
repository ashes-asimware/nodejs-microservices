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
  IssueFuelAdvanceRequest,
  IssueFuelAdvanceRequestSchema,
  SettleFuelChargeRequest,
  SettleFuelChargeRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  FuelCardAdvanceIssuedPayload,
  FuelChargeSettledPayload,
  TOPICS,
} from '@ach-lockbox/event-types';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';

const SERVICE_NAME = 'fuel-service';
const PORT = Number(process.env.PORT || 3024);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

type FuelAdvanceStatus = 'ISSUED' | 'SETTLED';

interface FuelAdvanceRecord {
  id: string;
  carrierId: string;
  amount: number;
  cardNumber: string;
  vendorId: string;
  issueDate: Date;
  expiryDate: Date;
  status: FuelAdvanceStatus;
  totalCharges?: number;
  offsetAmount?: number;
  remainingBalance?: number;
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const advances = new Map<string, FuelAdvanceRecord>();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});
const producer = new KafkaProducer(kafka, logger);
let kafkaReady = false;

async function publishAdvanceIssued(advance: FuelAdvanceRecord): Promise<void> {
  if (!kafkaReady) return;

  const payload: FuelCardAdvanceIssuedPayload = {
    fuelAdvanceId: advance.id,
    carrierId: advance.carrierId,
    amount: advance.amount,
    cardNumber: advance.cardNumber,
    issueDate: advance.issueDate,
    expiryDate: advance.expiryDate,
    vendorId: advance.vendorId,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.FUEL_ADVANCE_ISSUED,
    payload,
    advance.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.FUEL_ADVANCE_ISSUED, event, advance.id);
}

async function publishChargeSettled(advance: FuelAdvanceRecord): Promise<void> {
  if (!kafkaReady) return;

  const payload: FuelChargeSettledPayload = {
    fuelAdvanceId: advance.id,
    totalCharges: advance.totalCharges ?? 0,
    chargeDate: advance.settledAt ?? advance.updatedAt,
    offsetAmount: advance.offsetAmount ?? 0,
    remainingBalance: advance.remainingBalance ?? 0,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.FUEL_CHARGE_SETTLED,
    payload,
    advance.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.FUEL_CHARGE_SETTLED, event, advance.id);
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
    domainState: { totalAdvances: advances.size },
  });
});

// Activity 7: Fuel Card Advance — carrier receives fuel advance tied to load
app.post(
  '/fuel/advances',
  createValidationMiddleware(IssueFuelAdvanceRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as IssueFuelAdvanceRequest;
    const id = uuidv4();
    const now = new Date();
    const cardNumber = `FUEL-${id.substring(0, 8).toUpperCase()}`;

    const advance: FuelAdvanceRecord = {
      id,
      carrierId: body.carrierId,
      amount: body.amount,
      cardNumber,
      vendorId: body.vendorId,
      issueDate: now,
      expiryDate: body.expiryDate,
      status: 'ISSUED',
      createdAt: now,
      updatedAt: now,
    };
    advances.set(id, advance);

    try {
      await publishAdvanceIssued(advance);
    } catch (error) {
      logger.warn('Fuel advance issued but event publish failed', {
        advanceId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(advance);
  })
);

// Activity 15: Fuel Card Offset During Settlement — broker offsets fuel advance against payout
app.post(
  '/fuel/advances/:id/settle',
  createValidationMiddleware(SettleFuelChargeRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body as SettleFuelChargeRequest;
    const advance = advances.get(id);
    if (!advance) throw new NotFoundError(`Fuel advance not found: ${id}`);

    const offsetAmount = Math.min(body.totalCharges, advance.amount);
    const remainingBalance = advance.amount - offsetAmount;
    const now = new Date();

    advance.totalCharges = body.totalCharges;
    advance.offsetAmount = offsetAmount;
    advance.remainingBalance = remainingBalance;
    advance.settledAt = body.chargeDate;
    advance.status = 'SETTLED';
    advance.updatedAt = now;
    advances.set(id, advance);

    try {
      await publishChargeSettled(advance);
    } catch (error) {
      logger.warn('Fuel charge settled but event publish failed', {
        advanceId: id,
        error: (error as Error).message,
      });
    }

    res.status(200).json(advance);
  })
);

app.get(
  '/fuel/advances/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const advance = advances.get(id);
    if (!advance) throw new NotFoundError(`Fuel advance not found: ${id}`);
    res.status(200).json(advance);
  })
);

app.get('/fuel/advances', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(advances.values()));
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
    logger.info('Fuel service started', { port: PORT });
  });
}

void start();
