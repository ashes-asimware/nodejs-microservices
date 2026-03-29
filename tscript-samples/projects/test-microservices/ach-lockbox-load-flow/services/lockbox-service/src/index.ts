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
  ProcessLockboxFileRequest,
  ProcessLockboxFileRequestSchema,
  ExtractLockboxPaymentRequest,
  ExtractLockboxPaymentRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  LockboxFileReceivedPayload,
  LockboxPaymentExtractedPayload,
  TOPICS,
} from '@ach-lockbox/event-types';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';

const SERVICE_NAME = 'lockbox-service';
const PORT = Number(process.env.PORT || 3025);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

type LockboxFileStatus = 'RECEIVED' | 'PROCESSING' | 'COMPLETE';

interface LockboxFileRecord {
  id: string;
  customerId: string;
  fileName: string;
  checkCount: number;
  totalAmount: number;
  bankAccountId: string;
  receivedDate: Date;
  status: LockboxFileStatus;
  extractionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface LockboxExtractionRecord {
  id: string;
  lockboxFileId: string;
  checkId: string;
  checkNumber: string;
  checkAmount: number;
  checkDate: Date;
  remitterName: string;
  remitterACH?: string;
  ocrConfidence: number;
  createdAt: Date;
}

const lockboxFiles = new Map<string, LockboxFileRecord>();
const extractions = new Map<string, LockboxExtractionRecord[]>();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});
const producer = new KafkaProducer(kafka, logger);
let kafkaReady = false;

async function publishFileReceived(file: LockboxFileRecord): Promise<void> {
  if (!kafkaReady) return;

  const payload: LockboxFileReceivedPayload = {
    lockboxFileId: file.id,
    customerId: file.customerId,
    receivedDate: file.receivedDate,
    fileName: file.fileName,
    checkCount: file.checkCount,
    totalAmount: file.totalAmount,
    bankAccountId: file.bankAccountId,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.LOCKBOX_FILE_RECEIVED,
    payload,
    file.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.LOCKBOX_FILE_RECEIVED, event, file.id);
}

async function publishPaymentExtracted(extraction: LockboxExtractionRecord): Promise<void> {
  if (!kafkaReady) return;

  const payload: LockboxPaymentExtractedPayload = {
    lockboxFileId: extraction.lockboxFileId,
    checkId: extraction.checkId,
    checkNumber: extraction.checkNumber,
    checkAmount: extraction.checkAmount,
    checkDate: extraction.checkDate,
    remitterName: extraction.remitterName,
    remitterACH: extraction.remitterACH,
    ocrConfidence: extraction.ocrConfidence,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.LOCKBOX_PAYMENT_EXTRACTED,
    payload,
    extraction.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.LOCKBOX_PAYMENT_EXTRACTED, event, extraction.id);
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
      totalFiles: lockboxFiles.size,
      totalExtractions: Array.from(extractions.values()).reduce((s, e) => s + e.length, 0),
    },
  });
});

// Activity 11: Lockbox Image-Only Flow — bank sends check/remittance images
app.post(
  '/lockbox/files',
  createValidationMiddleware(ProcessLockboxFileRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as ProcessLockboxFileRequest;
    const id = uuidv4();
    const now = new Date();

    const file: LockboxFileRecord = {
      id,
      customerId: body.customerId,
      fileName: body.fileName,
      checkCount: body.checkCount,
      totalAmount: body.totalAmount,
      bankAccountId: body.bankAccountId,
      receivedDate: now,
      status: 'RECEIVED',
      extractionCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    lockboxFiles.set(id, file);
    extractions.set(id, []);

    try {
      await publishFileReceived(file);
    } catch (error) {
      logger.warn('Lockbox file received but event publish failed', {
        fileId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(file);
  })
);

// Activity 11 (continued) / Activity 12 setup — ML OCR extraction of each check
app.post(
  '/lockbox/files/:id/extractions',
  createValidationMiddleware(ExtractLockboxPaymentRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const fileId = String(req.params.id);
    const body = req.body as ExtractLockboxPaymentRequest;
    const file = lockboxFiles.get(fileId);
    if (!file) throw new NotFoundError(`Lockbox file not found: ${fileId}`);

    const extractionId = uuidv4();
    const extraction: LockboxExtractionRecord = {
      id: extractionId,
      lockboxFileId: fileId,
      checkId: uuidv4(),
      checkNumber: body.checkNumber,
      checkAmount: body.amount,
      checkDate: body.checkDate,
      remitterName: body.remitterName,
      ocrConfidence: body.ocrConfidence,
      createdAt: new Date(),
    };

    const fileExtractions = extractions.get(fileId) ?? [];
    fileExtractions.push(extraction);
    extractions.set(fileId, fileExtractions);

    file.extractionCount = fileExtractions.length;
    if (file.extractionCount >= file.checkCount) {
      file.status = 'COMPLETE';
    } else {
      file.status = 'PROCESSING';
    }
    file.updatedAt = new Date();
    lockboxFiles.set(fileId, file);

    try {
      await publishPaymentExtracted(extraction);
    } catch (error) {
      logger.warn('Lockbox payment extracted but event publish failed', {
        extractionId,
        error: (error as Error).message,
      });
    }

    res.status(201).json(extraction);
  })
);

app.get(
  '/lockbox/files/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const file = lockboxFiles.get(id);
    if (!file) throw new NotFoundError(`Lockbox file not found: ${id}`);
    res.status(200).json({ ...file, extractions: extractions.get(id) ?? [] });
  })
);

app.get('/lockbox/files', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(lockboxFiles.values()));
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
    logger.info('Lockbox service started', { port: PORT });
  });
}

void start();
