/**
 * Broker Simulator (participant: B)
 *
 * Simulates the freight broker's AP/payment actions:
 *   Activity 5  — Broker AP Authorization  (POST /payments/authorize on payment-service)
 *   Activity 6  — Payment Initiation ACH   (POST /payments/:id/initiate on payment-service)
 *   Activity 15 — Fuel Card Offset         (POST /fuel/advances/:id/settle on fuel-service)
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import { createLogger, createLogMiddleware } from '@ach-lockbox/logger';
import { asyncHandler, createErrorHandlerMiddleware, NotFoundError, throwValidationError } from '@ach-lockbox/error-taxonomy';

const SERVICE_NAME = 'broker-simulator';
const PORT = Number(process.env.PORT || 3012);

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3023';
const FUEL_SERVICE_URL = process.env.FUEL_SERVICE_URL || 'http://localhost:3024';

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

// ─── Activity 5: Broker AP Authorization ─────────────────────────────────────

app.post(
  '/simulate/authorize-payment',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = {
      carrierId: req.body?.carrierId ?? uuidv4(),
      invoiceId: req.body?.invoiceId,
      amount: req.body?.amount ?? 230000,          // cents
      invoiceNumber: req.body?.invoiceNumber,
    };

    logger.info('Broker: authorising payment', { carrierId: payload.carrierId, amount: payload.amount });
    const result = await callService(`${PAYMENT_SERVICE_URL}/payments/authorize`, payload);
    res.status(201).json({ simulation: 'authorize-payment', result });
  })
);

// ─── Activity 6: Payment Initiation (ACH/EFT) ────────────────────────────────

app.post(
  '/simulate/initiate-payment',
  asyncHandler(async (req: Request, res: Response) => {
    const paymentId = req.body?.paymentId;
    if (!paymentId) {
      throw new NotFoundError('paymentId is required in the request body');
    }
    if (!isUuid(paymentId)) {
      throwValidationError('paymentId must be a valid UUID');
    }

    const expectedSettlementDate = new Date();
    expectedSettlementDate.setDate(expectedSettlementDate.getDate() + 2);

    const payload = {
      paymentId,
      amount: req.body?.amount ?? 230000,
      paymentMethod: req.body?.paymentMethod ?? 'ACH',
      bankAccountId: req.body?.bankAccountId ?? `BA-${uuidv4().substring(0, 8)}`,
      expectedSettlementDate: req.body?.expectedSettlementDate ?? expectedSettlementDate.toISOString(),
    };

    logger.info('Broker: initiating ACH payment', { paymentId, method: payload.paymentMethod });
    const result = await callService(`${PAYMENT_SERVICE_URL}/payments/${paymentId}/initiate`, payload);
    res.status(200).json({ simulation: 'initiate-payment', result });
  })
);

// ─── Activity 15: Fuel Card Offset During Settlement ─────────────────────────

app.post(
  '/simulate/fuel-offset',
  asyncHandler(async (req: Request, res: Response) => {
    const advanceId = req.body?.advanceId;
    if (!advanceId) {
      throw new NotFoundError('advanceId is required in the request body');
    }
    if (!isUuid(advanceId)) {
      throwValidationError('advanceId must be a valid UUID');
    }

    const chargeDate = new Date();
    const payload = {
      fuelAdvanceId: advanceId,
      totalCharges: req.body?.totalCharges ?? 85000,   // cents
      chargeDate: req.body?.chargeDate ?? chargeDate.toISOString(),
    };

    logger.info('Broker: settling fuel card offset', { advanceId, totalCharges: payload.totalCharges });
    const result = await callService(`${FUEL_SERVICE_URL}/fuel/advances/${advanceId}/settle`, payload);
    res.status(200).json({ simulation: 'fuel-offset', result });
  })
);

app.use(createErrorHandlerMiddleware(logger));

app.listen(PORT, () => {
  logger.info('Broker simulator started', {
    port: PORT,
    paymentServiceUrl: PAYMENT_SERVICE_URL,
    fuelServiceUrl: FUEL_SERVICE_URL,
  });
});
