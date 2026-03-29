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
  AuthorizePaymentRequest,
  AuthorizePaymentRequestSchema,
  InitiatePaymentRequest,
  InitiatePaymentRequestSchema,
  RecordPaymentReceivedRequest,
  RecordPaymentReceivedRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  PaymentAuthorizedPayload,
  PaymentInitiatedPayload,
  PaymentReceivedPayload,
  TOPICS,
} from '@ach-lockbox/event-types';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';

const SERVICE_NAME = 'payment-service';
const PORT = Number(process.env.PORT || 3023);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

type PaymentStatus = 'AUTHORIZED' | 'INITIATED' | 'SETTLED' | 'RECEIVED';

interface PaymentRecord {
  id: string;
  carrierId?: string;
  customerId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  paymentMethod?: 'ACH' | 'EFT' | 'CHECK' | 'WIRE';
  bankAccountId?: string;
  expectedSettlementDate?: Date;
  referenceNumber?: string;
  lockboxFileId?: string;
  checkNumber?: string;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const payments = new Map<string, PaymentRecord>();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});
const producer = new KafkaProducer(kafka, logger);
let kafkaReady = false;

async function publishAuthorized(payment: PaymentRecord): Promise<void> {
  if (!kafkaReady || !payment.carrierId) {
    return;
  }

  const payload: PaymentAuthorizedPayload = {
    paymentId: payment.id,
    carrierId: payment.carrierId,
    invoiceId: payment.invoiceId,
    amount: payment.amount,
    authorizedDate: payment.createdAt,
    approverUserId: 'system',
    invoiceNumber: payment.invoiceNumber,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.PAYMENT_AUTHORIZED,
    payload,
    payment.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.PAYMENT_AUTHORIZED, event, payment.id);
}

async function publishInitiated(payment: PaymentRecord): Promise<void> {
  if (!kafkaReady || !payment.carrierId || !payment.paymentMethod || !payment.bankAccountId) {
    return;
  }

  const payload: PaymentInitiatedPayload = {
    paymentId: payment.id,
    carrierId: payment.carrierId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    bankAccountId: payment.bankAccountId,
    initiatedDate: payment.updatedAt,
    expectedSettlementDate: payment.expectedSettlementDate || payment.updatedAt,
    referenceNumber: payment.referenceNumber || `ref-${payment.id}`,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.PAYMENT_INITIATED,
    payload,
    payment.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.PAYMENT_INITIATED, event, payment.id);
}

async function publishReceived(payment: PaymentRecord): Promise<void> {
  if (!kafkaReady || !payment.customerId || !payment.lockboxFileId) {
    return;
  }

  const payload: PaymentReceivedPayload = {
    paymentId: payment.id,
    customerId: payment.customerId,
    amount: payment.amount,
    receivedDate: payment.updatedAt,
    lockboxFileId: payment.lockboxFileId,
    checkNumber: payment.checkNumber,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.PAYMENT_RECEIVED,
    payload,
    payment.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.PAYMENT_RECEIVED, event, payment.id);
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
      totalPayments: payments.size,
    },
  });
});

app.post(
  '/payments/authorize',
  createValidationMiddleware(AuthorizePaymentRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as AuthorizePaymentRequest;
    const id = uuidv4();
    const now = new Date();

    const payment: PaymentRecord = {
      id,
      carrierId: body.carrierId,
      invoiceId: body.invoiceId,
      invoiceNumber: body.invoiceNumber,
      amount: body.amount,
      status: 'AUTHORIZED',
      createdAt: now,
      updatedAt: now,
    };

    payments.set(id, payment);

    try {
      await publishAuthorized(payment);
    } catch (error) {
      logger.warn('Payment authorized but event publish failed', {
        paymentId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(payment);
  })
);

app.post(
  '/payments/:id/initiate',
  createValidationMiddleware(InitiatePaymentRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body as InitiatePaymentRequest;
    if (id !== body.paymentId) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Path id and paymentId payload must match',
      });
      return;
    }

    const payment = payments.get(id);
    if (!payment) {
      throw new NotFoundError(`Payment not found: ${id}`);
    }

    payment.paymentMethod = body.paymentMethod;
    payment.bankAccountId = body.bankAccountId;
    payment.expectedSettlementDate = body.expectedSettlementDate;
    payment.referenceNumber = `ach-${payment.id.substring(0, 8)}`;
    payment.status = 'INITIATED';
    payment.updatedAt = new Date();
    payments.set(payment.id, payment);

    try {
      await publishInitiated(payment);
    } catch (error) {
      logger.warn('Payment initiated but event publish failed', {
        paymentId: payment.id,
        error: (error as Error).message,
      });
    }

    res.status(200).json(payment);
  })
);

app.post(
  '/payments/received',
  createValidationMiddleware(RecordPaymentReceivedRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as RecordPaymentReceivedRequest;
    const id = uuidv4();
    const now = new Date();

    const payment: PaymentRecord = {
      id,
      customerId: body.customerId,
      amount: body.amount,
      lockboxFileId: body.lockboxFileId,
      checkNumber: body.checkNumber,
      status: 'RECEIVED',
      createdAt: now,
      updatedAt: now,
    };

    payments.set(id, payment);

    try {
      await publishReceived(payment);
    } catch (error) {
      logger.warn('Inbound payment recorded but event publish failed', {
        paymentId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(payment);
  })
);

app.get(
  '/payments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const payment = payments.get(id);
    if (!payment) {
      throw new NotFoundError(`Payment not found: ${id}`);
    }

    res.status(200).json(payment);
  })
);

app.get('/payments', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(payments.values()));
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
    logger.info('Payment service started', { port: PORT });
  });
}

void start();
