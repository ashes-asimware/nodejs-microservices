/**
 * Error Taxonomy and Handlers
 * Standard error types, HTTP status mapping, and error handling middleware
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ILogger } from '@ach-lockbox/logger';
/**
 * Base application error
 * All domain errors should extend this class
 */
export declare class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly isOperational: boolean;
    readonly timestamp: Date;
    readonly context?: Record<string, unknown>;
    constructor(message: string, statusCode?: number, code?: string, context?: Record<string, unknown>);
    /**
     * Convert error to JSON for responses
     */
    toJSON(): {
        context?: Record<string, unknown> | undefined;
        error: string;
        message: string;
        statusCode: number;
        timestamp: string;
    };
}
/**
 * Validation error (400 Bad Request)
 * Thrown when input validation fails
 */
export declare class ValidationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>);
}
/**
 * Not found error (404 Not Found)
 * Thrown when resource doesn't exist
 */
export declare class NotFoundError extends AppError {
    constructor(message: string, context?: Record<string, unknown>);
}
/**
 * Unauthorized error (401 Unauthorized)
 * Thrown when authentication fails
 */
export declare class UnauthorizedError extends AppError {
    constructor(message?: string, context?: Record<string, unknown>);
}
/**
 * Forbidden error (403 Forbidden)
 * Thrown when authorized but lacks permission
 */
export declare class ForbiddenError extends AppError {
    constructor(message?: string, context?: Record<string, unknown>);
}
/**
 * Conflict error (409 Conflict)
 * Thrown when state conflicts with operation (e.g., duplicate entity)
 */
export declare class ConflictError extends AppError {
    constructor(message: string, context?: Record<string, unknown>);
}
/**
 * Unprocessable entity error (422)
 * Thrown when request is well-formed but semantically incorrect
 */
export declare class UnprocessableEntityError extends AppError {
    constructor(message: string, context?: Record<string, unknown>);
}
/**
 * Too many requests error (429)
 * Thrown when rate limit exceeded
 */
export declare class TooManyRequestsError extends AppError {
    readonly retryAfter: number;
    constructor(message?: string, retryAfter?: number);
}
/**
 * Service unavailable error (503)
 * Thrown when external service is down
 */
export declare class ServiceUnavailableError extends AppError {
    constructor(message?: string, context?: Record<string, unknown>);
}
/**
 * Database error (500)
 * Thrown on database operation failures
 */
export declare class DatabaseError extends AppError {
    constructor(message: string, originalError?: Error);
}
/**
 * Kafka error (503)
 * Thrown on Kafka connectivity/operation failures
 */
export declare class KafkaError extends AppError {
    constructor(message: string, originalError?: Error);
}
/**
 * External service error (502)
 * Thrown when calling external API fails
 */
export declare class ExternalServiceError extends AppError {
    readonly serviceName: string;
    constructor(message: string, serviceName: string, originalError?: Error);
}
/**
 * Check if error is operational (expected)
 */
export declare function isOperationalError(error: unknown): error is AppError;
/**
 * Check if error is a validation error
 */
export declare function isValidationError(error: unknown): error is ValidationError;
/**
 * Check if error is a not found error
 */
export declare function isNotFoundError(error: unknown): error is NotFoundError;
/**
 * Check if error is a 4xx client error
 */
export declare function isClientError(error: unknown): error is AppError;
/**
 * Check if error is a 5xx server error
 */
export declare function isServerError(error: unknown): error is AppError;
/**
 * Standard error response format
 */
export interface ErrorResponse {
    error: string;
    message: string;
    code: string;
    statusCode: number;
    timestamp: string;
    correlationId?: string;
    trace?: string;
}
/**
 * Format error for HTTP response
 */
export declare function formatErrorResponse(error: unknown, correlationId?: string, includeTrace?: boolean): ErrorResponse;
/**
 * Global error handler middleware
 * Must be registered AFTER all other middleware and routes
 */
export declare function createErrorHandlerMiddleware(logger: ILogger, options?: {
    includeStackTrace?: boolean;
    isDevelopment?: boolean;
}): (error: unknown, req: Request, res: Response, next: NextFunction) => void;
/**
 * Async error wrapper for Express route handlers
 * Catches unhandled rejections and passes to error handler
 */
export declare const asyncHandler: (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => RequestHandler;
/**
 * Trust proxy and correlation ID middleware
 * Must be used before error handler
 */
export declare function createErrorContextMiddleware(): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Throw error if condition is false
 */
export declare function assert(condition: unknown, message: string, errorType?: typeof AppError): asserts condition;
/**
 * Throw NotFoundError with standard message
 */
export declare function throwNotFound(resource: string, id?: string): never;
/**
 * Throw ConflictError for duplicate entity
 */
export declare function throwDuplicate(resource: string, identifier: string): never;
/**
 * Throw ValidationError with field details
 */
export declare function throwValidationError(message: string, fields?: Record<string, string>): never;
/**
 * Throw UnauthorizedError with optional reason
 */
export declare function throwUnauthorized(reason?: string): never;
/**
 * Throw ForbiddenError with permission context
 */
export declare function throwForbidden(action: string, resource: string, reason?: string): never;
/**
 * Manage multiple errors during batch operations
 */
export declare class BatchErrorCollector {
    private errors;
    add(error: AppError | Error, context?: Record<string, unknown>): void;
    hasErrors(): boolean;
    throwIfErrors(message?: string): void;
    getErrors(): AppError[];
    clear(): void;
}
/**
 * Retry configuration
 */
export interface RetryConfig {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
    retryableStatusCodes?: number[];
    retryableErrors?: Array<typeof AppError>;
}
/**
 * Retry async function with exponential backoff
 */
export declare function withRetry<T>(fn: () => Promise<T>, config?: RetryConfig, logger?: ILogger): Promise<T>;
export declare function setErrorLogger(l: ILogger): void;
