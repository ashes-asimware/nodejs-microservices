/**
 * Structured Logging with Pino
 * Context-aware logging with correlation IDs, request tracking, and structured output
 */

import pino, { Logger as PinoLogger } from 'pino';
import pinoHttp from 'pino-http';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

/**
 * Application logger interface
 * Structured logging with context management
 */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  
  // Child loggers with additional context
  child(context: Record<string, unknown>): ILogger;
  
  // Access underlying Pino logger
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

// ============================================================================
// LOGGER FACTORY
// ============================================================================

/**
 * Create a configured logger instance
 * Sets up correlation ID context, service name, and formatted output
 */
export function createLogger(options: LoggerOptions): ILogger {
  const level = options.level || process.env.LOG_LEVEL || 'info';
  const env = options.environment || process.env.NODE_ENV || 'development';
  const prettyPrint = options.prettyPrint ?? (env === 'development');
  
  const pinoOptions: pino.LoggerOptions = {
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
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  
  const baseLogger = pino(pinoOptions);
  
  return new PinoLoggerAdapter(baseLogger);
}

/**
 * Adapter class implementing ILogger interface
 */
class PinoLoggerAdapter implements ILogger {
  constructor(private pinoLogger: PinoLogger) {}
  
  debug(message: string, meta?: Record<string, unknown>): void {
    this.pinoLogger.debug(meta, message);
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    this.pinoLogger.info(meta, message);
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    this.pinoLogger.warn(meta, message);
  }
  
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (error) {
      this.pinoLogger.error(
        { ...meta, error: { message: error.message, stack: error.stack } },
        message
      );
    } else {
      this.pinoLogger.error(meta, message);
    }
  }
  
  child(context: Record<string, unknown>): ILogger {
    const childLogger = this.pinoLogger.child(context);
    return new PinoLoggerAdapter(childLogger);
  }
  
  raw(): PinoLogger {
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
import { AsyncLocalStorage } from 'async_hooks';

export const correlationIdStorage = new AsyncLocalStorage<string>();

/**
 * Get current correlation ID
 * Returns existing ID or generates new one
 */
export function getCorrelationId(): string {
  return correlationIdStorage.getStore() || uuidv4();
}

/**
 * Set correlation ID in current context
 */
export function setCorrelationId(id: string): void {
  correlationIdStorage.enterWith(id);
}

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

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

interface RouteMetricsInternal {
  route: string;
  method: string;
  totalRequests: number;
  totalErrors: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  statusCounts: Map<number, number>;
}

export class HttpMetricsCollector {
  private readonly startedAt = new Date();
  private totalRequests = 0;
  private totalErrors = 0;
  private totalLatencyMs = 0;
  private readonly routeMetrics = new Map<string, RouteMetricsInternal>();

  constructor(private readonly serviceName: string) {}

  record(method: string, route: string, statusCode: number, durationMs: number): void {
    const normalizedMethod = method.toUpperCase();
    const key = `${normalizedMethod} ${route}`;
    const existing = this.routeMetrics.get(key) || {
      route,
      method: normalizedMethod,
      totalRequests: 0,
      totalErrors: 0,
      totalLatencyMs: 0,
      maxLatencyMs: 0,
      statusCounts: new Map<number, number>(),
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

  snapshot(): HttpMetricsSnapshot {
    const routes = Array.from(this.routeMetrics.values())
      .map((metric) => {
        const statusCounts: Record<string, number> = {};
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

function normalizeRoutePath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\b\d+\b/g, ':id');
}

export function createHttpMetricsMiddleware(
  collector: HttpMetricsCollector,
  options?: {
    ignorePaths?: string[];
  }
) {
  const ignorePaths = options?.ignorePaths || ['/health', '/metrics', '/status'];

  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const path = req.path || req.originalUrl || '/';
      if (ignorePaths.some((ignorePath) => path.startsWith(ignorePath))) {
        return;
      }

      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      collector.record(req.method, normalizeRoutePath(path), res.statusCode, durationMs);
    });

    next();
  };
}

/**
 * Get current logging context
 */
export function getLoggingContext(req?: Request): LoggingContext {
  const correlationId = (req?.headers['x-correlation-id'] || 
                         req?.headers['x-request-id'] ||
                         getCorrelationId()) as string;
  
  return {
    correlationId,
    userId: (req?.headers['x-user-id'] || req?.headers['x-user']) as string | undefined,
    entityId: (req?.headers['x-entity-id']) as string | undefined,
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
export function createLogMiddleware(options?: {
  serviceName?: string;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  ignorePaths?: string[];
}) {
  const ignorePaths = options?.ignorePaths || ['/health', '/metrics', '/status'];
  
  return pinoHttp({
    genReqId: (req: any) => {
      // Use existing correlation ID or generate new one
      const id = (req.headers['x-correlation-id'] ||
                  req.headers['x-request-id'] ||
                  uuidv4()) as string;
      setCorrelationId(id);
      return id;
    },
    
    customSuccessMessage: (req: any, res: any) => {
      return `${req.method} ${req.path} - ${res.statusCode}`;
    },
    
    customErrorMessage: (req: any, res: any, error: any) => {
      return `${req.method} ${req.path} - Error ${res.statusCode}`;
    },

    autoLogging: {
      ignore: (req: any) => {
        return ignorePaths.some((path) => req.path?.startsWith(path));
      },
    },
    
    serializers: {
      req: (req: any) => ({
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
      
      res: (res: any) => ({
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
export function createContextLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract and store context
    const correlationId = (req.headers['x-correlation-id'] || 
                           req.headers['x-request-id'] ||
                           uuidv4()) as string;
    const userId = (req.headers['x-user-id'] || '') as string;
    const entityId = (req.headers['x-entity-id'] || '') as string;
    
    // Store in request for later use
    (req as any).loggingContext = {
      correlationId,
      userId,
      entityId,
      startTime: Date.now(),
    };
    
    // Add context to response header for distributed tracing
    res.setHeader('x-correlation-id', correlationId);
    
    // Capture response finish to log duration
    res.on('finish', () => {
      const duration = Date.now() - (req as any).loggingContext.startTime;
      (req as any).loggingContext.duration = duration;
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
export function createContextualLogger(
  baseLogger: ILogger,
  context: LoggingContext
): ILogger {
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
export function logError(
  logger: ILogger,
  message: string,
  error: Error,
  meta?: Record<string, unknown>
): void {
  logger.error(message, error, {
    ...meta,
    errorType: error.constructor.name,
    errorMessage: error.message,
  });
}

/**
 * Log with performance timing
 */
export function logWithTiming(
  logger: ILogger,
  message: string,
  duration: number,
  meta?: Record<string, unknown>
): void {
  logger.info(message, {
    ...meta,
    duration_ms: duration,
    slow: duration > 1000, // Flag if duration exceeds 1s
  });
}

/**
 * Log database query with timing
 */
export function logDatabaseQuery(
  logger: ILogger,
  query: string,
  duration: number,
  params?: unknown[]
): void {
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
export function logKafkaMessage(
  logger: ILogger,
  topic: string,
  message: unknown,
  direction: 'publish' | 'consume'
): void {
  logger.debug(`Kafka ${direction}`, {
    topic,
    messageType: (message as any)?.type || 'unknown',
    correlationId: (message as any)?.correlationId,
  });
}

/**
 * Create debug logger for specific domain
 */
export function createDomainLogger(
  baseLogger: ILogger,
  domain: string
): ILogger {
  return baseLogger.child({ domain });
}

/**
 * Silent logger for testing
 */
export function createSilentLogger(): ILogger {
  const pinoLogger = pino({ level: 'silent' });
  return new PinoLoggerAdapter(pinoLogger);
}

// ============================================================================
// BATCH LOGGING
// ============================================================================

/**
 * Batch logger for logging multiple messages efficiently
 * Useful for bulk operations
 */
export class BatchLogger {
  private messages: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
  
  constructor(private logger: ILogger) {}
  
  debug(message: string, meta?: Record<string, unknown>): void {
    this.messages.push({ level: 'debug', message, meta });
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    this.messages.push({ level: 'info', message, meta });
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    this.messages.push({ level: 'warn', message, meta });
  }
  
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.messages.push({
      level: 'error',
      message,
      meta: { ...meta, error: error?.message },
    });
  }
  
  flush(): void {
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
