// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteGate } from './invite-gate';

const navigationMock = vi.hoisted(() => ({
  replace: vi.fn(),
  router: null as null | { replace: ReturnType<typeof vi.fn> },
}));
navigationMock.router = { replace: navigationMock.replace };

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMock.router,
}));

beforeEach(() => {
  navigationMock.replace.mockClear();
});

describe('InviteGate', () => {
  it('renders dashboard children for approved users with an email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        id: 1,
        email: 'user@example.com',
        status: 'approved',
      }), { status: 200 })),
    );

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    expect(await screen.findByText('Dashboard feed')).toBeTruthy();
  });

  it('shows the pending screen instead of dashboard content for pending users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        id: 1,
        email: 'user@example.com',
        status: 'pending',
      }), { status: 200 })),
    );

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    expect(await screen.findByText('Pending approval')).toBeTruthy();
    expect(screen.queryByText('Dashboard feed')).toBeNull();
  });

  it('shows a one-field email modal once and persists the email', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/auth/email' && init?.method === 'PUT') {
        return new Response(JSON.stringify({
          email: 'user@example.com',
          status: 'pending',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        id: 1,
        email: null,
        status: 'pending',
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    const input = await screen.findByLabelText('Email');
    fireEvent.change(input, { target: { value: 'User@Example.COM' } });
    fireEvent.click(screen.getByRole('button', { name: /save email/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/email',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ email: 'user@example.com' }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Email')).toBeNull();
    });
    expect(screen.getByText('Pending approval')).toBeTruthy();
  });
});
