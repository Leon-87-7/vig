// @vitest-environment jsdom
import { render, screen, waitFor } from '@/test/render';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import DocParserPage from './page';

class MockEventSource {
  addEventListener = vi.fn();
  close = vi.fn();
  constructor(public url: string) {}
}

vi.stubGlobal('EventSource', MockEventSource);
vi.mock('@/components/doc-parser/telegram-toggle', () => ({
  TelegramToggle: () => <button>Telegram</button>,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DocParserPage', () => {
  it('shows an empty state when there are no documents', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));

    render(<DocParserPage />);

    await waitFor(() => expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument());
  });

  it('shows a loading skeleton before the first response resolves', () => {
    let resolveFetch: (v: Response) => void;
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }) as unknown as Promise<Response>);

    const { container } = render(<DocParserPage />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    resolveFetch!(new Response(JSON.stringify({ items: [] })));
  });
});
