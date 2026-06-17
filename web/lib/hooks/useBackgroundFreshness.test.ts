// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackgroundFreshness } from './useBackgroundFreshness';

// ---------------------------------------------------------------------------
// Helpers: fake document.visibilityState
// ---------------------------------------------------------------------------

function setVisible() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
}

function setHidden() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
}

function fireVisibilityChange() {
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  // Start with tab visible.
  setVisible();
});

afterEach(() => {
  vi.useRealTimers();
  // Restore visible so other tests are unaffected.
  setVisible();
});

describe('useBackgroundFreshness', () => {
  // --------------------------------------------------------------------------
  // Focus-refetch (visibilitychange → visible)
  // --------------------------------------------------------------------------

  it('fires ONE immediate reload when the tab becomes visible', async () => {
    const reload = vi.fn(async () => {});

    renderHook(() => useBackgroundFreshness(reload));

    // Tab starts visible — no immediate reload on mount (no event yet).
    expect(reload).not.toHaveBeenCalled();

    // Simulate hide then show.
    setHidden();
    fireVisibilityChange();
    expect(reload).not.toHaveBeenCalled(); // hidden → no reload

    setVisible();
    fireVisibilityChange();

    // The handler calls reload() — allow the promise to settle.
    await act(async () => { await Promise.resolve(); });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire reload when visibilitychange fires while already hidden', async () => {
    const reload = vi.fn(async () => {});

    renderHook(() => useBackgroundFreshness(reload));

    setHidden();
    fireVisibilityChange();
    await act(async () => { await Promise.resolve(); });

    expect(reload).not.toHaveBeenCalled();
  });

  it('fires reload each time the tab regains focus', async () => {
    const reload = vi.fn(async () => {});

    renderHook(() => useBackgroundFreshness(reload));

    for (let i = 0; i < 3; i++) {
      setHidden();
      fireVisibilityChange();
      setVisible();
      fireVisibilityChange();
      await act(async () => { await Promise.resolve(); });
    }

    expect(reload).toHaveBeenCalledTimes(3);
  });

  // --------------------------------------------------------------------------
  // Backstop interval (~2 min)
  // --------------------------------------------------------------------------

  it('fires reload after ~2 min while the tab is visible', async () => {
    const reload = vi.fn(async () => {});

    renderHook(() => useBackgroundFreshness(reload));

    expect(reload).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire reload after ~2 min while the tab is hidden', async () => {
    const reload = vi.fn(async () => {});

    renderHook(() => useBackgroundFreshness(reload));

    setHidden();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(reload).not.toHaveBeenCalled();
  });

  it('fires repeated backstop reloads while visible', async () => {
    const reload = vi.fn(async () => {});

    renderHook(() => useBackgroundFreshness(reload));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(360_000); // 3 × 120 s
    });

    expect(reload.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  it('stops all timers and listeners on unmount', async () => {
    const reload = vi.fn(async () => {});

    const { unmount } = renderHook(() => useBackgroundFreshness(reload));

    unmount();

    // After unmount, advance time and fire visibility events — nothing should call reload.
    setHidden();
    setVisible();
    fireVisibilityChange();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(360_000);
    });

    expect(reload).not.toHaveBeenCalled();
  });
});
