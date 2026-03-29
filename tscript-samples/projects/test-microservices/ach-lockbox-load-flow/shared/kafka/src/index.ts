/**
 * Kafka Infrastructure
 * KafkaJS client factory, producer/consumer wrappers, DLQ handling, and health checks
 */

import {
  Consumer,
  ConsumerConfig,
  EachBatchPayload,
  EachMessagePayload,
  Kafka,
  KafkaConfig,
  Producer,
  ProducerConfig,
  ProducerRecord,
  logLevel,
} from 'kafkajs';
import { EventEnvelope } from '@ach-lockbox/event-types'
import { KafkaError } from '@ach-lockbox/error-taxonomy';
import { ILogger } from '@ach-lockbox/logger';

export interface KafkaClientOptions {
  brokers: string[];
  clientId: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  logLevel?: 'NOTHING' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
}

function resolveLogLevel(level?: KafkaClientOptions['logLevel']): logLevel {
  switch (level) {
    case 'NOTHING':
      return logLevel.NOTHING;
    case 'ERROR':
      return logLevel.ERROR;
    case 'INFO':
      return logLevel.INFO;
    case 'DEBUG':
      return logLevel.DEBUG;
    case 'WARN':
    default:
      return logLevel.WARN;
  }
}

export function createKafkaClient(options: KafkaClientOptions): Kafka {
  const kafkaConfig: KafkaConfig = {
    clientId: options.clientId,
    brokers: options.brokers,
    connectionTimeout: options.connectionTimeout ?? 10000,
    requestTimeout: options.requestTimeout ?? 30000,
    ssl: options.ssl ?? false,
    logLevel: resolveLogLevel(options.logLevel),
    retry: {
      initialRetryTime: 100,
      retries: 8,
      maxRetryTime: 30000,
    },
  };

  if (options.sasl) {
    if (options.sasl.mechanism === 'plain') {
      kafkaConfig.sasl = {
        mechanism: 'plain',
        username: options.sasl.username,
        password: options.sasl.password,
      };
    }
    if (options.sasl.mechanism === 'scram-sha-256') {
      kafkaConfig.sasl = {
        mechanism: 'scram-sha-256',
        username: options.sasl.username,
        password: options.sasl.password,
      };
    }
    if (options.sasl.mechanism === 'scram-sha-512') {
      kafkaConfig.sasl = {
        mechanism: 'scram-sha-512',
        username: options.sasl.username,
        password: options.sasl.password,
      };
    }
  }

  return new Kafka(kafkaConfig);
}

export interface ProducerOptions {
  allowAutoTopicCreation?: boolean;
  maxInFlightRequests?: number;
  idempotent?: boolean;
  transactionTimeout?: number;
  retry?: {
    maxRetryTime?: number;
    initialRetryTime?: number;
    retries?: number;
  };
}

export interface ProducedMessage {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
}

export class KafkaProducer {
  private readonly producer: Producer;
  private readonly logger: ILogger;
  private connected = false;

  constructor(kafkaClient: Kafka, logger: ILogger, options?: ProducerOptions) {
    this.logger = logger;

    const producerConfig: ProducerConfig = {
      allowAutoTopicCreation: options?.allowAutoTopicCreation ?? true,
      maxInFlightRequests: options?.maxInFlightRequests,
      idempotent: options?.idempotent ?? true,
      transactionTimeout: options?.transactionTimeout,
      retry: {
        maxRetryTime: options?.retry?.maxRetryTime,
        initialRetryTime: options?.retry?.initialRetryTime,
        retries: options?.retry?.retries,
      },
    };

    this.producer = kafkaClient.producer(producerConfig);
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.info('Kafka producer connected');
    } catch (error) {
      throw new KafkaError('Failed to connect Kafka producer', error as Error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.producer.disconnect();
      this.connected = false;
      this.logger.info('Kafka producer disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', error as Error);
    }
  }

  async publishEvent<T>(topic: string, event: EventEnvelope<T>, key?: string): Promise<ProducedMessage[]> {
    if (!this.connected) {
      throw new KafkaError('Producer not connected');
    }

    const record: ProducerRecord = {
      topic,
      messages: [
        {
          key: key || event.entityId,
          value: JSON.stringify(event),
          headers: {
            'correlation-id': event.correlationId,
            'event-id': event.id,
            'event-type': event.type,
            timestamp: event.timestamp.toISOString(),
          },
        },
      ],
    };

    try {
      const result = await this.producer.send(record);
      return result.map((row) => ({
        topic,
        partition: row.partition,
        offset: row.offset || '0',
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      throw new KafkaError(`Failed to publish event to topic "${topic}"`, error as Error);
    }
  }
}

export interface ConsumerOptions {
  groupId: string;
  fromBeginning?: boolean;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  rebalanceTimeout?: number;
  allowAutoTopicCreation?: boolean;
}

export type MessageHandler<T = unknown> = (payload: EachMessagePayload, event: EventEnvelope<T>) => Promise<void>;
export type BatchHandler = (payload: EachBatchPayload) => Promise<void>;

export class KafkaConsumer {
  private readonly consumer: Consumer;
  private readonly logger: ILogger;
  private readonly groupId: string;
  private readonly fromBeginning: boolean;
  private connected = false;
  private subscribed = false;

  constructor(kafkaClient: Kafka, logger: ILogger, options: ConsumerOptions) {
    this.logger = logger;
    this.groupId = options.groupId;
    this.fromBeginning = options.fromBeginning ?? false;

    const consumerConfig: ConsumerConfig = {
      groupId: options.groupId,
      sessionTimeout: options.sessionTimeout ?? 30000,
      heartbeatInterval: options.heartbeatInterval ?? 3000,
      rebalanceTimeout: options.rebalanceTimeout ?? 60000,
      allowAutoTopicCreation: options.allowAutoTopicCreation ?? true,
    };

    this.consumer = kafkaClient.consumer(consumerConfig);
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.consumer.connect();
      this.connected = true;
      this.logger.info('Kafka consumer connected', { groupId: this.groupId });
    } catch (error) {
      throw new KafkaError('Failed to connect Kafka consumer', error as Error);
    }
  }

  async subscribe(topics: string[]): Promise<void> {
    if (!this.connected) {
      throw new KafkaError('Consumer not connected');
    }

    if (this.subscribed) {
      throw new KafkaError('Consumer already subscribed');
    }

    try {
      for (const topic of topics) {
        await this.consumer.subscribe({ topic, fromBeginning: this.fromBeginning });
      }
      this.subscribed = true;
      this.logger.info('Consumer subscribed', { groupId: this.groupId, topics });
    } catch (error) {
      throw new KafkaError('Failed to subscribe to topics', error as Error);
    }
  }

  async run(handler: MessageHandler): Promise<void> {
    if (!this.connected || !this.subscribed) {
      throw new KafkaError('Consumer not ready');
    }

    try {
      await this.consumer.run({
        eachMessage: async (payload) => {
          const raw = payload.message.value?.toString();
          if (!raw) {
            return;
          }

          const event = JSON.parse(raw) as EventEnvelope;
          await handler(payload, event);
        },
      });
    } catch (error) {
      throw new KafkaError('Consumer run failed', error as Error);
    }
  }

  async runBatch(handler: BatchHandler): Promise<void> {
    if (!this.connected || !this.subscribed) {
      throw new KafkaError('Consumer not ready');
    }

    try {
      await this.consumer.run({ eachBatch: handler });
    } catch (error) {
      throw new KafkaError('Batch consumer run failed', error as Error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.consumer.disconnect();
      this.connected = false;
      this.subscribed = false;
      this.logger.info('Kafka consumer disconnected', { groupId: this.groupId });
    } catch (error) {
      this.logger.error('Error disconnecting Kafka consumer', error as Error);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getGroupId(): string {
    return this.groupId;
  }
}

export interface DLQMessage {
  originalTopic: string;
  originalOffset: string;
  originalPartition: number;
  originalKey?: string;
  originalValue: string;
  reason: string;
  error?: string;
  timestamp: Date;
  retryCount: number;
  headers: Record<string, string>;
}

export class DLQProducer {
  constructor(private readonly producer: KafkaProducer, private readonly logger: ILogger) {}

  async sendToDLQ(
    dlqTopic: string,
    originalTopic: string,
    message: EachMessagePayload,
    reason: string,
    error?: Error,
    retryCount: number = 0
  ): Promise<void> {
    const dlqMessage: DLQMessage = {
      originalTopic,
      originalOffset: message.message.offset,
      originalPartition: message.partition,
      originalKey: message.message.key?.toString(),
      originalValue: message.message.value?.toString() || '',
      reason,
      error: error?.message,
      timestamp: new Date(),
      retryCount,
      headers: Object.entries(message.message.headers || {}).reduce<Record<string, string>>(
        (acc, [key, value]) => {
          acc[key] = Buffer.isBuffer(value) ? value.toString() : String(value);
          return acc;
        },
        {}
      ),
    };

    const event = {
      id: `dlq-${Date.now()}`,
      correlationId: dlqMessage.headers['correlation-id'] || 'unknown',
      source: 'dlq-producer',
      type: 'dlq.message.failed',
      version: 1,
      timestamp: new Date(),
      entityId: dlqMessage.originalKey || 'unknown',
      userId: 'system',
      payload: dlqMessage,
    } as EventEnvelope<DLQMessage>;

    try {
      await this.producer.publishEvent(dlqTopic, event, dlqMessage.originalKey);
    } catch (publishError) {
      this.logger.error('Failed to send message to DLQ', publishError as Error, {
        dlqTopic,
        originalTopic,
        reason,
      });
    }
  }
}

export interface KafkaHealthStatus {
  healthy: boolean;
  brokers: {
    connected: number;
    total: number;
  };
  topicsReady: string[];
  topicsMissing: string[];
}

export class KafkaHealthChecker {
  constructor(private readonly kafkaClient: Kafka, private readonly logger: ILogger) {}

  async check(requiredTopics: string[] = []): Promise<KafkaHealthStatus> {
    const admin = this.kafkaClient.admin();
    try {
      await admin.connect();
      const cluster = await admin.describeCluster();
      const allTopics = await admin.listTopics();

      const topicsReady = requiredTopics.filter((topic) => allTopics.includes(topic));
      const topicsMissing = requiredTopics.filter((topic) => !allTopics.includes(topic));

      return {
        healthy: cluster.brokers.length > 0 && topicsMissing.length === 0,
        brokers: {
          connected: cluster.brokers.length,
          total: cluster.brokers.length,
        },
        topicsReady,
        topicsMissing,
      };
    } catch (error) {
      this.logger.error('Kafka health check failed', error as Error);
      return {
        healthy: false,
        brokers: { connected: 0, total: 0 },
        topicsReady: [],
        topicsMissing: requiredTopics,
      };
    } finally {
      await admin.disconnect();
    }
  }
}

export async function initializeConsumerGroups(
  kafkaClient: Kafka,
  logger: ILogger,
  consumerGroupDefinitions: Array<{ groupId: string; topics: string[] }>
): Promise<Map<string, KafkaConsumer>> {
  const consumers = new Map<string, KafkaConsumer>();

  try {
    for (const definition of consumerGroupDefinitions) {
      const consumer = new KafkaConsumer(kafkaClient, logger, {
        groupId: definition.groupId,
      });

      await consumer.connect();
      await consumer.subscribe(definition.topics);
      consumers.set(definition.groupId, consumer);
    }

    return consumers;
  } catch (error) {
    for (const consumer of consumers.values()) {
      await consumer.disconnect();
    }
    throw new KafkaError('Failed to initialize consumer groups', error as Error);
  }
}
