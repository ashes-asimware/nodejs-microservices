"use strict";
/**
 * Structured Logging with Pino
 * Context-aware logging with correlation IDs, request tracking, and structured output
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchLogger = exports.HttpMetricsCollector = exports.correlationIdStorage = void 0;
exports.createLogger = createLogger;
exports.getCorrelationId = getCorrelationId;
exports.setCorrelationId = setCorrelationId;
exports.createHttpMetricsMiddleware = createHttpMetricsMiddleware;
exports.getLoggingContext = getLoggingContext;
exports.createLogMiddleware = createLogMiddleware;
exports.createContextLoggingMiddleware = createContextLoggingMiddleware;
exports.createContextualLogger = createContextualLogger;
exports.logError = logError;
exports.logWithTiming = logWithTiming;
exports.logDatabaseQuery = logDatabaseQuery;
exports.logKafkaMessage = logKafkaMessage;
exports.createDomainLogger = createDomainLogger;
exports.createSilentLogger = createSilentLogger;
const pino_1 = __importDefault(require("pino"));
const pino_http_1 = __importDefault(require("pino-http"));
const uuid_1 = require("uuid");
// ============================================================================
// LOGGER FACTORY
// ============================================================================
/**
 * Create a configured logger instance
 * Sets up correlation ID context, service name, and formatted output
 */
function createLogger(options) {
    const level = options.level || process.env.LOG_LEVEL || 'info';
    const env = options.environment || process.env.NODE_ENV || 'development';
    const prettyPrint = options.prettyPrint ?? (env === 'development');
    const pinoOptions = {
        level,
        transport: prettyPrint
            ? {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                    singleLine: false,
                    messageFormat: '{levelLabel} [{name}] {msg}',
                },
            }
            : undefined,
        base: {
            service: options.serviceName,
            version: options.version || '1.0.0',
            environment: env,
        },
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
    };
    const baseLogger = (0, pino_1.default)(pinoOptions);
    return new PinoLoggerAdapter(baseLogger);
}
/**
 * Adapter class implementing ILogger interface
 */
class PinoLoggerAdapter {
    constructor(pinoLogger) {
        this.pinoLogger = pinoLogger;
    }
    debug(message, meta) {
        this.pinoLogger.debug(meta, message);
    }
    info(message, meta) {
        this.pinoLogger.info(meta, message);
    }
    warn(message, meta) {
        this.pinoLogger.warn(meta, message);
    }
    error(message, error, meta) {
        if (error) {
            this.pinoLogger.error({ ...meta, error: { message: error.message, stack: error.stack } }, message);
        }
        else {
            this.pinoLogger.error(meta, message);
        }
    }
    child(context) {
        const childLogger = this.pinoLogger.child(context);
        return new PinoLoggerAdapter(childLogger);
    }
    raw() {
        return this.pinoLogger;
    }
}
// ============================================================================
// CORRELATION ID MANAGEMENT
// ============================================================================
/**
 * AsyncLocalStorage for correlation IDs
 * Maintains request-scoped context without passing through all layers
 */
const async_hooks_1 = require("async_hooks");
exports.correlationIdStorage = new async_hooks_1.AsyncLocalStorage();
/**
 * Get current correlation ID
 * Returns existing ID or generates new one
 */
function getCorrelationId() {
    return exports.correlationIdStorage.getStore() || (0, uuid_1.v4)();
}
/**
 * Set correlation ID in current context
 */
function setCorrelationId(id) {
    exports.correlationIdStorage.enterWith(id);
}
class HttpMetricsCollector {
    constructor(serviceName) {
        this.serviceName = serviceName;
        this.startedAt = new Date();
        this.totalRequests = 0;
        this.totalErrors = 0;
        this.totalLatencyMs = 0;
        this.routeMetrics = new Map();
    }
    record(method, route, statusCode, durationMs) {
        const normalizedMethod = method.toUpperCase();
        const key = `${normalizedMethod} ${route}`;
        const existing = this.routeMetrics.get(key) || {
            route,
            method: normalizedMethod,
            totalRequests: 0,
            totalErrors: 0,
            totalLatencyMs: 0,
            maxLatencyMs: 0,
            statusCounts: new Map(),
        };
        this.totalRequests += 1;
        this.totalLatencyMs += durationMs;
        existing.totalRequests += 1;
        existing.totalLatencyMs += durationMs;
        existing.maxLatencyMs = Math.max(existing.maxLatencyMs, durationMs);
        if (statusCode >= 400) {
            this.totalErrors += 1;
            existing.totalErrors += 1;
        }
        existing.statusCounts.set(statusCode, (existing.statusCounts.get(statusCode) || 0) + 1);
        this.routeMetrics.set(key, existing);
    }
    snapshot() {
        const routes = Array.from(this.routeMetrics.values())
            .map((metric) => {
            const statusCounts = {};
            metric.statusCounts.forEach((count, statusCode) => {
                statusCounts[String(statusCode)] = count;
            });
            return {
                route: metric.route,
                method: metric.method,
                totalRequests: metric.totalRequests,
                totalErrors: metric.totalErrors,
                averageLatencyMs: metric.totalRequests > 0
                    ? Math.round((metric.totalLatencyMs / metric.totalRequests) * 100) / 100
                    : 0,
                maxLatencyMs: Math.round(metric.maxLatencyMs * 100) / 100,
                statusCounts,
            };
        })
            .sort((a, b) => b.totalRequests - a.totalRequests);
        return {
            serviceName: this.serviceName,
            startedAt: this.startedAt.toISOString(),
            totalRequests: this.totalRequests,
            totalErrors: this.totalErrors,
            averageLatencyMs: this.totalRequests > 0
                ? Math.round((this.totalLatencyMs / this.totalRequests) * 100) / 100
                : 0,
            routes,
        };
    }
}
exports.HttpMetricsCollector = HttpMetricsCollector;
function normalizeRoutePath(path) {
    return path
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
        .replace(/\b\d+\b/g, ':id');
}
function createHttpMetricsMiddleware(collector, options) {
    const ignorePaths = options?.ignorePaths || ['/health', '/metrics', '/status'];
    return (req, res, next) => {
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const path = req.path || req.originalUrl || '/';
            if (ignorePaths.some((ignorePath) => path.startsWith(ignorePath))) {
                return;
            }
            const durationMs = Number(process.hrtime.bigint() - start) / 1000000;
            collector.record(req.method, normalizeRoutePath(path), res.statusCode, durationMs);
        });
        next();
    };
}
/**
 * Get current logging context
 */
function getLoggingContext(req) {
    const correlationId = (req?.headers['x-correlation-id'] ||
        req?.headers['x-request-id'] ||
        getCorrelationId());
    return {
        correlationId,
        userId: (req?.headers['x-user-id'] || req?.headers['x-user']),
        entityId: (req?.headers['x-entity-id']),
        requestPath: req?.path,
        requestMethod: req?.method,
    };
}
// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================
/**
 * Create HTTP request logging middleware
 * Logs all HTTP requests with correlation ID, duration, and response status
 */
function createLogMiddleware(options) {
    const ignorePaths = options?.ignorePaths || ['/health', '/metrics', '/status'];
    return (0, pino_http_1.default)({
        genReqId: (req) => {
            // Use existing correlation ID or generate new one
            const id = (req.headers['x-correlation-id'] ||
                req.headers['x-request-id'] ||
                (0, uuid_1.v4)());
            setCorrelationId(id);
            return id;
        },
        customSuccessMessage: (req, res) => {
            return `${req.method} ${req.path} - ${res.statusCode}`;
        },
        customErrorMessage: (req, res, error) => {
            return `${req.method} ${req.path} - Error ${res.statusCode}`;
        },
        autoLogging: {
            ignore: (req) => {
                return ignorePaths.some((path) => req.path?.startsWith(path));
            },
        },
        serializers: {
            req: (req) => ({
                id: req.id,
                method: req.method,
                path: req.path,
                url: req.url,
                headers: {
                    // Include correlation headers
                    'x-correlation-id': req.headers['x-correlation-id'],
                    'x-request-id': req.headers['x-request-id'],
                    'x-user-id': req.headers['x-user-id'],
                    'x-entity-id': req.headers['x-entity-id'],
                    'user-agent': req.headers['user-agent'],
                },
                ...(options?.includeRequestBody && { body: req.body }),
            }),
            res: (res) => ({
                statusCode: res.statusCode,
                headers: {
                    'content-type': res.headers['content-type'],
                    'content-length': res.headers['content-length'],
                },
                ...(options?.includeResponseBody && { body: res.body }),
            }),
        },
    });
}
/**
 * Middleware to add request context to logger
 * Can be used after createLogMiddleware to enhance logging with business context
 */
function createContextLoggingMiddleware() {
    return (req, res, next) => {
        // Extract and store context
        const correlationId = (req.headers['x-correlation-id'] ||
            req.headers['x-request-id'] ||
            (0, uuid_1.v4)());
        const userId = (req.headers['x-user-id'] || '');
        const entityId = (req.headers['x-entity-id'] || '');
        // Store in request for later use
        req.loggingContext = {
            correlationId,
            userId,
            entityId,
            startTime: Date.now(),
        };
        // Add context to response header for distributed tracing
        res.setHeader('x-correlation-id', correlationId);
        // Capture response finish to log duration
        res.on('finish', () => {
            const duration = Date.now() - req.loggingContext.startTime;
            req.loggingContext.duration = duration;
        });
        next();
    };
}
// ============================================================================
// LOGGER UTILITIES
// ============================================================================
/**
 * Create logger with request context
 * Useful for logging within route handlers
 */
function createContextualLogger(baseLogger, context) {
    return baseLogger.child({
        correlationId: context.correlationId,
        userId: context.userId,
        entityId: context.entityId,
        requestPath: context.requestPath,
        requestMethod: context.requestMethod,
    });
}
/**
 * Log with automatic error context
 */
function logError(logger, message, error, meta) {
    logger.error(message, error, {
        ...meta,
        errorType: error.constructor.name,
        errorMessage: error.message,
    });
}
/**
 * Log with performance timing
 */
function logWithTiming(logger, message, duration, meta) {
    logger.info(message, {
        ...meta,
        duration_ms: duration,
        slow: duration > 1000, // Flag if duration exceeds 1s
    });
}
/**
 * Log database query with timing
 */
function logDatabaseQuery(logger, query, duration, params) {
    logger.debug('Database query', {
        query: query.substring(0, 200), // Truncate for logging
        duration_ms: duration,
        paramCount: params?.length || 0,
        slow: duration > 500, // Flag if query takes > 500ms
    });
}
/**
 * Log Kafka message
 */
function logKafkaMessage(logger, topic, message, direction) {
    logger.debug(`Kafka ${direction}`, {
        topic,
        messageType: message?.type || 'unknown',
        correlationId: message?.correlationId,
    });
}
/**
 * Create debug logger for specific domain
 */
function createDomainLogger(baseLogger, domain) {
    return baseLogger.child({ domain });
}
/**
 * Silent logger for testing
 */
function createSilentLogger() {
    const pinoLogger = (0, pino_1.default)({ level: 'silent' });
    return new PinoLoggerAdapter(pinoLogger);
}
// ============================================================================
// BATCH LOGGING
// ============================================================================
/**
 * Batch logger for logging multiple messages efficiently
 * Useful for bulk operations
 */
class BatchLogger {
    constructor(logger) {
        this.logger = logger;
        this.messages = [];
    }
    debug(message, meta) {
        this.messages.push({ level: 'debug', message, meta });
    }
    info(message, meta) {
        this.messages.push({ level: 'info', message, meta });
    }
    warn(message, meta) {
        this.messages.push({ level: 'warn', message, meta });
    }
    error(message, error, meta) {
        this.messages.push({
            level: 'error',
            message,
            meta: { ...meta, error: error?.message },
        });
    }
    flush() {
        this.messages.forEach(msg => {
            switch (msg.level) {
                case 'debug':
                    this.logger.debug(msg.message, msg.meta);
                    break;
                case 'info':
                    this.logger.info(msg.message, msg.meta);
                    break;
                case 'warn':
                    this.logger.warn(msg.message, msg.meta);
                    break;
                case 'error':
                    this.logger.error(msg.message, undefined, msg.meta);
                    break;
            }
        });
        this.messages = [];
    }
}
exports.BatchLogger = BatchLogger;
//# sourceMappingURL=index.js.map