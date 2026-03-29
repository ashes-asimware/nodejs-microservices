/**
 * Kafka Infrastructure
 * KafkaJS client factory, producer/consumer wrappers, DLQ handling, and health checks
 */
import { EachBatchPayload, EachMessagePayload, Kafka } from 'kafkajs';
import { EventEnvelope } from '@ach-lockbox/event-types';
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
export declare function createKafkaClient(options: KafkaClientOptions): Kafka;
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
export declare class KafkaProducer {
    private readonly producer;
    private readonly logger;
    private connected;
    constructor(kafkaClient: Kafka, logger: ILogger, options?: ProducerOptions);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publishEvent<T>(topic: string, event: EventEnvelope<T>, key?: string): Promise<ProducedMessage[]>;
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
export declare class KafkaConsumer {
    private readonly consumer;
    private readonly logger;
    private readonly groupId;
    private readonly fromBeginning;
    private connected;
    private subscribed;
    constructor(kafkaClient: Kafka, logger: ILogger, options: ConsumerOptions);
    connect(): Promise<void>;
    subscribe(topics: string[]): Promise<void>;
    run(handler: MessageHandler): Promise<void>;
    runBatch(handler: BatchHandler): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getGroupId(): string;
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
export declare class DLQProducer {
    private readonly producer;
    private readonly logger;
    constructor(producer: KafkaProducer, logger: ILogger);
    sendToDLQ(dlqTopic: string, originalTopic: string, message: EachMessagePayload, reason: string, error?: Error, retryCount?: number): Promise<void>;
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
export declare class KafkaHealthChecker {
    private readonly kafkaClient;
    private readonly logger;
    constructor(kafkaClient: Kafka, logger: ILogger);
    check(requiredTopics?: string[]): Promise<KafkaHealthStatus>;
}
export declare function initializeConsumerGroups(kafkaClient: Kafka, logger: ILogger, consumerGroupDefinitions: Array<{
    groupId: string;
    topics: string[];
}>): Promise<Map<string, KafkaConsumer>>;
