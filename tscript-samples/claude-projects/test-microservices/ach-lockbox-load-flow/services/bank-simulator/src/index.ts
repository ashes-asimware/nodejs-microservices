/**
 * Bank Simulator (participant: Bank)
 *
 * Simulates the external financial institution's actions:
 *   Activity 8  — Bank Settlement Confirmation (POST /payments/:id/settle on payment-service)
 *   Activity 10 — Inbound Customer Payment     (POST /payments/received on payment-service)
 *   Activity 11 — Lockbox Processing           (POST /lockbox/files on lockbox-service)
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import { createLogger, createLogMiddleware } from '@ach-lockbox/logger';
import { asyncHandler, createErrorHandlerMiddleware, NotFoundError } from '@ach-lockbox/error-taxonomy';

const SERVICE_NAME = 'bank-simulator';
const PORT = Number(process.env.PORT || 3013);

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3023';
const LOCKBOX_SERVICE_URL = process.env.LOCKBOX_SERVICE_URL || 'http://localhost:3025';

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

// ─── Activity 8: Bank Settlement of Outbound ACH/EFT ─────────────────────────

app.post(
  '/simulate/settle-payment',
  asyncHandler(async (req: Request, res: Response) => {
    const paymentId = req.body?.paymentId;
    if (!paymentId) {
      throw new NotFoundError('paymentId is required in the request body');
    }
    if (!isUuid(paymentId)) {
      res.status(400).json({ error: 'paymentId must be a valid UUID' });
      return;
    }

    const payload = {
      confirmationNumber:
        req.body?.confirmationNumber ?? `CONF-${Date.now().toString(36).toUpperCase()}`,
      bankReferenceNumber:
        req.body?.bankReferenceNumber ?? `BREF-${uuidv4().substring(0, 8).toUpperCase()}`,
    };

    logger.info('Bank: confirming ACH settlement', { paymentId });
    const result = await callService(`${PAYMENT_SERVICE_URL}/payments/${paymentId}/settle`, payload);
    res.status(200).json({ simulation: 'settle-payment', result });
  })
);

// ─── Activity 10: Inbound Customer Payment (ACH/EFT receipt) ─────────────────

app.post(
  '/simulate/inbound-payment',
  asyncHandler(async (req: Request, res: Response) => {
    // The bank receives an inbound ACH/EFT from a shipper/customer and notifies
    // the payment service so reconciliation can begin.
    const lockboxFileId = req.body?.lockboxFileId ?? uuidv4();

    const payload = {
      customerId: req.body?.customerId ?? uuidv4(),
      amount: req.body?.amount ?? 230000,          // cents
      lockboxFileId,
      checkNumber: req.body?.checkNumber,
    };

    logger.info('Bank: recording inbound customer payment', {
      customerId: payload.customerId,
      amount: payload.amount,
    });
    const result = await callService(`${PAYMENT_SERVICE_URL}/payments/received`, payload);
    res.status(201).json({ simulation: 'inbound-payment', result });
  })
);

// ─── Activity 11: Lockbox Image-Only File Processing ─────────────────────────

app.post(
  '/simulate/process-lockbox',
  asyncHandler(async (req: Request, res: Response) => {
    const batchDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const payload = {
      customerId: req.body?.customerId ?? uuidv4(),
      fileName: req.body?.fileName ?? `LOCKBOX_${batchDate}.dat`,
      checkCount: req.body?.checkCount ?? 1,
      totalAmount: req.body?.totalAmount ?? 230000,   // cents
      bankAccountId: req.body?.bankAccountId ?? `BA-${uuidv4().substring(0, 8)}`,
    };

    logger.info('Bank: submitting lockbox file', {
      fileName: payload.fileName,
      checkCount: payload.checkCount,
    });
    const result = await callService(`${LOCKBOX_SERVICE_URL}/lockbox/files`, payload);
    res.status(201).json({ simulation: 'process-lockbox', result });
  })
);

app.use(createErrorHandlerMiddleware(logger));

app.listen(PORT, () => {
  logger.info('Bank simulator started', {
    port: PORT,
    paymentServiceUrl: PAYMENT_SERVICE_URL,
    lockboxServiceUrl: LOCKBOX_SERVICE_URL,
  });
});
