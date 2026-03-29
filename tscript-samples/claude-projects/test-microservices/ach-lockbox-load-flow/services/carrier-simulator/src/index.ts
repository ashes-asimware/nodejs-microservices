/**
 * Carrier Simulator (participant: C)
 *
 * Simulates the trucking company interacting with the system:
 *   Activity 1 — Load Creation (POST /loads on load-service)
 *   Activity 2 — Invoice Submission (POST /invoices on invoice-service)
 *   Activity 3 — Factoring Assignment (POST /factoring/assignments on factoring-service)
 *
 * All endpoints accept an optional request body that can pre-fill domain fields.
 * If a field is absent, a sensible default is used so the flow can be triggered
 * with a bare POST with no body.
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, createLogMiddleware } from '@ach-lockbox/logger';
import { asyncHandler, createErrorHandlerMiddleware } from '@ach-lockbox/error-taxonomy';

const SERVICE_NAME = 'carrier-simulator';
const PORT = Number(process.env.PORT || 3010);

// Service URL defaults — override via environment for docker/k8s deployments
const LOAD_SERVICE_URL = process.env.LOAD_SERVICE_URL || 'http://localhost:3020';
const INVOICE_SERVICE_URL = process.env.INVOICE_SERVICE_URL || 'http://localhost:3021';
const FACTORING_SERVICE_URL = process.env.FACTORING_SERVICE_URL || 'http://localhost:3022';

const logger = createLogger({ serviceName: SERVICE_NAME, level: process.env.LOG_LEVEL || 'info' });

const app = express();
app.use(express.json());
app.use(createLogMiddleware({ serviceName: SERVICE_NAME }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function callService(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-correlation-id': uuidv4() },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`Upstream call failed [${response.status}]: ${text}`);
  }

  return data;
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ service: SERVICE_NAME, status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Activity 1: Load Creation ────────────────────────────────────────────────

app.post(
  '/simulate/load-creation',
  asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const shipDate = new Date(now);
    shipDate.setDate(shipDate.getDate() + 1);

    const payload = {
      carrierId: req.body?.carrierId ?? uuidv4(),
      shipmentDate: (req.body?.shipmentDate ?? shipDate.toISOString()),
      pickupLocation: req.body?.pickupLocation ?? 'Chicago, IL',
      deliveryLocation: req.body?.deliveryLocation ?? 'Dallas, TX',
      weightLbs: req.body?.weightLbs ?? 42000,
      miles: req.body?.miles ?? 920,
      ratePerMile: req.body?.ratePerMile ?? 2.5,
    };

    logger.info('Carrier: creating load', payload);
    const result = await callService(`${LOAD_SERVICE_URL}/loads`, payload);
    res.status(201).json({ simulation: 'load-creation', result });
  })
);

// ─── Activity 2: Invoice Submission ──────────────────────────────────────────

app.post(
  '/simulate/invoice-submission',
  asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    const payload = {
      loadId: req.body?.loadId ?? uuidv4(),
      carrierId: req.body?.carrierId ?? uuidv4(),
      invoiceNumber: req.body?.invoiceNumber ?? `INV-${Date.now()}`,
      amount: req.body?.amount ?? 230000,          // cents
      invoiceDate: (req.body?.invoiceDate ?? now.toISOString()),
      dueDate: (req.body?.dueDate ?? dueDate.toISOString()),
      attachmentIds: req.body?.attachmentIds ?? [],
    };

    logger.info('Carrier: submitting invoice', { invoiceNumber: payload.invoiceNumber });
    const result = await callService(`${INVOICE_SERVICE_URL}/invoices`, payload);
    res.status(201).json({ simulation: 'invoice-submission', result });
  })
);

// ─── Activity 3: Factoring Assignment ────────────────────────────────────────

app.post(
  '/simulate/factoring-assignment',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = {
      invoiceId: req.body?.invoiceId ?? uuidv4(),
      carrierId: req.body?.carrierId ?? uuidv4(),
      factorId: req.body?.factorId ?? uuidv4(),
      advancePercentage: req.body?.advancePercentage ?? 90,
    };

    logger.info('Carrier: assigning invoice to factor', { invoiceId: payload.invoiceId });
    const result = await callService(`${FACTORING_SERVICE_URL}/factoring/assignments`, payload);
    res.status(201).json({ simulation: 'factoring-assignment', result });
  })
);

app.use(createErrorHandlerMiddleware(logger));

app.listen(PORT, () => {
  logger.info('Carrier simulator started', {
    port: PORT,
    loadServiceUrl: LOAD_SERVICE_URL,
    invoiceServiceUrl: INVOICE_SERVICE_URL,
    factoringServiceUrl: FACTORING_SERVICE_URL,
  });
});
