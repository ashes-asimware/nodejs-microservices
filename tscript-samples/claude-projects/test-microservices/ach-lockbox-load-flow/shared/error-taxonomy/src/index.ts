/**
 * Error Taxonomy and Handlers
 * Standard error types, HTTP status mapping, and error handling middleware
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ILogger } from '@ach-lockbox/logger';

// ============================================================================
// ERROR HIERARCHY
// ============================================================================

/**
 * Base application error
 * All domain errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;
  
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.timestamp = new Date();
    this.context = context;
  }
  
  /**
   * Convert error to JSON for responses
   */
  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      ...(this.context && { context: this.context }),
    };
  }
}

/**
 * Validation error (400 Bad Request)
 * Thrown when input validation fails
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', context);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not found error (404 Not Found)
 * Thrown when resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 404, 'NOT_FOUND', context);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Unauthorized error (401 Unauthorized)
 * Thrown when authentication fails
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', context?: Record<string, unknown>) {
    super(message, 401, 'UNAUTHORIZED', context);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Forbidden error (403 Forbidden)
 * Thrown when authorized but lacks permission
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', context?: Record<string, unknown>) {
    super(message, 403, 'FORBIDDEN', context);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Conflict error (409 Conflict)
 * Thrown when state conflicts with operation (e.g., duplicate entity)
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', context);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Unprocessable entity error (422)
 * Thrown when request is well-formed but semantically incorrect
 */
export class UnprocessableEntityError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', context);
    Object.setPrototypeOf(this, UnprocessableEntityError.prototype);
  }
}

/**
 * Too many requests error (429)
 * Thrown when rate limit exceeded
 */
export class TooManyRequestsError extends AppError {
  public readonly retryAfter: number;
  
  constructor(message: string = 'Too many requests', retryAfter: number = 60) {
    super(message, 429, 'TOO_MANY_REQUESTS');
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}

/**
 * Service unavailable error (503)
 * Thrown when external service is down
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', context?: Record<string, unknown>) {
    super(message, 503, 'SERVICE_UNAVAILABLE', context);
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/**
 * Database error (500)
 * Thrown on database operation failures
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 500, 'DATABASE_ERROR', {
      originalMessage: originalError?.message,
    });
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Kafka error (503)
 * Thrown on Kafka connectivity/operation failures
 */
export class KafkaError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 503, 'KAFKA_ERROR', {
      originalMessage: originalError?.message,
    });
    Object.setPrototypeOf(this, KafkaError.prototype);
  }
}

/**
 * External service error (502)
 * Thrown when calling external API fails
 */
export class ExternalServiceError extends AppError {
  constructor(
    message: string,
    public readonly serviceName: string,
    originalError?: Error
  ) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', {
      service: serviceName,
      originalMessage: originalError?.message,
    });
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

// ============================================================================
// ERROR TYPE GUARDS
// ============================================================================

/**
 * Check if error is operational (expected)
 */
export function isOperationalError(error: unknown): error is AppError {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if error is a not found error
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

/**
 * Check if error is a 4xx client error
 */
export function isClientError(error: unknown): error is AppError {
  return error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500;
}

/**
 * Check if error is a 5xx server error
 */
export function isServerError(error: unknown): error is AppError {
  return error instanceof AppError && error.statusCode >= 500;
}

// ============================================================================
// ERROR RESPONSE FORMATTING
// ============================================================================

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
export function formatErrorResponse(
  error: unknown,
  correlationId?: string,
  includeTrace: boolean = false
): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: error.code,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      timestamp: error.timestamp.toISOString(),
      correlationId,
      ...(includeTrace && { trace: error.stack }),
    };
  }
  
  if (error instanceof Error) {
    return {
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      correlationId,
      ...(includeTrace && { trace: error.stack }),
    };
  }
  
  return {
    error: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
    timestamp: new Date().toISOString(),
    correlationId,
  };
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Global error handler middleware
 * Must be registered AFTER all other middleware and routes
 */
export function createErrorHandlerMiddleware(
  logger: ILogger,
  options?: {
    includeStackTrace?: boolean;
    isDevelopment?: boolean;
  }
) {
  const isDev = options?.isDevelopment ?? process.env.NODE_ENV === 'development';
  const includeStackTrace = options?.includeStackTrace ?? isDev;
  
  return (error: unknown, req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] ||
                           req.headers['x-request-id']) as string | undefined;
    
    // Log error with full context
    if (error instanceof AppError) {
      logger.warn(`${error.code}: ${error.message}`, {
        code: error.code,
        statusCode: error.statusCode,
        path: req.path,
        method: req.method,
        correlationId,
        ...(error.context && { context: error.context }),
      });
    } else if (error instanceof Error) {
      logger.error(`Unhandled error: ${error.message}`, error, {
        path: req.path,
        method: req.method,
        correlationId,
      });
    } else {
      logger.error('Unhandled unknown error', undefined, {
        error: String(error),
        path: req.path,
        method: req.method,
        correlationId,
      });
    }
    
    // Format and send response
    const formatted = formatErrorResponse(error, correlationId, includeStackTrace);
    res.status(formatted.statusCode).json(formatted);
  };
}

/**
 * Async error wrapper for Express route handlers
 * Catches unhandled rejections and passes to error handler
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler => {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Trust proxy and correlation ID middleware
 * Must be used before error handler
 */
export function createErrorContextMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Ensure correlation ID exists in response headers
    const correlationId = (req.headers['x-correlation-id'] ||
                           req.headers['x-request-id']) as string | undefined;
    
    if (correlationId) {
      res.setHeader('x-correlation-id', correlationId);
    }
    
    // Handle unhandled rejections during this request
    const unhandledRejectionHandler = (reason: unknown) => {
      logger?.error('Unhandled promise rejection', undefined, {
        reason: String(reason),
        path: req.path,
        correlationId,
      });
    };
    
    process.prependListener('unhandledRejection', unhandledRejectionHandler);
    
    res.on('finish', () => {
      process.removeListener('unhandledRejection', unhandledRejectionHandler);
    });
    
    next();
  };
}

// ============================================================================
// ERROR THROWING UTILITIES
// ============================================================================

/**
 * Throw error if condition is false
 */
export function assert(
  condition: unknown,
  message: string,
  errorType: typeof AppError = AppError
): asserts condition {
  if (!condition) {
    throw new errorType(message);
  }
}

/**
 * Throw NotFoundError with standard message
 */
export function throwNotFound(
  resource: string,
  id?: string
): never {
  const message = id
    ? `${resource} with ID "${id}" not found`
    : `${resource} not found`;
  throw new NotFoundError(message);
}

/**
 * Throw ConflictError for duplicate entity
 */
export function throwDuplicate(
  resource: string,
  identifier: string
): never {
  throw new ConflictError(`${resource} already exists: ${identifier}`);
}

/**
 * Throw ValidationError with field details
 */
export function throwValidationError(
  message: string,
  fields?: Record<string, string>
): never {
  throw new ValidationError(message, { fields });
}

/**
 * Throw UnauthorizedError with optional reason
 */
export function throwUnauthorized(reason: string = 'Authentication required'): never {
  throw new UnauthorizedError(reason);
}

/**
 * Throw ForbiddenError with permission context
 */
export function throwForbidden(
  action: string,
  resource: string,
  reason?: string
): never {
  const message = reason
    ? `${action} ${resource}: ${reason}`
    : `You do not have permission to ${action} ${resource}`;
  throw new ForbiddenError(message);
}

// ============================================================================
// BATCH ERROR HANDLING
// ============================================================================

/**
 * Manage multiple errors during batch operations
 */
export class BatchErrorCollector {
  private errors: AppError[] = [];
  
  add(error: AppError | Error, context?: Record<string, unknown>): void {
    if (error instanceof AppError) {
      this.errors.push(error);
    } else if (error instanceof Error) {
      this.errors.push(new AppError(error.message, 500, 'BATCH_ERROR', context));
    }
  }
  
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
  
  throwIfErrors(message?: string): void {
    if (this.hasErrors()) {
      throw new AppError(
        message || `Multiple errors occurred (${this.errors.length})`,
        400,
        'BATCH_ERRORS',
        { errors: this.errors.map(e => ({ code: e.code, message: e.message })) }
      );
    }
  }
  
  getErrors(): AppError[] {
    return [...this.errors];
  }
  
  clear(): void {
    this.errors = [];
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

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
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
  logger?: ILogger
): Promise<T> {
  const maxAttempts = config.maxAttempts || 3;
  const delayMs = config.delayMs || 100;
  const backoffMultiplier = config.backoffMultiplier || 2;
  const maxDelayMs = config.maxDelayMs || 5000;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        break;
      }
      
      // Check if error is retryable
      if (
        error instanceof AppError &&
        config.retryableErrors &&
        !config.retryableErrors.some(ErrorType => error instanceof ErrorType)
      ) {
        throw error;
      }
      
      // Calculate backoff
      const delayBackoff = Math.pow(backoffMultiplier, attempt - 1) * delayMs;
      const delay = Math.min(delayBackoff, maxDelayMs);
      
      logger?.debug(`Retrying after ${delay}ms (attempt ${attempt}/${maxAttempts})`, {
        error: lastError.message,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Unknown error in retry logic');
}

// Internal logger reference (set during middleware initialization)
let logger: ILogger | undefined;

export function setErrorLogger(l: ILogger): void {
  logger = l;
}
