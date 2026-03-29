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
  CreateLoadRequest,
  CreateLoadRequestSchema,
  UpdateLoadStatusRequestSchema,
} from '@ach-lockbox/validation';
import {
  createEventEnvelope,
  LoadCreatedPayload,
  TOPICS,
} from '@ach-lockbox/event-types';
import { createKafkaClient, KafkaProducer } from '@ach-lockbox/kafka';

const SERVICE_NAME = 'load-service';
const PORT = Number(process.env.PORT || 3020);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

type LoadStatus = 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

interface LoadRecord {
  id: string;
  carrierId: string;
  shipmentDate: Date;
  pickupLocation: string;
  deliveryLocation: string;
  weightLbs: number;
  miles: number;
  ratePerMile: number;
  totalAmount: number;
  status: LoadStatus;
  createdAt: Date;
  updatedAt: Date;
}

const loads = new Map<string, LoadRecord>();

const kafka = createKafkaClient({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: SERVICE_NAME,
});
const producer = new KafkaProducer(kafka, logger);
let kafkaReady = false;

async function publishLoadCreated(load: LoadRecord): Promise<void> {
  if (!kafkaReady) {
    return;
  }

  const payload: LoadCreatedPayload = {
    loadId: load.id,
    carrierId: load.carrierId,
    shipmentDate: load.shipmentDate,
    pickupLocation: load.pickupLocation,
    deliveryLocation: load.deliveryLocation,
    weightLbs: load.weightLbs,
    miles: load.miles,
    ratePerMile: load.ratePerMile,
    totalAmount: load.totalAmount,
  };

  const event = createEventEnvelope(
    SERVICE_NAME,
    TOPICS.LOAD_CREATED,
    payload,
    load.id,
    'system',
    { correlationId: uuidv4() }
  );

  await producer.publishEvent(TOPICS.LOAD_CREATED, event, load.id);
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
      totalLoads: loads.size,
    },
  });
});

app.post(
  '/loads',
  createValidationMiddleware(CreateLoadRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateLoadRequest;

    const id = uuidv4();
    const now = new Date();
    const load: LoadRecord = {
      id,
      carrierId: body.carrierId,
      shipmentDate: body.shipmentDate,
      pickupLocation: body.pickupLocation,
      deliveryLocation: body.deliveryLocation,
      weightLbs: body.weightLbs,
      miles: body.miles,
      ratePerMile: body.ratePerMile,
      totalAmount: Math.round(body.miles * body.ratePerMile),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    loads.set(id, load);

    try {
      await publishLoadCreated(load);
    } catch (error) {
      logger.warn('Load created but event publish failed', {
        loadId: id,
        error: (error as Error).message,
      });
    }

    res.status(201).json(load);
  })
);

app.get(
  '/loads/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const load = loads.get(id);
    if (!load) {
      throw new NotFoundError(`Load not found: ${id}`);
    }

    res.status(200).json(load);
  })
);

app.patch(
  '/loads/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const parsed = UpdateLoadStatusRequestSchema.safeParse({
      ...req.body,
      loadId: id,
    });

    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((issue: { message: string }) => issue.message).join(', '),
      });
      return;
    }

    const current = loads.get(id);
    if (!current) {
      throw new NotFoundError(`Load not found: ${id}`);
    }

    current.status = parsed.data.status;
    current.updatedAt = new Date();
    loads.set(current.id, current);

    res.status(200).json(current);
  })
);

app.get('/loads', (_req: Request, res: Response) => {
  res.status(200).json(Array.from(loads.values()));
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
    logger.info('Load service started', { port: PORT });
  });
}

void start();
