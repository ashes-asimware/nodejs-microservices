"use strict";
/**
 * Event Types and Kafka Configuration
 * Central definitions for event envelope, domain events, and Kafka topology
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_TYPES_MAP = exports.CONSUMER_SUBSCRIPTIONS = exports.CONSUMER_GROUPS = exports.TOPICS = void 0;
exports.createEventEnvelope = createEventEnvelope;
const uuid_1 = require("uuid");
/**
 * Factory to create event envelopes with defaults
 */
function createEventEnvelope(source, type, payload, entityId, userId, options) {
    return {
        id: (0, uuid_1.v4)(),
        correlationId: options?.correlationId || (0, uuid_1.v4)(),
        causationId: options?.causationId,
        source,
        type,
        version: 1,
        timestamp: new Date(),
        entityId,
        userId,
        payload,
    };
}
// ============================================================================
// KAFKA TOPICS CONFIGURATION
// ============================================================================
/**
 * All Kafka topics organized by domain with DLQ variants
 * Format: {domain}.{verb} for standard topics, {topic}.dlq for dead-letter queues
 */
exports.TOPICS = {
    // Load Domain
    LOAD_CREATED: 'load.created',
    LOAD_ASSIGNED: 'load.assigned',
    LOAD_DELIVERED: 'load.delivered',
    LOAD_DLQ: 'load.dlq',
    // Invoice Domain
    INVOICE_SUBMITTED: 'invoice.submitted',
    INVOICE_LINKED_TO_AR: 'invoice.linked-to-ar',
    INVOICE_DLQ: 'invoice.dlq',
    // Factoring Domain
    FACTORING_ASSIGNED: 'factoring.assigned',
    FACTORING_ADVANCED: 'factoring.advanced',
    FACTORING_SETTLED: 'factoring.settled',
    FACTORING_DLQ: 'factoring.dlq',
    // Payment Domain
    PAYMENT_AUTHORIZED: 'payment.authorized',
    PAYMENT_INITIATED: 'payment.initiated',
    PAYMENT_SETTLED: 'payment.settled',
    PAYMENT_RECEIVED: 'payment.received',
    PAYMENT_DLQ: 'payment.dlq',
    // Fuel Domain
    FUEL_ADVANCE_ISSUED: 'fuel.advance-issued',
    FUEL_CHARGE_SETTLED: 'fuel.charge-settled',
    FUEL_DLQ: 'fuel.dlq',
    // Lockbox Domain
    LOCKBOX_FILE_RECEIVED: 'lockbox.file-received',
    LOCKBOX_PAYMENT_EXTRACTED: 'lockbox.payment-extracted',
    LOCKBOX_DLQ: 'lockbox.dlq',
    // Reconciliation Domain
    RECONCILIATION_PAYMENT_MATCHED: 'reconciliation.payment-matched',
    RECONCILIATION_COMPLETED: 'reconciliation.completed',
    RECONCILIATION_UNMATCHED_EXCEPTION: 'reconciliation.unmatched-exception',
    RECONCILIATION_DLQ: 'reconciliation.dlq',
    // Ledger Domain
    LEDGER_EVENT_APPENDED: 'ledger.event-appended',
    LEDGER_SNAPSHOT_CREATED: 'ledger.snapshot-created',
    LEDGER_DLQ: 'ledger.dlq',
    // Accounting Domain
    ACCOUNTING_GL_POSTING: 'accounting.gl-posting',
    ACCOUNTING_INTERCOMPANY_SETTLEMENT: 'accounting.intercompany-settlement',
    ACCOUNTING_DLQ: 'accounting.dlq',
};
// ============================================================================
// CONSUMER GROUPS CONFIGURATION
// ============================================================================
/**
 * Kafka consumer groups for event choreography
 * Each service/consumer group subscribes to relevant topics for its domain
 */
exports.CONSUMER_GROUPS = {
    // Infrastructure services (subscribe to everything)
    LEDGER_EVENTS: 'ledger-events', // Event store persistence
    ACCOUNTING_PROJECTIONS: 'accounting-projections', // GL projections
    // Domain services (selective subscriptions)
    RECONCILIATION_MATCHERS: 'reconciliation-matchers', // Match payments to items
    PAYMENT_HANDLERS: 'payment-handlers', // Handle payment lifecycle
    FACTORING_HANDLERS: 'factoring-handlers', // Handle factoring assignments
    FUEL_HANDLERS: 'fuel-handlers', // Handle fuel card events
    INVOICE_HANDLERS: 'invoice-handlers', // Handle invoice lifecycle
    LOAD_HANDLERS: 'load-handlers', // Handle load events
    // Dead-letter queue handler
    DLQ_HANDLER: 'dlq-handler', // Process failed messages
};
// ============================================================================
// CONSUMER SUBSCRIPTIONS (Topic-to-Group Mapping)
// ============================================================================
/**
 * Subscribe each consumer group to relevant topics
 * Used for initialization and documentation
 */
exports.CONSUMER_SUBSCRIPTIONS = {
    // Ledger service: subscribe to ALL events for immutable event store
    [exports.CONSUMER_GROUPS.LEDGER_EVENTS]: [
        exports.TOPICS.LOAD_CREATED,
        exports.TOPICS.LOAD_ASSIGNED,
        exports.TOPICS.LOAD_DELIVERED,
        exports.TOPICS.INVOICE_SUBMITTED,
        exports.TOPICS.INVOICE_LINKED_TO_AR,
        exports.TOPICS.FACTORING_ASSIGNED,
        exports.TOPICS.FACTORING_ADVANCED,
        exports.TOPICS.FACTORING_SETTLED,
        exports.TOPICS.PAYMENT_AUTHORIZED,
        exports.TOPICS.PAYMENT_INITIATED,
        exports.TOPICS.PAYMENT_SETTLED,
        exports.TOPICS.PAYMENT_RECEIVED,
        exports.TOPICS.FUEL_ADVANCE_ISSUED,
        exports.TOPICS.FUEL_CHARGE_SETTLED,
        exports.TOPICS.LOCKBOX_FILE_RECEIVED,
        exports.TOPICS.LOCKBOX_PAYMENT_EXTRACTED,
        exports.TOPICS.RECONCILIATION_PAYMENT_MATCHED,
        exports.TOPICS.RECONCILIATION_COMPLETED,
    ],
    // Accounting service: GL projections from all events
    [exports.CONSUMER_GROUPS.ACCOUNTING_PROJECTIONS]: [
        exports.TOPICS.LOAD_CREATED,
        exports.TOPICS.INVOICE_SUBMITTED,
        exports.TOPICS.FACTORING_ADVANCED,
        exports.TOPICS.FACTORING_SETTLED,
        exports.TOPICS.PAYMENT_AUTHORIZED,
        exports.TOPICS.PAYMENT_INITIATED,
        exports.TOPICS.PAYMENT_SETTLED,
        exports.TOPICS.PAYMENT_RECEIVED,
        exports.TOPICS.FUEL_CHARGE_SETTLED,
        exports.TOPICS.RECONCILIATION_COMPLETED,
        exports.TOPICS.LEDGER_EVENT_APPENDED,
    ],
    // Reconciliation service: match payments to invoices
    [exports.CONSUMER_GROUPS.RECONCILIATION_MATCHERS]: [
        exports.TOPICS.PAYMENT_RECEIVED,
        exports.TOPICS.LOCKBOX_PAYMENT_EXTRACTED,
        exports.TOPICS.INVOICE_SUBMITTED,
    ],
    // Payment service: handle payment lifecycle
    [exports.CONSUMER_GROUPS.PAYMENT_HANDLERS]: [
        exports.TOPICS.PAYMENT_AUTHORIZED,
        exports.TOPICS.PAYMENT_INITIATED,
        exports.TOPICS.PAYMENT_SETTLED,
        exports.TOPICS.PAYMENT_RECEIVED,
    ],
    // Factoring service: handle factoring domain
    [exports.CONSUMER_GROUPS.FACTORING_HANDLERS]: [
        exports.TOPICS.LOAD_CREATED,
        exports.TOPICS.INVOICE_SUBMITTED,
        exports.TOPICS.FACTORING_ASSIGNED,
        exports.TOPICS.FACTORING_ADVANCED,
        exports.TOPICS.FACTORING_SETTLED,
    ],
    // Fuel service: handle fuel domain
    [exports.CONSUMER_GROUPS.FUEL_HANDLERS]: [
        exports.TOPICS.FUEL_ADVANCE_ISSUED,
        exports.TOPICS.FUEL_CHARGE_SETTLED,
    ],
    // Invoice service: handle invoice lifecycle
    [exports.CONSUMER_GROUPS.INVOICE_HANDLERS]: [
        exports.TOPICS.LOAD_CREATED,
        exports.TOPICS.INVOICE_SUBMITTED,
        exports.TOPICS.INVOICE_LINKED_TO_AR,
    ],
    // Load service: handle load lifecycle
    [exports.CONSUMER_GROUPS.LOAD_HANDLERS]: [
        exports.TOPICS.LOAD_CREATED,
        exports.TOPICS.LOAD_ASSIGNED,
        exports.TOPICS.LOAD_DELIVERED,
    ],
    // DLQ handler: process all failed messages
    [exports.CONSUMER_GROUPS.DLQ_HANDLER]: [
        exports.TOPICS.LOAD_DLQ,
        exports.TOPICS.INVOICE_DLQ,
        exports.TOPICS.FACTORING_DLQ,
        exports.TOPICS.PAYMENT_DLQ,
        exports.TOPICS.FUEL_DLQ,
        exports.TOPICS.LOCKBOX_DLQ,
        exports.TOPICS.RECONCILIATION_DLQ,
        exports.TOPICS.LEDGER_DLQ,
        exports.TOPICS.ACCOUNTING_DLQ,
    ],
};
// ============================================================================
// EVENT TYPE MAPPING (For Dynamic Event Handling)
// ============================================================================
/**
 * Map event types to their payload interfaces
 * Enables type-safe event deserialization and validation
 */
exports.EVENT_TYPES_MAP = {
    'load.created': {},
    'load.assigned': {},
    'load.delivered': {},
    'invoice.submitted': {},
    'invoice.linked-to-ar': {},
    'factoring.assigned': {},
    'factoring.advanced': {},
    'factoring.settled': {},
    'payment.authorized': {},
    'payment.initiated': {},
    'payment.settled': {},
    'payment.received': {},
    'fuel.advance-issued': {},
    'fuel.charge-settled': {},
    'lockbox.file-received': {},
    'lockbox.payment-extracted': {},
    'reconciliation.payment-matched': {},
    'reconciliation.completed': {},
    'reconciliation.unmatched-exception': {},
    'ledger.event-appended': {},
    'ledger.snapshot-created': {},
    'accounting.gl-posting': {},
    'accounting.intercompany-settlement': {},
};
//# sourceMappingURL=index.js.map