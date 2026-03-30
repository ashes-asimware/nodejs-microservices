import { app, initializeReconciliationRuntime, logger, PORT } from './app';

async function start(): Promise<void> {
  await initializeReconciliationRuntime();
  app.listen(PORT, () => {
    logger.info('Reconciliation service started', { port: PORT });
  });
}

void start();
