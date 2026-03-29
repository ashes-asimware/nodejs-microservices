/**
 * Event Types and Kafka Configuration
 * Central definitions for event envelope, domain events, and Kafka topology
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// EVENT ENVELOPE
// ============================================================================

/**
 * Standard event envelope for all domain events
 * Enables event sourcing, correlation tracking, and audit trails
 */
export interface EventEnvelope<T = unknown> {
  // Event Identity
  id: string;           // Unique event ID (UUID v4)
  correlationId: string; // Trace ID for distributed tracing
  causationId?: string;  // Previous event that caused this one (event chain)
  
  // Event Classification
  source: string;       // Originating service name
  type: string;         // Event type (e.g., "load.created")
  version: number;      // Event schema version (for evolution)
  
  // Event Metadata
  timestamp: Date;      // When event occurred (ISO 8601)
  entityId: string;     // Primary entity ID (load ID, invoice ID, etc.)
  userId: string;       // User who triggered event
  tenantId?: string;    // Multi-tenant support
  
  // Event Data
  payload: T;           // Domain event data
}

/**
 * Factory to create event envelopes with defaults
 */
export function createEventEnvelope<T>(
  source: string,
  type: string,
  payload: T,
  entityId: string,
  userId: string,
  options?: { correlationId?: string; causationId?: string }
): EventEnvelope<T> {
  return {
    id: uuidv4(),
    correlationId: options?.correlationId || uuidv4(),
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
// DOMAIN EVENT TYPES (17+ Events)
// ============================================================================

// LOAD DOMAIN
export interface LoadCreatedPayload {
  loadId: string;
  carrierId: string;
  shipmentDate: Date;
  pickupLocation: string;
  deliveryLocation: string;
  weightLbs: number;
  miles: number;
  ratePerMile: number;
  totalAmount: number;
}

export interface LoadAssignedPayload {
  loadId: string;
  carrierAssignmentId: string;
  assignedCarrierId: string;
  expectedDeliveryDate: Date;
}

export interface LoadDeliveredPayload {
  loadId: string;
  deliveryDate: Date;
  poNumber?: string;
  deliveryProofId: string;
}

// INVOICE DOMAIN
export interface InvoiceSubmittedPayload {
  invoiceId: string;
  loadId: string;
  carrierId: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: Date;
  dueDate: Date;
  attachmentIds: string[];
}

export interface InvoiceLinkedToARPayload {
  invoiceId: string;
  arRecordId: string;
  customerId: string;
  linkedDate: Date;
}

// FACTORING DOMAIN
export interface FactoringAssignmentPayload {
  factorAssignmentId: string;
  invoiceId: string;
  carrierId: string;
  advancePercentage: number;
  advanceAmount: number;
  assignedDate: Date;
  factorId: string;
}

export interface FactoringAdvanceIssuedPayload {
  factorAssignmentId: string;
  advanceAmount: number;
  discountAmount: number;
  netAdvanceAmount: number;
  advanceDate: Date;
  bankAccountId: string;
}

export interface FactoringSettlementPayload {
  factorAssignmentId: string;
  invoiceId: string;
  settlementAmount: number;
  settlementDate: Date;
  factorDiscount: number;
  carrierId: string;
}

// PAYMENT DOMAIN
export interface PaymentAuthorizedPayload {
  paymentId: string;
  carrierId: string;
  invoiceId?: string;
  amount: number;
  authorizedDate: Date;
  approverUserId: string;
  invoiceNumber?: string;
}

export interface PaymentInitiatedPayload {
  paymentId: string;
  carrierId: string;
  amount: number;
  paymentMethod: 'ACH' | 'EFT' | 'CHECK' | 'WIRE';
  bankAccountId: string;
  initiatedDate: Date;
  expectedSettlementDate: Date;
  referenceNumber: string;
}

export interface PaymentSettledPayload {
  paymentId: string;
  carrierId: string;
  amount: number;
  settlementDate: Date;
  confirmationNumber: string;
  bankReferenceNumber: string;
}

export interface PaymentReceivedPayload {
  paymentId: string;
  customerId: string;
  amount: number;
  receivedDate: Date;
  lockboxFileId: string;
  checkNumber?: string;
}

// FUEL DOMAIN
export interface FuelCardAdvanceIssuedPayload {
  fuelAdvanceId: string;
  carrierId: string;
  amount: number;
  cardNumber: string;
  issueDate: Date;
  expiryDate: Date;
  vendorId: string;
}

export interface FuelChargeSettledPayload {
  fuelAdvanceId: string;
  totalCharges: number;
  chargeDate: Date;
  offsetAmount: number;
  remainingBalance: number;
}

// LOCKBOX DOMAIN
export interface LockboxFileReceivedPayload {
  lockboxFileId: string;
  customerId: string;
  receivedDate: Date;
  fileName: string;
  checkCount: number;
  totalAmount: number;
  bankAccountId: string;
}

export interface LockboxPaymentExtractedPayload {
  lockboxFileId: string;
  checkId: string;
  checkNumber: string;
  checkAmount: number;
  checkDate: Date;
  remitterName: string;
  remitterACH?: string;
  ocrConfidence: number;
}

// RECONCILIATION DOMAIN
export interface PaymentMatchedPayload {
  matchId: string;
  paymentId: string;
  invoiceId: string;
  matchType: 'EXACT' | 'FUZZY' | 'MANUAL';
  matchScore: number; // 0-1 confidence
  matchedDate: Date;
  matcherUserId?: string;
}

export interface ReconciliationCompletedPayload {
  reconciliationRunId: string;
  customerId: string;
  startDate: Date;
  endDate: Date;
  totalItemsProcessed: number;
  itemsMatched: number;
  itemsUnmatched: number;
  compensatingAdjustmentId?: string;
  completedDate: Date;
}

export interface UnmatchedPaymentExceptionPayload {
  exceptionId: string;
  paymentId: string;
  amount: number;
  reason: string;
  createdDate: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

// LEDGER DOMAIN
export interface LedgerEventAppendedPayload {
  eventId: string;
  sequenceNumber: number;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: Record<string, unknown>;
  appendedDate: Date;
}

export interface SnapshotCreatedPayload {
  snapshotId: string;
  aggregateId: string;
  aggregateType: string;
  sequenceNumber: number;
  snapshotData: Record<string, unknown>;
  createdDate: Date;
}

// ACCOUNTING DOMAIN
export interface GLPostingCreatedPayload {
  postingId: string;
  journalEntryId: string;
  accountNumber: string;
  debitAmount?: number;
  creditAmount?: number;
  description: string;
  postingDate: Date;
  entityId: string;
  departmentId?: string;
}

export interface IntercompanySettlementPayload {
  settlementId: string;
  fromEntity: string;
  toEntity: string;
  amount: number;
  settlementDate: Date;
  journalEntryId: string;
  description: string;
}

// ============================================================================
// KAFKA TOPICS CONFIGURATION
// ============================================================================

/**
 * All Kafka topics organized by domain with DLQ variants
 * Format: {domain}.{verb} for standard topics, {topic}.dlq for dead-letter queues
 */
export const TOPICS = {
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
} as const;

/**
 * Type-safe topic values for Kafka operations
 */
export type TopicKey = keyof typeof TOPICS;
export type TopicValue = (typeof TOPICS)[TopicKey];

// ============================================================================
// CONSUMER GROUPS CONFIGURATION
// ============================================================================

/**
 * Kafka consumer groups for event choreography
 * Each service/consumer group subscribes to relevant topics for its domain
 */
export const CONSUMER_GROUPS = {
  // Infrastructure services (subscribe to everything)
  LEDGER_EVENTS: 'ledger-events',               // Event store persistence
  ACCOUNTING_PROJECTIONS: 'accounting-projections', // GL projections
  
  // Domain services (selective subscriptions)
  RECONCILIATION_MATCHERS: 'reconciliation-matchers',   // Match payments to items
  PAYMENT_HANDLERS: 'payment-handlers',            // Handle payment lifecycle
  FACTORING_HANDLERS: 'factoring-handlers',        // Handle factoring assignments
  FUEL_HANDLERS: 'fuel-handlers',                  // Handle fuel card events
  INVOICE_HANDLERS: 'invoice-handlers',            // Handle invoice lifecycle
  LOAD_HANDLERS: 'load-handlers',                  // Handle load events
  
  // Dead-letter queue handler
  DLQ_HANDLER: 'dlq-handler',                     // Process failed messages
} as const;

export type ConsumerGroupKey = keyof typeof CONSUMER_GROUPS;
export type ConsumerGroupValue = (typeof CONSUMER_GROUPS)[ConsumerGroupKey];

// ============================================================================
// CONSUMER SUBSCRIPTIONS (Topic-to-Group Mapping)
// ============================================================================

/**
 * Subscribe each consumer group to relevant topics
 * Used for initialization and documentation
 */
export const CONSUMER_SUBSCRIPTIONS: Record<ConsumerGroupValue, TopicValue[]> = {
  // Ledger service: subscribe to ALL events for immutable event store
  [CONSUMER_GROUPS.LEDGER_EVENTS]: [
    TOPICS.LOAD_CREATED,
    TOPICS.LOAD_ASSIGNED,
    TOPICS.LOAD_DELIVERED,
    TOPICS.INVOICE_SUBMITTED,
    TOPICS.INVOICE_LINKED_TO_AR,
    TOPICS.FACTORING_ASSIGNED,
    TOPICS.FACTORING_ADVANCED,
    TOPICS.FACTORING_SETTLED,
    TOPICS.PAYMENT_AUTHORIZED,
    TOPICS.PAYMENT_INITIATED,
    TOPICS.PAYMENT_SETTLED,
    TOPICS.PAYMENT_RECEIVED,
    TOPICS.FUEL_ADVANCE_ISSUED,
    TOPICS.FUEL_CHARGE_SETTLED,
    TOPICS.LOCKBOX_FILE_RECEIVED,
    TOPICS.LOCKBOX_PAYMENT_EXTRACTED,
    TOPICS.RECONCILIATION_PAYMENT_MATCHED,
    TOPICS.RECONCILIATION_COMPLETED,
  ],
  
  // Accounting service: GL projections from all events
  [CONSUMER_GROUPS.ACCOUNTING_PROJECTIONS]: [
    TOPICS.LOAD_CREATED,
    TOPICS.INVOICE_SUBMITTED,
    TOPICS.FACTORING_ADVANCED,
    TOPICS.FACTORING_SETTLED,
    TOPICS.PAYMENT_AUTHORIZED,
    TOPICS.PAYMENT_INITIATED,
    TOPICS.PAYMENT_SETTLED,
    TOPICS.PAYMENT_RECEIVED,
    TOPICS.FUEL_CHARGE_SETTLED,
    TOPICS.RECONCILIATION_COMPLETED,
    TOPICS.LEDGER_EVENT_APPENDED,
  ],
  
  // Reconciliation service: match payments to invoices
  [CONSUMER_GROUPS.RECONCILIATION_MATCHERS]: [
    TOPICS.PAYMENT_RECEIVED,
    TOPICS.LOCKBOX_PAYMENT_EXTRACTED,
    TOPICS.INVOICE_SUBMITTED,
  ],
  
  // Payment service: handle payment lifecycle
  [CONSUMER_GROUPS.PAYMENT_HANDLERS]: [
    TOPICS.PAYMENT_AUTHORIZED,
    TOPICS.PAYMENT_INITIATED,
    TOPICS.PAYMENT_SETTLED,
    TOPICS.PAYMENT_RECEIVED,
  ],
  
  // Factoring service: handle factoring domain
  [CONSUMER_GROUPS.FACTORING_HANDLERS]: [
    TOPICS.LOAD_CREATED,
    TOPICS.INVOICE_SUBMITTED,
    TOPICS.FACTORING_ASSIGNED,
    TOPICS.FACTORING_ADVANCED,
    TOPICS.FACTORING_SETTLED,
  ],
  
  // Fuel service: handle fuel domain
  [CONSUMER_GROUPS.FUEL_HANDLERS]: [
    TOPICS.FUEL_ADVANCE_ISSUED,
    TOPICS.FUEL_CHARGE_SETTLED,
  ],
  
  // Invoice service: handle invoice lifecycle
  [CONSUMER_GROUPS.INVOICE_HANDLERS]: [
    TOPICS.LOAD_CREATED,
    TOPICS.INVOICE_SUBMITTED,
    TOPICS.INVOICE_LINKED_TO_AR,
  ],
  
  // Load service: handle load lifecycle
  [CONSUMER_GROUPS.LOAD_HANDLERS]: [
    TOPICS.LOAD_CREATED,
    TOPICS.LOAD_ASSIGNED,
    TOPICS.LOAD_DELIVERED,
  ],
  
  // DLQ handler: process all failed messages
  [CONSUMER_GROUPS.DLQ_HANDLER]: [
    TOPICS.LOAD_DLQ,
    TOPICS.INVOICE_DLQ,
    TOPICS.FACTORING_DLQ,
    TOPICS.PAYMENT_DLQ,
    TOPICS.FUEL_DLQ,
    TOPICS.LOCKBOX_DLQ,
    TOPICS.RECONCILIATION_DLQ,
    TOPICS.LEDGER_DLQ,
    TOPICS.ACCOUNTING_DLQ,
  ],
};

// ============================================================================
// EVENT TYPE MAPPING (For Dynamic Event Handling)
// ============================================================================

/**
 * Map event types to their payload interfaces
 * Enables type-safe event deserialization and validation
 */
export const EVENT_TYPES_MAP = {
  'load.created': {} as EventEnvelope<LoadCreatedPayload>,
  'load.assigned': {} as EventEnvelope<LoadAssignedPayload>,
  'load.delivered': {} as EventEnvelope<LoadDeliveredPayload>,
  'invoice.submitted': {} as EventEnvelope<InvoiceSubmittedPayload>,
  'invoice.linked-to-ar': {} as EventEnvelope<InvoiceLinkedToARPayload>,
  'factoring.assigned': {} as EventEnvelope<FactoringAssignmentPayload>,
  'factoring.advanced': {} as EventEnvelope<FactoringAdvanceIssuedPayload>,
  'factoring.settled': {} as EventEnvelope<FactoringSettlementPayload>,
  'payment.authorized': {} as EventEnvelope<PaymentAuthorizedPayload>,
  'payment.initiated': {} as EventEnvelope<PaymentInitiatedPayload>,
  'payment.settled': {} as EventEnvelope<PaymentSettledPayload>,
  'payment.received': {} as EventEnvelope<PaymentReceivedPayload>,
  'fuel.advance-issued': {} as EventEnvelope<FuelCardAdvanceIssuedPayload>,
  'fuel.charge-settled': {} as EventEnvelope<FuelChargeSettledPayload>,
  'lockbox.file-received': {} as EventEnvelope<LockboxFileReceivedPayload>,
  'lockbox.payment-extracted': {} as EventEnvelope<LockboxPaymentExtractedPayload>,
  'reconciliation.payment-matched': {} as EventEnvelope<PaymentMatchedPayload>,
  'reconciliation.completed': {} as EventEnvelope<ReconciliationCompletedPayload>,
  'reconciliation.unmatched-exception': {} as EventEnvelope<UnmatchedPaymentExceptionPayload>,
  'ledger.event-appended': {} as EventEnvelope<LedgerEventAppendedPayload>,
  'ledger.snapshot-created': {} as EventEnvelope<SnapshotCreatedPayload>,
  'accounting.gl-posting': {} as EventEnvelope<GLPostingCreatedPayload>,
  'accounting.intercompany-settlement': {} as EventEnvelope<IntercompanySettlementPayload>,
} as const;

export type EventType = keyof typeof EVENT_TYPES_MAP;
