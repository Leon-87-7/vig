'use client';

import type React from 'react';

import { useRecovery } from '@/lib/hooks/useRecovery';

const CLEAR_CONFIRM_COPY = 'Clear failed jobs in this tab? This marks them cancelled; it does not delete them from DB.';

function RecoveryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 rounded-md border border-line bg-surface px-3 text-[12px] font-medium text-body shadow-[0_2px_5px_-1px_rgba(0,0,0,0.55)] transition-ui hover:border-line-strong hover:bg-raised hover:text-ink hover:shadow-[0_3px_7px_-1px_rgba(0,0,0,0.6)] active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-muted disabled:shadow-none"
    >
      {children}
    </button>
  );
}

export function RecoveryPanel({
  contentType,
  onRecovered,
}: {
  contentType: string;
  onRecovered: () => Promise<void> | void;
}) {
  const {
    summary,
    loading,
    acting,
    error,
    retryPending,
    retryError,
    clearFailed,
  } = useRecovery(contentType, onRecovered);

  const failedActionCount = summary.error_jobs + summary.stale_in_flight;
  const disabled = loading || acting !== null;

  const onClear = () => {
    if (!confirm(CLEAR_CONFIRM_COPY)) return;
    void clearFailed();
  };

  // Fragment (not a display:contents section) so the controls row and the error line
  // flow as direct children of the parent plate while the group label lives on a real,
  // reliably-exposed element.
  return (
    <>
      <div role="group" aria-label="Recovery" className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted">
          {summary.stale_in_flight} stale in-flight
        </span>
        <RecoveryButton disabled={disabled || summary.stale_pending === 0} onClick={() => void retryPending()}>
          {acting === 'pending' ? 'Retrying...' : `Retry pending (${summary.stale_pending})`}
        </RecoveryButton>
        <RecoveryButton disabled={disabled || failedActionCount === 0} onClick={() => void retryError()}>
          {acting === 'error' ? 'Retrying...' : `Retry failed (${failedActionCount})`}
        </RecoveryButton>
        <RecoveryButton disabled={disabled || summary.error_jobs === 0} onClick={onClear}>
          {acting === 'clear' ? 'Clearing...' : `Clear failed (${summary.error_jobs})`}
        </RecoveryButton>
      </div>
      {error && <p className="w-full text-xs text-status-error">{error}</p>}
    </>
  );
}
