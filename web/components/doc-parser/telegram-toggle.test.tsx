// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@/test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramToggle } from './telegram-toggle';

describe('TelegramToggle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the button while a persist request is in flight', async () => {
    let resolveFetch: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(global, 'fetch').mockReturnValue(pending as unknown as Promise<Response>);

    render(<TelegramToggle jobId="j1" value="off" />);
    const button = screen.getByRole('button', { name: /telegram delivery/i });

    fireEvent.click(button);
    expect(button).toBeDisabled();

    resolveFetch!(Response.json({ telegram_delivery: 'on' }));
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
