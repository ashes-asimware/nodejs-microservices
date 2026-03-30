"use strict";
/**
 * Kafka Infrastructure
 * KafkaJS client factory, producer/consumer wrappers, DLQ handling, and health checks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KafkaHealthChecker = exports.DLQProducer = exports.KafkaConsumer = exports.KafkaProducer = void 0;
exports.createKafkaClient = createKafkaClient;
exports.initializeConsumerGroups = initializeConsumerGroups;
const kafkajs_1 = require("kafkajs");
const error_taxonomy_1 = require("@ach-lockbox/error-taxonomy");
function resolveLogLevel(level) {
    switch (level) {
        case 'NOTHING':
            return kafkajs_1.logLevel.NOTHING;
        case 'ERROR':
            return kafkajs_1.logLevel.ERROR;
        case 'INFO':
            return kafkajs_1.logLevel.INFO;
        case 'DEBUG':
            return kafkajs_1.logLevel.DEBUG;
        case 'WARN':
        default:
            return kafkajs_1.logLevel.WARN;
    }
}
function createKafkaClient(options) {
    const kafkaConfig = {
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
    return new kafkajs_1.Kafka(kafkaConfig);
}
class KafkaProducer {
    constructor(kafkaClient, logger, options) {
        this.connected = false;
        this.logger = logger;
        const producerConfig = {
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
    async connect() {
        if (this.connected) {
            return;
        }
        try {
            await this.producer.connect();
            this.connected = true;
            this.logger.info('Kafka producer connected');
        }
        catch (error) {
            throw new error_taxonomy_1.KafkaError('Failed to connect Kafka producer', error);
        }
    }
    async disconnect() {
        if (!this.connected) {
            return;
        }
        try {
            await this.producer.disconnect();
            this.connected = false;
            this.logger.info('Kafka producer disconnected');
        }
        catch (error) {
            this.logger.error('Error disconnecting Kafka producer', error);
        }
    }
    async publishEvent(topic, event, key) {
        if (!this.connected) {
            throw new error_taxonomy_1.KafkaError('Producer not connected');
        }
        const record = {
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
        }
        catch (error) {
            throw new error_taxonomy_1.KafkaError(`Failed to publish event to topic "${topic}"`, error);
        }
    }
}
exports.KafkaProducer = KafkaProducer;
class KafkaConsumer {
    constructor(kafkaClient, logger, options) {
        this.connected = false;
        this.subscribed = false;
        this.logger = logger;
        this.groupId = options.groupId;
        this.fromBeginning = options.fromBeginning ?? false;
        const consumerConfig = {
            groupId: options.groupId,
            sessionTimeout: options.sessionTimeout ?? 30000,
            heartbeatInterval: options.heartbeatInterval ?? 3000,
            rebalanceTimeout: options.rebalanceTimeout ?? 60000,
            allowAutoTopicCreation: options.allowAutoTopicCreation ?? true,
        };
        this.consumer = kafkaClient.consumer(consumerConfig);
    }
    async connect() {
        if (this.connected) {
            return;
        }
        try {
            await this.consumer.connect();
            this.connected = true;
            this.logger.info('Kafka consumer connected', { groupId: this.groupId });
        }
        catch (error) {
            throw new error_taxonomy_1.KafkaError('Failed to connect Kafka consumer', error);
        }
    }
    async subscribe(topics) {
        if (!this.connected) {
            throw new error_taxonomy_1.KafkaError('Consumer not connected');
        }
        if (this.subscribed) {
            throw new error_taxonomy_1.KafkaError('Consumer already subscribed');
        }
        try {
            for (const topic of topics) {
                await this.consumer.subscribe({ topic, fromBeginning: this.fromBeginning });
            }
            this.subscribed = true;
            this.logger.info('Consumer subscribed', { groupId: this.groupId, topics });
        }
        catch (error) {
            throw new error_taxonomy_1.KafkaError('Failed to subscribe to topics', error);
        }
    }
    async run(handler) {
        if (!this.connected || !this.subscribed) {
            throw new error_taxonomy_1.KafkaError('Consumer not ready');
        }
        try {
            await this.consumer.run({
                eachMessage: async (payload) => {
                    const raw = payload.message.value?.toString();
                    if (!raw) {
                        return;
                    }
                    const event = JSON.parse(raw);
                    await handler(payload, event);
                },
            });
        }
        catch (error) {
            throw new error_taxonomy_1.KafkaError('Consumer run failed', error);
        }
    }
    async runBatch(handler) {
        if (!this.connected || !this.subscribed) {
            throw new error_taxonomy_1.KafkaError('Consumer not ready');
        }
        try {
            await this.consumer.run({ eachBatch: handler });
        }
        catch (error) {
            throw new error_taxonomy_1.KafkaError('Batch consumer run failed', error);
        }
    }
    async disconnect() {
        if (!this.connected) {
            return;
        }
        try {
            await this.consumer.disconnect();
            this.connected = false;
            this.subscribed = false;
            this.logger.info('Kafka consumer disconnected', { groupId: this.groupId });
        }
        catch (error) {
            this.logger.error('Error disconnecting Kafka consumer', error);
        }
    }
    isConnected() {
        return this.connected;
    }
    getGroupId() {
        return this.groupId;
    }
}
exports.KafkaConsumer = KafkaConsumer;
class DLQProducer {
    constructor(producer, logger) {
        this.producer = producer;
        this.logger = logger;
    }
    async sendToDLQ(dlqTopic, originalTopic, message, reason, error, retryCount = 0) {
        const dlqMessage = {
            originalTopic,
            originalOffset: message.message.offset,
            originalPartition: message.partition,
            originalKey: message.message.key?.toString(),
            originalValue: message.message.value?.toString() || '',
            reason,
            error: error?.message,
            timestamp: new Date(),
            retryCount,
            headers: Object.entries(message.message.headers || {}).reduce((acc, [key, value]) => {
                acc[key] = Buffer.isBuffer(value) ? value.toString() : String(value);
                return acc;
            }, {}),
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
        };
        try {
            await this.producer.publishEvent(dlqTopic, event, dlqMessage.originalKey);
        }
        catch (publishError) {
            this.logger.error('Failed to send message to DLQ', publishError, {
                dlqTopic,
                originalTopic,
                reason,
            });
        }
    }
}
exports.DLQProducer = DLQProducer;
class KafkaHealthChecker {
    constructor(kafkaClient, logger) {
        this.kafkaClient = kafkaClient;
        this.logger = logger;
    }
    async check(requiredTopics = []) {
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
        }
        catch (error) {
            this.logger.error('Kafka health check failed', error);
            return {
                healthy: false,
                brokers: { connected: 0, total: 0 },
                topicsReady: [],
                topicsMissing: requiredTopics,
            };
        }
        finally {
            await admin.disconnect();
        }
    }
}
exports.KafkaHealthChecker = KafkaHealthChecker;
async function initializeConsumerGroups(kafkaClient, logger, consumerGroupDefinitions) {
    const consumers = new Map();
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
    }
    catch (error) {
        for (const consumer of consumers.values()) {
            await consumer.disconnect();
        }
        throw new error_taxonomy_1.KafkaError('Failed to initialize consumer groups', error);
    }
}
//# sourceMappingURL=index.js.map