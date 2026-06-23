import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

const worker = setupWorker(...handlers);

// Idempotent: StrictMode double-invoke / Fast Refresh must not call start()
// twice (the second call throws "already enabled network").
let started: Promise<unknown> | null = null;
export function startWorker() {
  if (!started) started = worker.start({ onUnhandledRequest: 'bypass' });
  return started;
}
