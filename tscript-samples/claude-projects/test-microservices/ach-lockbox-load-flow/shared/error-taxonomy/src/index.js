"use strict";
/**
 * Error Taxonomy and Handlers
 * Standard error types, HTTP status mapping, and error handling middleware
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchErrorCollector = exports.asyncHandler = exports.ExternalServiceError = exports.KafkaError = exports.DatabaseError = exports.ServiceUnavailableError = exports.TooManyRequestsError = exports.UnprocessableEntityError = exports.ConflictError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
exports.isOperationalError = isOperationalError;
exports.isValidationError = isValidationError;
exports.isNotFoundError = isNotFoundError;
exports.isClientError = isClientError;
exports.isServerError = isServerError;
exports.formatErrorResponse = formatErrorResponse;
exports.createErrorHandlerMiddleware = createErrorHandlerMiddleware;
exports.createErrorContextMiddleware = createErrorContextMiddleware;
exports.assert = assert;
exports.throwNotFound = throwNotFound;
exports.throwDuplicate = throwDuplicate;
exports.throwValidationError = throwValidationError;
exports.throwUnauthorized = throwUnauthorized;
exports.throwForbidden = throwForbidden;
exports.withRetry = withRetry;
exports.setErrorLogger = setErrorLogger;
// ============================================================================
// ERROR HIERARCHY
// ============================================================================
/**
 * Base application error
 * All domain errors should extend this class
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', context) {
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
exports.AppError = AppError;
/**
 * Validation error (400 Bad Request)
 * Thrown when input validation fails
 */
class ValidationError extends AppError {
    constructor(message, context) {
        super(message, 400, 'VALIDATION_ERROR', context);
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}
exports.ValidationError = ValidationError;
/**
 * Not found error (404 Not Found)
 * Thrown when resource doesn't exist
 */
class NotFoundError extends AppError {
    constructor(message, context) {
        super(message, 404, 'NOT_FOUND', context);
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
}
exports.NotFoundError = NotFoundError;
/**
 * Unauthorized error (401 Unauthorized)
 * Thrown when authentication fails
 */
class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized', context) {
        super(message, 401, 'UNAUTHORIZED', context);
        Object.setPrototypeOf(this, UnauthorizedError.prototype);
    }
}
exports.UnauthorizedError = UnauthorizedError;
/**
 * Forbidden error (403 Forbidden)
 * Thrown when authorized but lacks permission
 */
class ForbiddenError extends AppError {
    constructor(message = 'Forbidden', context) {
        super(message, 403, 'FORBIDDEN', context);
        Object.setPrototypeOf(this, ForbiddenError.prototype);
    }
}
exports.ForbiddenError = ForbiddenError;
/**
 * Conflict error (409 Conflict)
 * Thrown when state conflicts with operation (e.g., duplicate entity)
 */
class ConflictError extends AppError {
    constructor(message, context) {
        super(message, 409, 'CONFLICT', context);
        Object.setPrototypeOf(this, ConflictError.prototype);
    }
}
exports.ConflictError = ConflictError;
/**
 * Unprocessable entity error (422)
 * Thrown when request is well-formed but semantically incorrect
 */
class UnprocessableEntityError extends AppError {
    constructor(message, context) {
        super(message, 422, 'UNPROCESSABLE_ENTITY', context);
        Object.setPrototypeOf(this, UnprocessableEntityError.prototype);
    }
}
exports.UnprocessableEntityError = UnprocessableEntityError;
/**
 * Too many requests error (429)
 * Thrown when rate limit exceeded
 */
class TooManyRequestsError extends AppError {
    constructor(message = 'Too many requests', retryAfter = 60) {
        super(message, 429, 'TOO_MANY_REQUESTS');
        this.retryAfter = retryAfter;
        Object.setPrototypeOf(this, TooManyRequestsError.prototype);
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
/**
 * Service unavailable error (503)
 * Thrown when external service is down
 */
class ServiceUnavailableError extends AppError {
    constructor(message = 'Service unavailable', context) {
        super(message, 503, 'SERVICE_UNAVAILABLE', context);
        Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
/**
 * Database error (500)
 * Thrown on database operation failures
 */
class DatabaseError extends AppError {
    constructor(message, originalError) {
        super(message, 500, 'DATABASE_ERROR', {
            originalMessage: originalError?.message,
        });
        Object.setPrototypeOf(this, DatabaseError.prototype);
    }
}
exports.DatabaseError = DatabaseError;
/**
 * Kafka error (503)
 * Thrown on Kafka connectivity/operation failures
 */
class KafkaError extends AppError {
    constructor(message, originalError) {
        super(message, 503, 'KAFKA_ERROR', {
            originalMessage: originalError?.message,
        });
        Object.setPrototypeOf(this, KafkaError.prototype);
    }
}
exports.KafkaError = KafkaError;
/**
 * External service error (502)
 * Thrown when calling external API fails
 */
class ExternalServiceError extends AppError {
    constructor(message, serviceName, originalError) {
        super(message, 502, 'EXTERNAL_SERVICE_ERROR', {
            service: serviceName,
            originalMessage: originalError?.message,
        });
        this.serviceName = serviceName;
        Object.setPrototypeOf(this, ExternalServiceError.prototype);
    }
}
exports.ExternalServiceError = ExternalServiceError;
// ============================================================================
// ERROR TYPE GUARDS
// ============================================================================
/**
 * Check if error is operational (expected)
 */
function isOperationalError(error) {
    if (error instanceof AppError) {
        return error.isOperational;
    }
    return false;
}
/**
 * Check if error is a validation error
 */
function isValidationError(error) {
    return error instanceof ValidationError;
}
/**
 * Check if error is a not found error
 */
function isNotFoundError(error) {
    return error instanceof NotFoundError;
}
/**
 * Check if error is a 4xx client error
 */
function isClientError(error) {
    return error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500;
}
/**
 * Check if error is a 5xx server error
 */
function isServerError(error) {
    return error instanceof AppError && error.statusCode >= 500;
}
/**
 * Format error for HTTP response
 */
function formatErrorResponse(error, correlationId, includeTrace = false) {
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
function createErrorHandlerMiddleware(logger, options) {
    const isDev = options?.isDevelopment ?? process.env.NODE_ENV === 'development';
    const includeStackTrace = options?.includeStackTrace ?? isDev;
    return (error, req, res, next) => {
        const correlationId = (req.headers['x-correlation-id'] ||
            req.headers['x-request-id']);
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
        }
        else if (error instanceof Error) {
            logger.error(`Unhandled error: ${error.message}`, error, {
                path: req.path,
                method: req.method,
                correlationId,
            });
        }
        else {
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
const asyncHandler = (fn) => {
    return (req, res, next) => {
        void Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
/**
 * Trust proxy and correlation ID middleware
 * Must be used before error handler
 */
function createErrorContextMiddleware() {
    return (req, res, next) => {
        // Ensure correlation ID exists in response headers
        const correlationId = (req.headers['x-correlation-id'] ||
            req.headers['x-request-id']);
        if (correlationId) {
            res.setHeader('x-correlation-id', correlationId);
        }
        // Handle unhandled rejections during this request
        const unhandledRejectionHandler = (reason) => {
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
function assert(condition, message, errorType = AppError) {
    if (!condition) {
        throw new errorType(message);
    }
}
/**
 * Throw NotFoundError with standard message
 */
function throwNotFound(resource, id) {
    const message = id
        ? `${resource} with ID "${id}" not found`
        : `${resource} not found`;
    throw new NotFoundError(message);
}
/**
 * Throw ConflictError for duplicate entity
 */
function throwDuplicate(resource, identifier) {
    throw new ConflictError(`${resource} already exists: ${identifier}`);
}
/**
 * Throw ValidationError with field details
 */
function throwValidationError(message, fields) {
    throw new ValidationError(message, { fields });
}
/**
 * Throw UnauthorizedError with optional reason
 */
function throwUnauthorized(reason = 'Authentication required') {
    throw new UnauthorizedError(reason);
}
/**
 * Throw ForbiddenError with permission context
 */
function throwForbidden(action, resource, reason) {
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
class BatchErrorCollector {
    constructor() {
        this.errors = [];
    }
    add(error, context) {
        if (error instanceof AppError) {
            this.errors.push(error);
        }
        else if (error instanceof Error) {
            this.errors.push(new AppError(error.message, 500, 'BATCH_ERROR', context));
        }
    }
    hasErrors() {
        return this.errors.length > 0;
    }
    throwIfErrors(message) {
        if (this.hasErrors()) {
            throw new AppError(message || `Multiple errors occurred (${this.errors.length})`, 400, 'BATCH_ERRORS', { errors: this.errors.map(e => ({ code: e.code, message: e.message })) });
        }
    }
    getErrors() {
        return [...this.errors];
    }
    clear() {
        this.errors = [];
    }
}
exports.BatchErrorCollector = BatchErrorCollector;
/**
 * Retry async function with exponential backoff
 */
async function withRetry(fn, config = {}, logger) {
    const maxAttempts = config.maxAttempts || 3;
    const delayMs = config.delayMs || 100;
    const backoffMultiplier = config.backoffMultiplier || 2;
    const maxDelayMs = config.maxDelayMs || 5000;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === maxAttempts) {
                break;
            }
            // Check if error is retryable
            if (error instanceof AppError &&
                config.retryableErrors &&
                !config.retryableErrors.some(ErrorType => error instanceof ErrorType)) {
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
let logger;
function setErrorLogger(l) {
    logger = l;
}
//# sourceMappingURL=index.js.map