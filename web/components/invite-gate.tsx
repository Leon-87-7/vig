'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type UserStatus = 'pending' | 'approved' | 'blocked';

interface InviteUser {
  id: number;
  first_name?: string;
  username?: string | null;
  email?: string | null;
  status: UserStatus;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function GateScreen({ status }: { status: Exclude<UserStatus, 'approved'> }) {
  const blocked = status === 'blocked';
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4">
      <section className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
          {blocked ? 'BLOCKED' : 'PENDING'}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          {blocked ? 'Access blocked' : 'Pending approval'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-body">
          {blocked
            ? 'This Telegram account cannot access VIG.'
            : 'Pending approval — ask Leon for access.'}
        </p>
      </section>
    </div>
  );
}

function EmailModal({
  onSaved,
}: {
  onSaved: (email: string, status: UserStatus) => void;
}) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError('Enter a valid email address.');
      return;
    }

    setSaving(true);
    setError(null);
    const res = await fetch('/api/auth/email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    });
    setSaving(false);

    if (!res.ok) {
      setError('Could not save email.');
      return;
    }

    const data = (await res.json()) as { email: string; status: UserStatus };
    onSaved(data.email, data.status);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 px-4">
      <section className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-overlay">
        <h2 className="text-lg font-semibold text-ink">Email required</h2>
        <p className="mt-2 text-sm leading-6 text-body">
          VIG is invite-only. Add the email Leon should approve for this Telegram account.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <label className="block text-sm font-medium text-body" htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-9 w-full rounded-md border border-line bg-canvas px-3 text-sm text-ink transition-ui placeholder:text-muted focus:border-signal"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          {error && <p className="text-sm text-status-error">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="h-8 rounded-md bg-signal px-3 text-[13px] font-medium text-onsignal transition-ui hover:bg-signal-bright disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
          >
            {saving ? 'Saving...' : 'Save email'}
          </button>
        </form>
      </section>
    </div>
  );
}

export function InviteGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<InviteUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then(async (res) => {
        if (res.status === 401) {
          router.replace('/login');
          return null;
        }
        if (!res.ok) throw new Error('me failed');
        return (await res.json()) as InviteUser;
      })
      .then((next) => {
        if (alive && next) setUser(next);
      })
      .catch(() => {
        if (alive) router.replace('/login');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  if (loading) {
    return <div className="min-h-screen bg-canvas" />;
  }

  if (!user) {
    return null;
  }

  const needsEmail = !user.email;
  const approved = user.status === 'approved';

  return (
    <>
      {approved ? children : <GateScreen status={user.status === 'blocked' ? 'blocked' : 'pending'} />}
      {needsEmail && (
        <EmailModal
          onSaved={(email, status) => setUser((prev) => prev && { ...prev, email, status })}
        />
      )}
    </>
  );
}
