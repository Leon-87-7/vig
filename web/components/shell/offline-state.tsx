'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

/** Full-screen offline destination. Rendered by the /offline route and ready to
 * be served as a service-worker navigation fallback. It watches the live
 * connection so that if the network returns while the visitor is sitting here,
 * the copy and the primary action flip from "try again" to "reload". */
export function OfflineState() {
  // Assume offline: this screen only exists to explain a failed connection.
  // After mount the real navigator state takes over.
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-16 text-body">
      <div className="w-full max-w-[26rem] text-center">
        <span
          className={`mx-auto mb-6 grid h-14 w-14 place-items-center rounded-xl border bg-surface transition-ui ${
            online ? 'border-status-done/50 text-status-done' : 'border-line text-muted'
          }`}
        >
          {online ? (
            <RefreshCw aria-hidden="true" className="h-6 w-6" />
          ) : (
            <WifiOff aria-hidden="true" className="h-6 w-6" />
          )}
        </span>

        <h1 className="mb-3 text-[clamp(22px,4vw,28px)] font-semibold leading-tight tracking-[-0.25px] text-ink">
          {online ? 'Back online' : "You're offline"}
        </h1>
        <p className="text-pretty mx-auto mb-6 max-w-[34ch] text-[15px] leading-relaxed">
          {online
            ? 'Your connection is back. Reload to pick up where you left off — nothing in your Index was lost.'
            : "Ownix can't reach the network right now. Your Index is safe in the cloud; this page will notice the moment you reconnect."}
        </p>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className={
            online
              ? 'inline-flex h-10 items-center gap-2 rounded-md bg-signal px-4 text-[14px] font-medium leading-none text-onsignal transition-ui hover:bg-signal-bright active:bg-signal-deep'
              : 'inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-[14px] font-medium leading-none text-ink transition-ui hover:bg-raised'
          }
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {online ? 'Reload Ownix' : 'Try again'}
        </button>

        <p className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.3px] text-muted">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              online
                ? 'bg-status-done'
                : 'bg-status-cancelled motion-safe:animate-pulse'
            }`}
          />
          connection: {online ? 'restored' : 'offline — watching for reconnect'}
        </p>
      </div>
    </main>
  );
}
