import serverlessExpress from '@codegenie/serverless-express';
import { app, initializeReconciliationRuntime } from './app';

let cachedHandler: ((event: unknown, context: unknown) => Promise<unknown>) | null = null;

export const handler = async (event: unknown, context: unknown): Promise<unknown> => {
  await initializeReconciliationRuntime();

  if (!cachedHandler) {
    cachedHandler = serverlessExpress({ app }) as (
      serverlessEvent: unknown,
      serverlessContext: unknown
    ) => Promise<unknown>;
  }

  return cachedHandler(event, context);
};
