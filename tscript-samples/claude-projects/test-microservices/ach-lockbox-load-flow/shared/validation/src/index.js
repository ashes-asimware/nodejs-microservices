"use strict";
/**
 * Validation Schemas and DTOs
 * Zod-based request validation and data transformation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.amountTransform = exports.trimmed = exports.uppercase = exports.lowercase = exports.SearchLoadRequestSchema = exports.DateRangeSchema = exports.PaginationSchema = exports.CreateIntercompanySettlementRequestSchema = exports.CreateGLPostingRequestSchema = exports.AppendLedgerEventRequestSchema = exports.ReportUnmatchedExceptionRequestSchema = exports.CompleteReconciliationRequestSchema = exports.MatchPaymentRequestSchema = exports.ExtractLockboxPaymentRequestSchema = exports.ProcessLockboxFileRequestSchema = exports.SettleFuelChargeRequestSchema = exports.IssueFuelAdvanceRequestSchema = exports.RecordPaymentReceivedRequestSchema = exports.InitiatePaymentRequestSchema = exports.AuthorizePaymentRequestSchema = exports.IssueFactoringAdvanceRequestSchema = exports.AssignFactoringRequestSchema = exports.LinkInvoiceToARRequestSchema = exports.SubmitInvoiceRequestSchema = exports.UpdateLoadStatusRequestSchema = exports.CreateLoadRequestSchema = exports.ConfidenceSchema = exports.PercentageSchema = exports.AmountSchema = exports.NonNegativeNumberSchema = exports.PositiveNumberSchema = exports.ISODateSchema = exports.EmailSchema = exports.UUIDSchema = void 0;
exports.parseRequestContext = parseRequestContext;
exports.createValidationMiddleware = createValidationMiddleware;
exports.createQueryValidationMiddleware = createQueryValidationMiddleware;
exports.safeValidate = safeValidate;
exports.validateOrThrow = validateOrThrow;
const zod_1 = require("zod");
const error_taxonomy_1 = require("@ach-lockbox/error-taxonomy");
/**
 * Parse RequestContext from Express request headers
 */
function parseRequestContext(req) {
    const correlationId = (req.headers['x-correlation-id'] ||
        req.headers['x-request-id'] ||
        req.headers['trace-id'] ||
        'unknown');
    const userId = (req.headers['x-user-id'] || 'anonymous');
    const entityId = (req.headers['x-entity-id'] || '');
    const role = (req.headers['x-user-role'] || 'guest');
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
exports.UUIDSchema = zod_1.z.string().uuid('Must be valid UUID');
/**
 * Email validation schema
 */
exports.EmailSchema = zod_1.z.string().email('Must be valid email');
/**
 * ISO date validation schema
 */
exports.ISODateSchema = zod_1.z.string().datetime('Must be ISO 8601 datetime').transform(s => new Date(s));
/**
 * Positive number schema
 */
exports.PositiveNumberSchema = zod_1.z.number().positive('Must be positive');
/**
 * Non-negative number schema
 */
exports.NonNegativeNumberSchema = zod_1.z.number().nonnegative('Must be non-negative');
/**
 * Amount/currency schema (cents as integer)
 */
exports.AmountSchema = zod_1.z.number().int('Amount must be in cents without decimals').nonnegative();
/**
 * Percentage schema (0-100)
 */
exports.PercentageSchema = zod_1.z.number().min(0).max(100);
/**
 * Confidence score (0-1)
 */
exports.ConfidenceSchema = zod_1.z.number().min(0).max(1);
// ============================================================================
// LOAD DOMAIN DTOs
// ============================================================================
exports.CreateLoadRequestSchema = zod_1.z.object({
    carrierId: exports.UUIDSchema,
    shipmentDate: exports.ISODateSchema,
    pickupLocation: zod_1.z.string().min(1),
    deliveryLocation: zod_1.z.string().min(1),
    weightLbs: exports.PositiveNumberSchema,
    miles: exports.PositiveNumberSchema,
    ratePerMile: exports.PositiveNumberSchema,
});
exports.UpdateLoadStatusRequestSchema = zod_1.z.object({
    loadId: exports.UUIDSchema,
    status: zod_1.z.enum(['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
// ============================================================================
// INVOICE DOMAIN DTOs
// ============================================================================
exports.SubmitInvoiceRequestSchema = zod_1.z.object({
    loadId: exports.UUIDSchema,
    carrierId: exports.UUIDSchema,
    invoiceNumber: zod_1.z.string().min(1),
    amount: exports.AmountSchema,
    invoiceDate: exports.ISODateSchema,
    dueDate: exports.ISODateSchema,
    attachmentIds: zod_1.z.string().array().optional(),
});
exports.LinkInvoiceToARRequestSchema = zod_1.z.object({
    invoiceId: exports.UUIDSchema,
    customerId: exports.UUIDSchema,
    arRecordId: exports.UUIDSchema,
});
// ============================================================================
// FACTORING DOMAIN DTOs
// ============================================================================
exports.AssignFactoringRequestSchema = zod_1.z.object({
    invoiceId: exports.UUIDSchema,
    carrierId: exports.UUIDSchema,
    factorId: exports.UUIDSchema,
    advancePercentage: exports.PercentageSchema,
});
exports.IssueFactoringAdvanceRequestSchema = zod_1.z.object({
    factorAssignmentId: exports.UUIDSchema,
    advanceAmount: exports.AmountSchema,
    discountAmount: exports.AmountSchema,
    bankAccountId: zod_1.z.string().min(1),
});
// ============================================================================
// PAYMENT DOMAIN DTOs
// ============================================================================
exports.AuthorizePaymentRequestSchema = zod_1.z.object({
    carrierId: exports.UUIDSchema,
    invoiceId: exports.UUIDSchema.optional(),
    amount: exports.AmountSchema,
    invoiceNumber: zod_1.z.string().optional(),
});
exports.InitiatePaymentRequestSchema = zod_1.z.object({
    paymentId: exports.UUIDSchema,
    amount: exports.AmountSchema,
    paymentMethod: zod_1.z.enum(['ACH', 'EFT', 'CHECK', 'WIRE']),
    bankAccountId: zod_1.z.string().min(1),
    expectedSettlementDate: exports.ISODateSchema.optional(),
});
exports.RecordPaymentReceivedRequestSchema = zod_1.z.object({
    customerId: exports.UUIDSchema,
    amount: exports.AmountSchema,
    lockboxFileId: exports.UUIDSchema,
    checkNumber: zod_1.z.string().optional(),
});
// ============================================================================
// FUEL DOMAIN DTOs
// ============================================================================
exports.IssueFuelAdvanceRequestSchema = zod_1.z.object({
    carrierId: exports.UUIDSchema,
    amount: exports.AmountSchema,
    vendorId: exports.UUIDSchema,
    expiryDate: exports.ISODateSchema,
});
exports.SettleFuelChargeRequestSchema = zod_1.z.object({
    fuelAdvanceId: exports.UUIDSchema,
    totalCharges: exports.AmountSchema,
    chargeDate: exports.ISODateSchema,
});
// ============================================================================
// LOCKBOX DOMAIN DTOs
// ============================================================================
exports.ProcessLockboxFileRequestSchema = zod_1.z.object({
    customerId: exports.UUIDSchema,
    fileName: zod_1.z.string().min(1),
    checkCount: zod_1.z.number().int().positive(),
    totalAmount: exports.AmountSchema,
    bankAccountId: zod_1.z.string().min(1),
});
exports.ExtractLockboxPaymentRequestSchema = zod_1.z.object({
    lockboxFileId: exports.UUIDSchema,
    checkNumber: zod_1.z.string(),
    amount: exports.AmountSchema,
    checkDate: exports.ISODateSchema,
    remitterName: zod_1.z.string().min(1),
    ocrConfidence: exports.ConfidenceSchema,
});
// ============================================================================
// RECONCILIATION DOMAIN DTOs
// ============================================================================
exports.MatchPaymentRequestSchema = zod_1.z.object({
    paymentId: exports.UUIDSchema,
    invoiceId: exports.UUIDSchema,
    matchType: zod_1.z.enum(['EXACT', 'FUZZY', 'MANUAL']),
    matchScore: exports.ConfidenceSchema,
    matcherUserId: zod_1.z.string().optional(),
});
exports.CompleteReconciliationRequestSchema = zod_1.z.object({
    customerId: exports.UUIDSchema,
    startDate: exports.ISODateSchema,
    endDate: exports.ISODateSchema,
});
exports.ReportUnmatchedExceptionRequestSchema = zod_1.z.object({
    paymentId: exports.UUIDSchema,
    amount: exports.AmountSchema,
    reason: zod_1.z.string().min(1),
    severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
// ============================================================================
// LEDGER DOMAIN DTOs
// ============================================================================
exports.AppendLedgerEventRequestSchema = zod_1.z.object({
    aggregateId: exports.UUIDSchema,
    aggregateType: zod_1.z.string().min(1),
    eventType: zod_1.z.string().min(1),
    eventData: zod_1.z.record(zod_1.z.unknown()),
});
// ============================================================================
// ACCOUNTING DOMAIN DTOs
// ============================================================================
exports.CreateGLPostingRequestSchema = zod_1.z.object({
    journalEntryId: exports.UUIDSchema,
    accountNumber: zod_1.z.string().min(1),
    debitAmount: exports.AmountSchema.optional(),
    creditAmount: exports.AmountSchema.optional(),
    description: zod_1.z.string().min(1),
    entityId: exports.UUIDSchema,
    departmentId: exports.UUIDSchema.optional(),
});
exports.CreateIntercompanySettlementRequestSchema = zod_1.z.object({
    fromEntity: exports.UUIDSchema,
    toEntity: exports.UUIDSchema,
    amount: exports.AmountSchema,
    description: zod_1.z.string().min(1),
});
// ============================================================================
// QUERY/SEARCH DTOs
// ============================================================================
exports.PaginationSchema = zod_1.z.object({
    page: zod_1.z.number().int().positive().default(1),
    limit: zod_1.z.number().int().positive().max(100).default(20),
    sortBy: zod_1.z.string().optional(),
    sortOrder: zod_1.z.enum(['ASC', 'DESC']).default('DESC'),
});
exports.DateRangeSchema = zod_1.z.object({
    startDate: exports.ISODateSchema,
    endDate: exports.ISODateSchema,
}).refine(data => data.startDate <= data.endDate, { message: 'startDate must be before endDate', path: ['startDate'] });
exports.SearchLoadRequestSchema = exports.PaginationSchema.extend({
    carrierId: exports.UUIDSchema.optional(),
    status: zod_1.z.string().optional(),
    dateRange: exports.DateRangeSchema.optional(),
});
// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================
/**
 * Create request body validation middleware
 * Validates request body against Zod schema
 */
function createValidationMiddleware(schema) {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.body);
            req.body = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const message = error.errors
                    .map(e => `${e.path.join('.')}: ${e.message}`)
                    .join('; ');
                res.status(400).json({ error: 'Validation failed', message });
            }
            else {
                res.status(400).json({ error: 'Validation failed' });
            }
        }
    };
}
/**
 * Create query string validation middleware
 */
function createQueryValidationMiddleware(schema) {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.query);
            req.query = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const message = error.errors
                    .map(e => `${e.path.join('.')}: ${e.message}`)
                    .join('; ');
                res.status(400).json({ error: 'Query validation failed', message });
            }
            else {
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
function safeValidate(schema, data) {
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
function validateOrThrow(schema, data, context) {
    try {
        return schema.parse(data);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const message = `${context ? context + ': ' : ''}${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')}`;
            throw new error_taxonomy_1.ValidationError(message);
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
exports.lowercase = zod_1.z.string().transform(v => v.toLowerCase());
/**
 * Transform string to uppercase
 */
exports.uppercase = zod_1.z.string().transform(v => v.toUpperCase());
/**
 * Transform string to trimmed value
 */
exports.trimmed = zod_1.z.string().trim();
/**
 * Transform amount string to number (cents)
 * Supports both "10.50" and "1050" formats
 */
exports.amountTransform = zod_1.z.union([
    zod_1.z.number(),
    zod_1.z.string().transform(v => {
        const num = parseFloat(v);
        if (isNaN(num))
            throw new Error('Invalid amount');
        // If it looks like dollars, convert to cents
        return num > 10000 ? num : Math.round(num * 100);
    }),
]);
//# sourceMappingURL=index.js.map