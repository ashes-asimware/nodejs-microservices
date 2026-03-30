/**
 * Event Types and Kafka Configuration
 * Central definitions for event envelope, domain events, and Kafka topology
 */
/**
 * Standard event envelope for all domain events
 * Enables event sourcing, correlation tracking, and audit trails
 */
export interface EventEnvelope<T = unknown> {
    id: string;
    correlationId: string;
    causationId?: string;
    source: string;
    type: string;
    version: number;
    timestamp: Date;
    entityId: string;
    userId: string;
    tenantId?: string;
    payload: T;
}
/**
 * Factory to create event envelopes with defaults
 */
export declare function createEventEnvelope<T>(source: string, type: string, payload: T, entityId: string, userId: string, options?: {
    correlationId?: string;
    causationId?: string;
}): EventEnvelope<T>;
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
export interface PaymentMatchedPayload {
    matchId: string;
    paymentId: string;
    invoiceId: string;
    matchType: 'EXACT' | 'FUZZY' | 'MANUAL';
    matchScore: number;
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
/**
 * All Kafka topics organized by domain with DLQ variants
 * Format: {domain}.{verb} for standard topics, {topic}.dlq for dead-letter queues
 */
export declare const TOPICS: {
    readonly LOAD_CREATED: "load.created";
    readonly LOAD_ASSIGNED: "load.assigned";
    readonly LOAD_DELIVERED: "load.delivered";
    readonly LOAD_DLQ: "load.dlq";
    readonly INVOICE_SUBMITTED: "invoice.submitted";
    readonly INVOICE_LINKED_TO_AR: "invoice.linked-to-ar";
    readonly INVOICE_DLQ: "invoice.dlq";
    readonly FACTORING_ASSIGNED: "factoring.assigned";
    readonly FACTORING_ADVANCED: "factoring.advanced";
    readonly FACTORING_SETTLED: "factoring.settled";
    readonly FACTORING_DLQ: "factoring.dlq";
    readonly PAYMENT_AUTHORIZED: "payment.authorized";
    readonly PAYMENT_INITIATED: "payment.initiated";
    readonly PAYMENT_SETTLED: "payment.settled";
    readonly PAYMENT_RECEIVED: "payment.received";
    readonly PAYMENT_DLQ: "payment.dlq";
    readonly FUEL_ADVANCE_ISSUED: "fuel.advance-issued";
    readonly FUEL_CHARGE_SETTLED: "fuel.charge-settled";
    readonly FUEL_DLQ: "fuel.dlq";
    readonly LOCKBOX_FILE_RECEIVED: "lockbox.file-received";
    readonly LOCKBOX_PAYMENT_EXTRACTED: "lockbox.payment-extracted";
    readonly LOCKBOX_DLQ: "lockbox.dlq";
    readonly RECONCILIATION_PAYMENT_MATCHED: "reconciliation.payment-matched";
    readonly RECONCILIATION_COMPLETED: "reconciliation.completed";
    readonly RECONCILIATION_UNMATCHED_EXCEPTION: "reconciliation.unmatched-exception";
    readonly RECONCILIATION_DLQ: "reconciliation.dlq";
    readonly LEDGER_EVENT_APPENDED: "ledger.event-appended";
    readonly LEDGER_SNAPSHOT_CREATED: "ledger.snapshot-created";
    readonly LEDGER_DLQ: "ledger.dlq";
    readonly ACCOUNTING_GL_POSTING: "accounting.gl-posting";
    readonly ACCOUNTING_INTERCOMPANY_SETTLEMENT: "accounting.intercompany-settlement";
    readonly ACCOUNTING_DLQ: "accounting.dlq";
};
/**
 * Type-safe topic values for Kafka operations
 */
export type TopicKey = keyof typeof TOPICS;
export type TopicValue = (typeof TOPICS)[TopicKey];
/**
 * Kafka consumer groups for event choreography
 * Each service/consumer group subscribes to relevant topics for its domain
 */
export declare const CONSUMER_GROUPS: {
    readonly LEDGER_EVENTS: "ledger-events";
    readonly ACCOUNTING_PROJECTIONS: "accounting-projections";
    readonly RECONCILIATION_MATCHERS: "reconciliation-matchers";
    readonly PAYMENT_HANDLERS: "payment-handlers";
    readonly FACTORING_HANDLERS: "factoring-handlers";
    readonly FUEL_HANDLERS: "fuel-handlers";
    readonly INVOICE_HANDLERS: "invoice-handlers";
    readonly LOAD_HANDLERS: "load-handlers";
    readonly DLQ_HANDLER: "dlq-handler";
};
export type ConsumerGroupKey = keyof typeof CONSUMER_GROUPS;
export type ConsumerGroupValue = (typeof CONSUMER_GROUPS)[ConsumerGroupKey];
/**
 * Subscribe each consumer group to relevant topics
 * Used for initialization and documentation
 */
export declare const CONSUMER_SUBSCRIPTIONS: Record<ConsumerGroupValue, TopicValue[]>;
/**
 * Map event types to their payload interfaces
 * Enables type-safe event deserialization and validation
 */
export declare const EVENT_TYPES_MAP: {
    readonly 'load.created': EventEnvelope<LoadCreatedPayload>;
    readonly 'load.assigned': EventEnvelope<LoadAssignedPayload>;
    readonly 'load.delivered': EventEnvelope<LoadDeliveredPayload>;
    readonly 'invoice.submitted': EventEnvelope<InvoiceSubmittedPayload>;
    readonly 'invoice.linked-to-ar': EventEnvelope<InvoiceLinkedToARPayload>;
    readonly 'factoring.assigned': EventEnvelope<FactoringAssignmentPayload>;
    readonly 'factoring.advanced': EventEnvelope<FactoringAdvanceIssuedPayload>;
    readonly 'factoring.settled': EventEnvelope<FactoringSettlementPayload>;
    readonly 'payment.authorized': EventEnvelope<PaymentAuthorizedPayload>;
    readonly 'payment.initiated': EventEnvelope<PaymentInitiatedPayload>;
    readonly 'payment.settled': EventEnvelope<PaymentSettledPayload>;
    readonly 'payment.received': EventEnvelope<PaymentReceivedPayload>;
    readonly 'fuel.advance-issued': EventEnvelope<FuelCardAdvanceIssuedPayload>;
    readonly 'fuel.charge-settled': EventEnvelope<FuelChargeSettledPayload>;
    readonly 'lockbox.file-received': EventEnvelope<LockboxFileReceivedPayload>;
    readonly 'lockbox.payment-extracted': EventEnvelope<LockboxPaymentExtractedPayload>;
    readonly 'reconciliation.payment-matched': EventEnvelope<PaymentMatchedPayload>;
    readonly 'reconciliation.completed': EventEnvelope<ReconciliationCompletedPayload>;
    readonly 'reconciliation.unmatched-exception': EventEnvelope<UnmatchedPaymentExceptionPayload>;
    readonly 'ledger.event-appended': EventEnvelope<LedgerEventAppendedPayload>;
    readonly 'ledger.snapshot-created': EventEnvelope<SnapshotCreatedPayload>;
    readonly 'accounting.gl-posting': EventEnvelope<GLPostingCreatedPayload>;
    readonly 'accounting.intercompany-settlement': EventEnvelope<IntercompanySettlementPayload>;
};
export type EventType = keyof typeof EVENT_TYPES_MAP;
