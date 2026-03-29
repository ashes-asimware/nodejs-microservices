/**
 * Factor Simulator (participant: F)
 *
 * Simulates the factoring company's side of the workflow:
 *   Activity 4  — Factor Advance to Carrier (POST /factoring/assignments/:id/advance)
 *   Activity 14 — Factor Final Settlement   (POST /factoring/assignments/:id/settle)
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import { createLogger, createLogMiddleware } from '@ach-lockbox/logger';
import { asyncHandler, createErrorHandlerMiddleware, NotFoundError } from '@ach-lockbox/error-taxonomy';

const SERVICE_NAME = 'factor-simulator';
const PORT = Number(process.env.PORT || 3011);

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

// ─── Activity 4: Factor Advance to Carrier ────────────────────────────────────

app.post(
  '/simulate/advance',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.body?.assignmentId;
    if (!assignmentId) {
      throw new NotFoundError('assignmentId is required in the request body');
    }
    if (!isUuid(assignmentId)) {
      res.status(400).json({ error: 'assignmentId must be a valid UUID' });
      return;
    }

    const advanceAmount: number = req.body?.advanceAmount ?? 207000;   // cents
    const discountAmount: number = req.body?.discountAmount ?? 4140;   // 2% fee in cents
    const bankAccountId: string = req.body?.bankAccountId ?? `BA-${uuidv4().substring(0, 8)}`;

    const payload = { factorAssignmentId: assignmentId, advanceAmount, discountAmount, bankAccountId };

    logger.info('Factor: issuing advance', { assignmentId, advanceAmount });
    const result = await callService(
      `${FACTORING_SERVICE_URL}/factoring/assignments/${assignmentId}/advance`,
      payload
    );
    res.status(200).json({ simulation: 'factor-advance', result });
  })
);

// ─── Activity 14: Factor Final Settlement ────────────────────────────────────

app.post(
  '/simulate/settlement',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.body?.assignmentId;
    if (!assignmentId) {
      throw new NotFoundError('assignmentId is required in the request body');
    }
    if (!isUuid(assignmentId)) {
      res.status(400).json({ error: 'assignmentId must be a valid UUID' });
      return;
    }

    const settlementAmount: number = req.body?.settlementAmount ?? 230000;  // cents
    const factorDiscount: number = req.body?.factorDiscount ?? 4140;        // cents

    const payload = { settlementAmount, factorDiscount };

    logger.info('Factor: completing settlement', { assignmentId, settlementAmount });
    const result = await callService(
      `${FACTORING_SERVICE_URL}/factoring/assignments/${assignmentId}/settle`,
      payload
    );
    res.status(200).json({ simulation: 'factor-settlement', result });
  })
);

app.use(createErrorHandlerMiddleware(logger));

app.listen(PORT, () => {
  logger.info('Factor simulator started', { port: PORT, factoringServiceUrl: FACTORING_SERVICE_URL });
});
