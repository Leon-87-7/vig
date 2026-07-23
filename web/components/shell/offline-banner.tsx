'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

type Phase = 'online' | 'offline' | 'reconnected';

/** Slim, non-blocking connection indicator for the dashboard. It stays out of
 * the way while online, surfaces a bottom banner when the connection drops (so
 * a failed save has an explanation), and flashes a brief "back online" the
 * moment it returns. navigator.onLine is coarse but right for a passive hint;
 * the /offline route is the full-screen destination when a navigation fails. */
export function OfflineBanner() {
  const [phase, setPhase] = useState<Phase>('online');

  useEffect(() => {
    const sync = () =>
      setPhase((prev) => {
        if (!navigator.onLine) return 'offline';
        return prev === 'offline' ? 'reconnected' : 'online';
      });
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'reconnected') return;
    const t = setTimeout(() => setPhase('online'), 3200);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'online') return null;

  const offline = phase === 'offline';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 motion-safe:animate-[auth-card-enter_240ms_ease-out]"
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px] shadow-lg backdrop-blur-sm ${
          offline
            ? 'border-line bg-raised text-body'
            : 'border-status-done/50 bg-status-done-tint text-status-done'
        }`}
      >
        <span className="shrink-0" aria-hidden="true">
          {offline ? (
            <WifiOff className="h-4 w-4 text-muted" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </span>
        <span className="leading-snug">
          {offline ? (
            <>
              <span className="font-medium text-ink">You&apos;re offline.</span>{' '}
              Changes may not save until you reconnect.
            </>
          ) : (
            <span className="font-medium">Back online.</span>
          )}
        </span>
        {offline && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium text-ink transition-ui hover:bg-canvas"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
