/**
 * Validation Schemas and DTOs
 * Zod-based request validation and data transformation
 */
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
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
export declare function parseRequestContext(req: Request): RequestContext;
/**
 * UUID validation schema
 */
export declare const UUIDSchema: any;
/**
 * Email validation schema
 */
export declare const EmailSchema: any;
/**
 * ISO date validation schema
 */
export declare const ISODateSchema: any;
/**
 * Positive number schema
 */
export declare const PositiveNumberSchema: any;
/**
 * Non-negative number schema
 */
export declare const NonNegativeNumberSchema: any;
/**
 * Amount/currency schema (cents as integer)
 */
export declare const AmountSchema: any;
/**
 * Percentage schema (0-100)
 */
export declare const PercentageSchema: any;
/**
 * Confidence score (0-1)
 */
export declare const ConfidenceSchema: any;
export declare const CreateLoadRequestSchema: any;
export type CreateLoadRequest = z.infer<typeof CreateLoadRequestSchema>;
export declare const UpdateLoadStatusRequestSchema: any;
export type UpdateLoadStatusRequest = z.infer<typeof UpdateLoadStatusRequestSchema>;
export declare const SubmitInvoiceRequestSchema: any;
export type SubmitInvoiceRequest = z.infer<typeof SubmitInvoiceRequestSchema>;
export declare const LinkInvoiceToARRequestSchema: any;
export type LinkInvoiceToARRequest = z.infer<typeof LinkInvoiceToARRequestSchema>;
export declare const AssignFactoringRequestSchema: any;
export type AssignFactoringRequest = z.infer<typeof AssignFactoringRequestSchema>;
export declare const IssueFactoringAdvanceRequestSchema: any;
export type IssueFactoringAdvanceRequest = z.infer<typeof IssueFactoringAdvanceRequestSchema>;
export declare const AuthorizePaymentRequestSchema: any;
export type AuthorizePaymentRequest = z.infer<typeof AuthorizePaymentRequestSchema>;
export declare const InitiatePaymentRequestSchema: any;
export type InitiatePaymentRequest = z.infer<typeof InitiatePaymentRequestSchema>;
export declare const RecordPaymentReceivedRequestSchema: any;
export type RecordPaymentReceivedRequest = z.infer<typeof RecordPaymentReceivedRequestSchema>;
export declare const IssueFuelAdvanceRequestSchema: any;
export type IssueFuelAdvanceRequest = z.infer<typeof IssueFuelAdvanceRequestSchema>;
export declare const SettleFuelChargeRequestSchema: any;
export type SettleFuelChargeRequest = z.infer<typeof SettleFuelChargeRequestSchema>;
export declare const ProcessLockboxFileRequestSchema: any;
export type ProcessLockboxFileRequest = z.infer<typeof ProcessLockboxFileRequestSchema>;
export declare const ExtractLockboxPaymentRequestSchema: any;
export type ExtractLockboxPaymentRequest = z.infer<typeof ExtractLockboxPaymentRequestSchema>;
export declare const MatchPaymentRequestSchema: any;
export type MatchPaymentRequest = z.infer<typeof MatchPaymentRequestSchema>;
export declare const CompleteReconciliationRequestSchema: any;
export type CompleteReconciliationRequest = z.infer<typeof CompleteReconciliationRequestSchema>;
export declare const ReportUnmatchedExceptionRequestSchema: any;
export type ReportUnmatchedExceptionRequest = z.infer<typeof ReportUnmatchedExceptionRequestSchema>;
export declare const AppendLedgerEventRequestSchema: any;
export type AppendLedgerEventRequest = z.infer<typeof AppendLedgerEventRequestSchema>;
export declare const CreateGLPostingRequestSchema: any;
export type CreateGLPostingRequest = z.infer<typeof CreateGLPostingRequestSchema>;
export declare const CreateIntercompanySettlementRequestSchema: any;
export type CreateIntercompanySettlementRequest = z.infer<typeof CreateIntercompanySettlementRequestSchema>;
export declare const PaginationSchema: any;
export type Pagination = z.infer<typeof PaginationSchema>;
export declare const DateRangeSchema: any;
export type DateRange = z.infer<typeof DateRangeSchema>;
export declare const SearchLoadRequestSchema: any;
export type SearchLoadRequest = z.infer<typeof SearchLoadRequestSchema>;
/**
 * Create request body validation middleware
 * Validates request body against Zod schema
 */
export declare function createValidationMiddleware(schema: z.ZodTypeAny): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Create query string validation middleware
 */
export declare function createQueryValidationMiddleware(schema: z.ZodTypeAny): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Safely validate data against schema
 * Returns { valid: boolean, data: T | null, errors: string[] }
 */
export declare function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): {
    valid: boolean;
    data: T | null;
    errors: string[];
};
/**
 * Validate and throw on error
 */
export declare function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): T;
/**
 * Transform string to lowercase
 */
export declare const lowercase: any;
/**
 * Transform string to uppercase
 */
export declare const uppercase: any;
/**
 * Transform string to trimmed value
 */
export declare const trimmed: any;
/**
 * Transform amount string to number (cents)
 * Supports both "10.50" and "1050" formats
 */
export declare const amountTransform: any;
