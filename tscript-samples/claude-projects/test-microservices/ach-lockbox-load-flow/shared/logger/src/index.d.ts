/**
 * Structured Logging with Pino
 * Context-aware logging with correlation IDs, request tracking, and structured output
 */
import { Logger as PinoLogger } from 'pino';
import { Request, Response, NextFunction } from 'express';
/**
 * Application logger interface
 * Structured logging with context management
 */
export interface ILogger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: Error, meta?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): ILogger;
    raw(): PinoLogger;
}
/**
 * Logger configuration options
 */
export interface LoggerOptions {
    serviceName: string;
    level?: string;
    environment?: string;
    version?: string;
    prettyPrint?: boolean;
    includeSourceLocation?: boolean;
}
/**
 * Create a configured logger instance
 * Sets up correlation ID context, service name, and formatted output
 */
export declare function createLogger(options: LoggerOptions): ILogger;
export declare const correlationIdStorage: any;
/**
 * Get current correlation ID
 * Returns existing ID or generates new one
 */
export declare function getCorrelationId(): string;
/**
 * Set correlation ID in current context
 */
export declare function setCorrelationId(id: string): void;
/**
 * Request context for logging
 */
export interface LoggingContext {
    correlationId: string;
    userId?: string;
    entityId?: string;
    requestPath?: string;
    requestMethod?: string;
    responseStatus?: number;
    duration?: number;
}
export interface HttpRouteMetrics {
    route: string;
    method: string;
    totalRequests: number;
    totalErrors: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
    statusCounts: Record<string, number>;
}
export interface HttpMetricsSnapshot {
    serviceName: string;
    startedAt: string;
    totalRequests: number;
    totalErrors: number;
    averageLatencyMs: number;
    routes: HttpRouteMetrics[];
}
export declare class HttpMetricsCollector {
    private readonly serviceName;
    private readonly startedAt;
    private totalRequests;
    private totalErrors;
    private totalLatencyMs;
    private readonly routeMetrics;
    constructor(serviceName: string);
    record(method: string, route: string, statusCode: number, durationMs: number): void;
    snapshot(): HttpMetricsSnapshot;
}
export declare function createHttpMetricsMiddleware(collector: HttpMetricsCollector, options?: {
    ignorePaths?: string[];
}): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Get current logging context
 */
export declare function getLoggingContext(req?: Request): LoggingContext;
/**
 * Create HTTP request logging middleware
 * Logs all HTTP requests with correlation ID, duration, and response status
 */
export declare function createLogMiddleware(options?: {
    serviceName?: string;
    includeRequestBody?: boolean;
    includeResponseBody?: boolean;
    ignorePaths?: string[];
}): any;
/**
 * Middleware to add request context to logger
 * Can be used after createLogMiddleware to enhance logging with business context
 */
export declare function createContextLoggingMiddleware(): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Create logger with request context
 * Useful for logging within route handlers
 */
export declare function createContextualLogger(baseLogger: ILogger, context: LoggingContext): ILogger;
/**
 * Log with automatic error context
 */
export declare function logError(logger: ILogger, message: string, error: Error, meta?: Record<string, unknown>): void;
/**
 * Log with performance timing
 */
export declare function logWithTiming(logger: ILogger, message: string, duration: number, meta?: Record<string, unknown>): void;
/**
 * Log database query with timing
 */
export declare function logDatabaseQuery(logger: ILogger, query: string, duration: number, params?: unknown[]): void;
/**
 * Log Kafka message
 */
export declare function logKafkaMessage(logger: ILogger, topic: string, message: unknown, direction: 'publish' | 'consume'): void;
/**
 * Create debug logger for specific domain
 */
export declare function createDomainLogger(baseLogger: ILogger, domain: string): ILogger;
/**
 * Silent logger for testing
 */
export declare function createSilentLogger(): ILogger;
/**
 * Batch logger for logging multiple messages efficiently
 * Useful for bulk operations
 */
export declare class BatchLogger {
    private logger;
    private messages;
    constructor(logger: ILogger);
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: Error, meta?: Record<string, unknown>): void;
    flush(): void;
}
