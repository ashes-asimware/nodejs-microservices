import express, { NextFunction, Request, Response } from 'express';
import httpProxy from 'http-proxy';
import { v4 as uuidv4 } from 'uuid';
import {
  DecodedToken,
  Role,
  extractTokenFromHeader,
  validateAndDecodeToken,
} from '@ach-lockbox/auth-helpers';
import {
  createHttpMetricsMiddleware,
  createLogger,
  createLogMiddleware,
  HttpMetricsCollector,
} from '@ach-lockbox/logger';
import {
  createErrorHandlerMiddleware,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@ach-lockbox/error-taxonomy';

const SERVICE_NAME = 'api-gateway';
const PORT = Number(process.env.PORT || 3000);
const REQUIRE_AUTH = String(process.env.REQUIRE_AUTH || 'false').toLowerCase() === 'true';
const RATE_LIMIT_ENABLED = String(process.env.RATE_LIMIT_ENABLED || 'true').toLowerCase() === 'true';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120);
const RATE_LIMIT_EXEMPT_PATHS = String(process.env.RATE_LIMIT_EXEMPT_PATHS || '/health,/metrics')
  .split(',')
  .map((path) => path.trim())
  .filter((path) => path.length > 0);
const CIRCUIT_FAILURE_THRESHOLD = Number(process.env.CIRCUIT_FAILURE_THRESHOLD || 5);
const CIRCUIT_OPEN_MS = Number(process.env.CIRCUIT_OPEN_MS || 30000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 10000);

const logger = createLogger({
  serviceName: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  xfwd: true,
  proxyTimeout: UPSTREAM_TIMEOUT_MS,
  timeout: UPSTREAM_TIMEOUT_MS,
});

app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));
const metricsCollector = new HttpMetricsCollector(SERVICE_NAME);
app.use(createHttpMetricsMiddleware(metricsCollector));

interface RouteTarget {
  name: string;
  prefix: string;
  target: string;
  allowedRoles: Role[];
}

const routes: RouteTarget[] = [
  {
    name: 'load-service',
    prefix: '/api/load-service',
    target: process.env.LOAD_SERVICE_URL || 'http://localhost:3020',
    allowedRoles: ['broker-admin', 'carrier-user', 'factor-user', 'read-only', 'system'],
  },
  {
    name: 'invoice-service',
    prefix: '/api/invoice-service',
    target: process.env.INVOICE_SERVICE_URL || 'http://localhost:3021',
    allowedRoles: ['broker-admin', 'carrier-user', 'factor-user', 'read-only', 'system'],
  },
  {
    name: 'payment-service',
    prefix: '/api/payment-service',
    target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3023',
    allowedRoles: ['broker-admin', 'factor-user', 'read-only', 'system'],
  },
  {
    name: 'reconciliation-service',
    prefix: '/api/reconciliation-service',
    target: process.env.RECONCILIATION_SERVICE_URL || 'http://localhost:3026',
    allowedRoles: ['broker-admin', 'read-only', 'system'],
  },
];

interface AuthenticatedGatewayRequest extends Request {
  user?: DecodedToken;
}

interface RateLimitEntry {
  count: number;
  startedAt: number;
}

interface RateLimitResult {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
let rateLimitRejectedCount = 0;

interface CircuitState {
  failures: number;
  openUntil: number;
}

const circuitStates = new Map<string, CircuitState>();

function getClientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function isRateLimitExempt(req: Request): boolean {
  const normalizedPath = req.path || '/';
  return RATE_LIMIT_EXEMPT_PATHS.some((exemptPath) => normalizedPath === exemptPath || normalizedPath.startsWith(`${exemptPath}/`));
}

function enforceRateLimit(req: Request): RateLimitResult {
  const resetAt = Date.now() + RATE_LIMIT_WINDOW_MS;
  if (!RATE_LIMIT_ENABLED || isRateLimitExempt(req)) {
    return {
      limited: false,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: RATE_LIMIT_MAX_REQUESTS,
      resetAt,
    };
  }

  const now = Date.now();
  const key = getClientKey(req);
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, startedAt: now });
    return {
      limited: false,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      limited: true,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: 0,
      resetAt: entry.startedAt + RATE_LIMIT_WINDOW_MS,
    };
  }

  entry.count += 1;
  rateLimitStore.set(key, entry);
  return {
    limited: false,
    limit: RATE_LIMIT_MAX_REQUESTS,
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.count,
    resetAt: entry.startedAt + RATE_LIMIT_WINDOW_MS,
  };
}

const rateLimitCleanupIntervalMs = Math.max(5000, Math.floor(RATE_LIMIT_WINDOW_MS / 2));
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.startedAt > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}, rateLimitCleanupIntervalMs).unref();

function enforceAuth(req: AuthenticatedGatewayRequest): void {
  if (!REQUIRE_AUTH) {
    return;
  }

  const token = extractTokenFromHeader(req.headers.authorization);
  const decoded = validateAndDecodeToken(token, {
    publicKey: process.env.JWT_PUBLIC_KEY || '',
    issuer: process.env.JWT_ISSUER || 'ach-lockbox',
    audience: process.env.JWT_AUDIENCE || 'ach-lockbox-api',
  });

  req.user = decoded;
}

function enforceRoutePolicy(req: AuthenticatedGatewayRequest, route: RouteTarget): void {
  if (!REQUIRE_AUTH) {
    return;
  }

  if (!req.user) {
    throw new UnauthorizedError('Authenticated user missing');
  }

  if (!route.allowedRoles.includes(req.user.role)) {
    throw new ForbiddenError(`Role ${req.user.role} cannot access ${route.name}`);
  }
}

function checkCircuit(route: RouteTarget): void {
  const state = circuitStates.get(route.name);
  if (!state) {
    return;
  }

  if (state.openUntil > Date.now()) {
    throw new ForbiddenError(`Circuit open for ${route.name}`);
  }

  if (state.openUntil <= Date.now()) {
    circuitStates.set(route.name, { failures: 0, openUntil: 0 });
  }
}

function markFailure(route: RouteTarget): void {
  const current = circuitStates.get(route.name) || { failures: 0, openUntil: 0 };
  current.failures += 1;

  if (current.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    current.openUntil = Date.now() + CIRCUIT_OPEN_MS;
    logger.warn('Circuit opened for route', {
      route: route.name,
      openUntil: new Date(current.openUntil).toISOString(),
    });
  }

  circuitStates.set(route.name, current);
}

function markSuccess(route: RouteTarget): void {
  circuitStates.set(route.name, { failures: 0, openUntil: 0 });
}

proxy.on('error', (error, req, res) => {
  logger.error('Proxy request failed', error, {
    method: req.method,
    url: req.url,
  });

  if ('headersSent' in res && !res.headersSent) {
    const response = res as unknown as Response;
    response.status(502).json({
      error: 'BAD_GATEWAY',
      message: 'Upstream service unavailable',
    });
  }
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string | undefined) || uuidv4();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

app.use((req: Request, _res: Response, next: NextFunction) => {
  const result = enforceRateLimit(req);

  if (!isRateLimitExempt(req)) {
    _res.setHeader('x-ratelimit-limit', String(result.limit));
    _res.setHeader('x-ratelimit-remaining', String(Math.max(result.remaining, 0)));
    _res.setHeader('x-ratelimit-reset', String(Math.floor(result.resetAt / 1000)));
  }

  if (result.limited) {
    rateLimitRejectedCount += 1;
    _res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded',
    });
    return;
  }

  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'ok',
    requireAuth: REQUIRE_AUTH,
    rateLimit: {
      enabled: RATE_LIMIT_ENABLED,
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      exemptPaths: RATE_LIMIT_EXEMPT_PATHS,
    },
    circuitBreakers: Array.from(circuitStates.entries()).map(([name, state]) => ({
      name,
      failures: state.failures,
      open: state.openUntil > Date.now(),
    })),
    routes,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.status(200).json({
    ...metricsCollector.snapshot(),
    gatewayState: {
      requireAuth: REQUIRE_AUTH,
      routeCount: routes.length,
      activeRateLimitKeys: rateLimitStore.size,
      rateLimitRejectedCount,
      openCircuits: Array.from(circuitStates.entries())
        .filter(([, state]) => state.openUntil > Date.now())
        .map(([name]) => name),
    },
  });
});

for (const route of routes) {
  app.use(route.prefix, (req: AuthenticatedGatewayRequest, res: Response, next: NextFunction) => {
    try {
      checkCircuit(route);
      enforceAuth(req);
      enforceRoutePolicy(req, route);

      const path = req.originalUrl.replace(route.prefix, '') || '/';
      req.url = path;

      proxy.web(req, res, {
        target: route.target,
        ignorePath: true,
        headers: {
          'x-correlation-id': String(req.headers['x-correlation-id'] || ''),
          ...(req.user && {
            'x-user-id': req.user.sub,
            'x-entity-id': req.user.entityId,
            'x-user-role': req.user.role,
          }),
        },
      });

      res.on('finish', () => {
        if (res.statusCode >= 500) {
          markFailure(route);
        } else {
          markSuccess(route);
        }
      });
    } catch (error) {
      markFailure(route);
      next(error);
    }
  });
}

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError('Gateway route not found'));
});

app.use(createErrorHandlerMiddleware(logger));

app.listen(PORT, () => {
  logger.info('API gateway started', { port: PORT, routeCount: routes.length });
});
