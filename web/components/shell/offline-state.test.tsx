// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@/test/render';
import { afterEach, describe, expect, it } from 'vitest';

import { OfflineState } from './offline-state';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

afterEach(() => {
  setOnline(true);
});

describe('OfflineState', () => {
  it('explains the offline state and offers a retry', () => {
    setOnline(false);
    render(<OfflineState />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/you're offline/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('switches to a reload prompt once the connection returns', () => {
    setOnline(false);
    render(<OfflineState />);

    act(() => {
      setOnline(true);
      fireEvent(window, new Event('online'));
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/back online/i);
    expect(screen.getByRole('button', { name: /reload ownix/i })).toBeInTheDocument();
  });
});
