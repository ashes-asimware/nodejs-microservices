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
  SubmitInvoiceRequest,
  SubmitInvoiceRequestSchema,
  LinkInvoiceToARRequest,
  LinkInvoiceToARRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  InvoiceSubmittedPayload,
  InvoiceLinkedToARPayload,
  TOPICS,
} from '@ach-lockbox/event-types';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';

const SERVICE_NAME = 'invoice-service';
const PORT = Number(process.env.PORT || 3021);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

interface InvoiceRecord {
  id: string;
  loadId: string;
  carrierId: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: Date;
  dueDate: Date;
  attachmentIds: string[];
  status: 'SUBMITTED' | 'LINKED';
  arRecordId?: string;
  customerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const invoices = new Map<string, InvoiceRecord>();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});
const producer = new KafkaProducer(kafka, logger);
let kafkaReady = false;

async function publishInvoiceSubmitted(invoice: InvoiceRecord): Promise<void> {
  if (!kafkaReady) {
    return;
  }

  const payload: InvoiceSubmittedPayload = {
    invoiceId: invoice.id,
    loadId: invoice.loadId,
    carrierId: invoice.carrierId,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.amount,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    attachmentIds: invoice.attachmentIds,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.INVOICE_SUBMITTED,
    payload,
    invoice.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.INVOICE_SUBMITTED, event, invoice.id);
}

async function publishInvoiceLinked(invoice: InvoiceRecord): Promise<void> {
  if (!kafkaReady || !invoice.arRecordId || !invoice.customerId) {
    return;
  }

  const payload: InvoiceLinkedToARPayload = {
    invoiceId: invoice.id,
    arRecordId: invoice.arRecordId,
    customerId: invoice.customerId,
    linkedDate: new Date(),
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.INVOICE_LINKED_TO_AR,
    payload,
    invoice.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.INVOICE_LINKED_TO_AR, event, invoice.id);
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
      totalInvoices: invoices.size,
    },
  });
});

app.post(
  '/invoices',
  createValidationMiddleware(SubmitInvoiceRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as SubmitInvoiceRequest;
    const id = uuidv4();
    const now = new Date();

    const invoice: InvoiceRecord = {
      id,
      loadId: body.loadId,
      carrierId: body.carrierId,
      invoiceNumber: body.invoiceNumber,
      amount: body.amount,
      invoiceDate: body.invoiceDate,
      dueDate: body.dueDate,
      attachmentIds: body.attachmentIds || [],
      status: 'SUBMITTED',
      createdAt: now,
      updatedAt: now,
    };

    invoices.set(id, invoice);

    try {
      await publishInvoiceSubmitted(invoice);
    } catch (error) {
      logger.warn('Invoice submitted but event publish failed', {
        invoiceId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(invoice);
  })
);

app.post(
  '/invoices/:id/link-ar',
  createValidationMiddleware(LinkInvoiceToARRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body as LinkInvoiceToARRequest;
    if (id !== body.invoiceId) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Path id and invoiceId payload must match',
      });
      return;
    }

    const invoice = invoices.get(id);
    if (!invoice) {
      throw new NotFoundError(`Invoice not found: ${id}`);
    }

    invoice.status = 'LINKED';
    invoice.arRecordId = body.arRecordId;
    invoice.customerId = body.customerId;
    invoice.updatedAt = new Date();
    invoices.set(invoice.id, invoice);

    try {
      await publishInvoiceLinked(invoice);
    } catch (error) {
      logger.warn('Invoice linked but event publish failed', {
        invoiceId: invoice.id,
        error: (error as Error).message,
      });
    }

    res.status(200).json(invoice);
  })
);

app.get(
  '/invoices/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const invoice = invoices.get(id);
    if (!invoice) {
      throw new NotFoundError(`Invoice not found: ${id}`);
    }

    res.status(200).json(invoice);
  })
);

app.get('/invoices', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(invoices.values()));
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
    logger.info('Invoice service started', { port: PORT });
  });
}

void start();
