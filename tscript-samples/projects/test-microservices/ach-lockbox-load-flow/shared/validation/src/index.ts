/**
 * Validation Schemas and DTOs
 * Zod-based request validation and data transformation
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@ach-lockbox/error-taxonomy';

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

/**
 * Request context extracted from headers
 * Contains user and tracing information
 */
export interface RequestContext {
  correlationId: string;
  userId: string;
  entityId: string;
  role: string;
  timestamp: Date;
}

/**
 * Parse RequestContext from Express request headers
 */
export function parseRequestContext(req: Request): RequestContext {
  const correlationId = (req.headers['x-correlation-id'] || 
                         req.headers['x-request-id'] || 
                         req.headers['trace-id'] ||
                         'unknown') as string;
  
  const userId = (req.headers['x-user-id'] || 'anonymous') as string;
  const entityId = (req.headers['x-entity-id'] || '') as string;
  const role = (req.headers['x-user-role'] || 'guest') as string;
  
  return {
    correlationId,
    userId,
    entityId,
    role,
    timestamp: new Date(),
  };
}

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * UUID validation schema
 */
export const UUIDSchema = z.string().uuid('Must be valid UUID');

/**
 * Email validation schema
 */
export const EmailSchema = z.string().email('Must be valid email');

/**
 * ISO date validation schema
 */
export const ISODateSchema = z.string().datetime('Must be ISO 8601 datetime').transform(s => new Date(s));

/**
 * Positive number schema
 */
export const PositiveNumberSchema = z.number().positive('Must be positive');

/**
 * Non-negative number schema
 */
export const NonNegativeNumberSchema = z.number().nonnegative('Must be non-negative');

/**
 * Amount/currency schema (cents as integer)
 */
export const AmountSchema = z.number().int('Amount must be in cents without decimals').nonnegative();

/**
 * Percentage schema (0-100)
 */
export const PercentageSchema = z.number().min(0).max(100);

/**
 * Confidence score (0-1)
 */
export const ConfidenceSchema = z.number().min(0).max(1);

// ============================================================================
// LOAD DOMAIN DTOs
// ============================================================================

export const CreateLoadRequestSchema = z.object({
  carrierId: UUIDSchema,
  shipmentDate: ISODateSchema,
  pickupLocation: z.string().min(1),
  deliveryLocation: z.string().min(1),
  weightLbs: PositiveNumberSchema,
  miles: PositiveNumberSchema,
  ratePerMile: PositiveNumberSchema,
});

export type CreateLoadRequest = z.infer<typeof CreateLoadRequestSchema>;

export const UpdateLoadStatusRequestSchema = z.object({
  loadId: UUIDSchema,
  status: z.enum(['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateLoadStatusRequest = z.infer<typeof UpdateLoadStatusRequestSchema>;

// ============================================================================
// INVOICE DOMAIN DTOs
// ============================================================================

export const SubmitInvoiceRequestSchema = z.object({
  loadId: UUIDSchema,
  carrierId: UUIDSchema,
  invoiceNumber: z.string().min(1),
  amount: AmountSchema,
  invoiceDate: ISODateSchema,
  dueDate: ISODateSchema,
  attachmentIds: z.string().array().optional(),
});

export type SubmitInvoiceRequest = z.infer<typeof SubmitInvoiceRequestSchema>;

export const LinkInvoiceToARRequestSchema = z.object({
  invoiceId: UUIDSchema,
  customerId: UUIDSchema,
  arRecordId: UUIDSchema,
});

export type LinkInvoiceToARRequest = z.infer<typeof LinkInvoiceToARRequestSchema>;

// ============================================================================
// FACTORING DOMAIN DTOs
// ============================================================================

export const AssignFactoringRequestSchema = z.object({
  invoiceId: UUIDSchema,
  carrierId: UUIDSchema,
  factorId: UUIDSchema,
  advancePercentage: PercentageSchema,
});

export type AssignFactoringRequest = z.infer<typeof AssignFactoringRequestSchema>;

export const IssueFactoringAdvanceRequestSchema = z.object({
  factorAssignmentId: UUIDSchema,
  advanceAmount: AmountSchema,
  discountAmount: AmountSchema,
  bankAccountId: z.string().min(1),
});

export type IssueFactoringAdvanceRequest = z.infer<typeof IssueFactoringAdvanceRequestSchema>;

// ============================================================================
// PAYMENT DOMAIN DTOs
// ============================================================================

export const AuthorizePaymentRequestSchema = z.object({
  carrierId: UUIDSchema,
  invoiceId: UUIDSchema.optional(),
  amount: AmountSchema,
  invoiceNumber: z.string().optional(),
});

export type AuthorizePaymentRequest = z.infer<typeof AuthorizePaymentRequestSchema>;

export const InitiatePaymentRequestSchema = z.object({
  paymentId: UUIDSchema,
  amount: AmountSchema,
  paymentMethod: z.enum(['ACH', 'EFT', 'CHECK', 'WIRE']),
  bankAccountId: z.string().min(1),
  expectedSettlementDate: ISODateSchema.optional(),
});

export type InitiatePaymentRequest = z.infer<typeof InitiatePaymentRequestSchema>;

export const RecordPaymentReceivedRequestSchema = z.object({
  customerId: UUIDSchema,
  amount: AmountSchema,
  lockboxFileId: UUIDSchema,
  checkNumber: z.string().optional(),
});

export type RecordPaymentReceivedRequest = z.infer<typeof RecordPaymentReceivedRequestSchema>;

// ============================================================================
// FUEL DOMAIN DTOs
// ============================================================================

export const IssueFuelAdvanceRequestSchema = z.object({
  carrierId: UUIDSchema,
  amount: AmountSchema,
  vendorId: UUIDSchema,
  expiryDate: ISODateSchema,
});

export type IssueFuelAdvanceRequest = z.infer<typeof IssueFuelAdvanceRequestSchema>;

export const SettleFuelChargeRequestSchema = z.object({
  fuelAdvanceId: UUIDSchema,
  totalCharges: AmountSchema,
  chargeDate: ISODateSchema,
});

export type SettleFuelChargeRequest = z.infer<typeof SettleFuelChargeRequestSchema>;

// ============================================================================
// LOCKBOX DOMAIN DTOs
// ============================================================================

export const ProcessLockboxFileRequestSchema = z.object({
  customerId: UUIDSchema,
  fileName: z.string().min(1),
  checkCount: z.number().int().positive(),
  totalAmount: AmountSchema,
  bankAccountId: z.string().min(1),
});

export type ProcessLockboxFileRequest = z.infer<typeof ProcessLockboxFileRequestSchema>;

export const ExtractLockboxPaymentRequestSchema = z.object({
  lockboxFileId: UUIDSchema,
  checkNumber: z.string(),
  amount: AmountSchema,
  checkDate: ISODateSchema,
  remitterName: z.string().min(1),
  ocrConfidence: ConfidenceSchema,
});

export type ExtractLockboxPaymentRequest = z.infer<typeof ExtractLockboxPaymentRequestSchema>;

// ============================================================================
// RECONCILIATION DOMAIN DTOs
// ============================================================================

export const MatchPaymentRequestSchema = z.object({
  paymentId: UUIDSchema,
  invoiceId: UUIDSchema,
  matchType: z.enum(['EXACT', 'FUZZY', 'MANUAL']),
  matchScore: ConfidenceSchema,
  matcherUserId: z.string().optional(),
});

export type MatchPaymentRequest = z.infer<typeof MatchPaymentRequestSchema>;

export const CompleteReconciliationRequestSchema = z.object({
  customerId: UUIDSchema,
  startDate: ISODateSchema,
  endDate: ISODateSchema,
});

export type CompleteReconciliationRequest = z.infer<typeof CompleteReconciliationRequestSchema>;

export const ReportUnmatchedExceptionRequestSchema = z.object({
  paymentId: UUIDSchema,
  amount: AmountSchema,
  reason: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export type ReportUnmatchedExceptionRequest = z.infer<typeof ReportUnmatchedExceptionRequestSchema>;

// ============================================================================
// LEDGER DOMAIN DTOs
// ============================================================================

export const AppendLedgerEventRequestSchema = z.object({
  aggregateId: UUIDSchema,
  aggregateType: z.string().min(1),
  eventType: z.string().min(1),
  eventData: z.record(z.unknown()),
});

export type AppendLedgerEventRequest = z.infer<typeof AppendLedgerEventRequestSchema>;

// ============================================================================
// ACCOUNTING DOMAIN DTOs
// ============================================================================

export const CreateGLPostingRequestSchema = z.object({
  journalEntryId: UUIDSchema,
  accountNumber: z.string().min(1),
  debitAmount: AmountSchema.optional(),
  creditAmount: AmountSchema.optional(),
  description: z.string().min(1),
  entityId: UUIDSchema,
  departmentId: UUIDSchema.optional(),
});

export type CreateGLPostingRequest = z.infer<typeof CreateGLPostingRequestSchema>;

export const CreateIntercompanySettlementRequestSchema = z.object({
  fromEntity: UUIDSchema,
  toEntity: UUIDSchema,
  amount: AmountSchema,
  description: z.string().min(1),
});

export type CreateIntercompanySettlementRequest = z.infer<typeof CreateIntercompanySettlementRequestSchema>;

// ============================================================================
// QUERY/SEARCH DTOs
// ============================================================================

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const DateRangeSchema = z.object({
  startDate: ISODateSchema,
  endDate: ISODateSchema,
}).refine(
  data => data.startDate <= data.endDate,
  { message: 'startDate must be before endDate', path: ['startDate'] }
);

export type DateRange = z.infer<typeof DateRangeSchema>;

export const SearchLoadRequestSchema = PaginationSchema.extend({
  carrierId: UUIDSchema.optional(),
  status: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
});

export type SearchLoadRequest = z.infer<typeof SearchLoadRequestSchema>;

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Create request body validation middleware
 * Validates request body against Zod schema
 */
export function createValidationMiddleware(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        res.status(400).json({ error: 'Validation failed', message });
      } else {
        res.status(400).json({ error: 'Validation failed' });
      }
    }
  };
}

/**
 * Create query string validation middleware
 */
export function createQueryValidationMiddleware(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        res.status(400).json({ error: 'Query validation failed', message });
      } else {
        res.status(400).json({ error: 'Query validation failed' });
      }
    }
  };
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Safely validate data against schema
 * Returns { valid: boolean, data: T | null, errors: string[] }
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { valid: boolean; data: T | null; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { valid: true, data: result.data, errors: [] };
  }
  
  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { valid: false, data: null, errors };
}

/**
 * Validate and throw on error
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = `${context ? context + ': ' : ''}${
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      }`;
      throw new ValidationError(message);
    }
    throw error;
  }
}

// ============================================================================
// CUSTOM TRANSFORMERS
// ============================================================================

/**
 * Transform string to lowercase
 */
export const lowercase = z.string().transform(v => v.toLowerCase());

/**
 * Transform string to uppercase
 */
export const uppercase = z.string().transform(v => v.toUpperCase());

/**
 * Transform string to trimmed value
 */
export const trimmed = z.string().trim();

/**
 * Transform amount string to number (cents)
 * Supports both "10.50" and "1050" formats
 */
export const amountTransform = z.union([
  z.number(),
  z.string().transform(v => {
    const num = parseFloat(v);
    if (isNaN(num)) throw new Error('Invalid amount');
    // If it looks like dollars, convert to cents
    return num > 10000 ? num : Math.round(num * 100);
  }),
]);
