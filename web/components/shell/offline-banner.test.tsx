// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@/test/render';
import { afterEach, describe, expect, it } from 'vitest';

import { OfflineBanner } from './offline-banner';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

afterEach(() => {
  setOnline(true);
});

describe('OfflineBanner', () => {
  it('stays hidden while the connection is up', () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('surfaces an offline notice with a retry when the connection drops', () => {
    setOnline(true);
    render(<OfflineBanner />);

    act(() => {
      setOnline(false);
      fireEvent(window, new Event('offline'));
    });

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/you're offline/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('flashes "back online" when the connection returns', () => {
    setOnline(true);
    render(<OfflineBanner />);

    act(() => {
      setOnline(false);
      fireEvent(window, new Event('offline'));
    });
    act(() => {
      setOnline(true);
      fireEvent(window, new Event('online'));
    });

    expect(screen.getByRole('status')).toHaveTextContent(/back online/i);
  });
});
