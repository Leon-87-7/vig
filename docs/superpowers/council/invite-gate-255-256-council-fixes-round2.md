# Invite Gate — Council Review Fixes (Round 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Context:** Round 2 of `/council-review` on branch `invite-gate-255-256`. Extends [invite-gate-255-256-council-fixes.md](./invite-gate-255-256-council-fixes.md) (Tasks 1–8) — see that file for the Global Constraints, architecture summary, and original Blocker fixes. This round covers Tasks 9–13, converted from a second `/council-review` pass run after Tasks 1–8 were implemented. **This is the intended final auto-generated round** — anything found in a subsequent pass should go through PR review, not another generated plan.

## Round 2: Post-implementation `/council-review` findings (2026-07-01)

All 8 tasks in round 1 were implemented (Tasks 1–3 committed as `3971bb1`/`da2049f`/`35c8a30`; Tasks 4–8 implemented and staged, not yet committed). A second `/council-review` run against the resulting diff (4 parallel reviewers: ponytail, correctness, interfaces, react) confirmed **both original Blockers are correctly fixed** (verified by code read + passing test suites: `pytest tests/test_webhook.py tests/test_auth.py` 96 passed, `vitest run invite-gate.test.tsx` 8/8 passed) and surfaced 10 follow-up findings (1 Major, 6 Minor, 3 Nit), converted below into Tasks 9–13. These follow the same Global Constraints as Tasks 1–8 (see round 1 file, linked above). **Do not commit Tasks 4–8 until Task 9 (the Major) is fixed** — it's a regression introduced by Task 5.

---

## Task 9: Fix approved-but-missing-email mislabeled as "pending" (Major)

**Files:**
- Modify: `web/components/invite-gate.tsx` (`InviteGate`, lines ~214–227)
- Modify: `web/components/invite-gate.test.tsx`

**Major (react reviewer):** An approved user still missing their email is shown the `'pending'` `GateScreen` copy ("Pending approval — ask Leon for access") *behind* the email modal — false messaging, since they're one email submission away from the dashboard, not waiting on the operator. Introduced by Task 5 Step 5's `canShowDashboard = approved && !needsEmail` collapsing `'approved'` into `'pending'` for the `GateScreen` status prop. No existing test catches it.

Current code:

```tsx
  const needsEmail = !user.email;
  const approved = user.status === 'approved';
  const canShowDashboard = approved && !needsEmail;

  return (
    <>
      {canShowDashboard ? children : <GateScreen status={user.status === 'blocked' ? 'blocked' : 'pending'} />}
      {needsEmail && user.status !== 'blocked' && (
        <EmailModal
          onSaved={(email, status) => setUser((prev) => prev && { ...prev, email, status })}
        />
      )}
    </>
  );
```

- [ ] **Step 1: Extend the existing "approved without email" test to assert no pending copy leaks**

In `web/components/invite-gate.test.tsx`, update the `does not mount dashboard children for approved users without email` test:

```tsx
  it('does not mount dashboard children for approved users without email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        id: 1,
        email: null,
        status: 'approved',
      }), { status: 200 })),
    );

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    expect(await screen.findByRole('dialog', { name: /email required/i })).toBeTruthy();
    expect(screen.queryByText('Dashboard feed')).toBeNull();
    expect(screen.queryByText('Pending approval')).toBeNull();
  });
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
npx vitest run web/components/invite-gate.test.tsx
```
Expected: FAIL on the new `expect(screen.queryByText('Pending approval')).toBeNull()` assertion — current code renders the pending `GateScreen` behind the modal.

- [ ] **Step 3: Fix `InviteGate`'s render branch**

Replace the return block:

```tsx
  const needsEmail = !user.email;
  const approved = user.status === 'approved';
  const canShowDashboard = approved && !needsEmail;

  let gateContent: React.ReactNode = null;
  if (canShowDashboard) {
    gateContent = children;
  } else if (!approved) {
    gateContent = <GateScreen status={user.status === 'blocked' ? 'blocked' : 'pending'} />;
  }

  return (
    <>
      {gateContent}
      {needsEmail && user.status !== 'blocked' && (
        <EmailModal
          onSaved={(email, status) => setUser((prev) => prev && { ...prev, email, status })}
        />
      )}
    </>
  );
```

An approved-but-missing-email user now renders nothing behind the modal (`!approved` is `false`, `canShowDashboard` is `false`) instead of the false "pending" copy; pending/blocked users are unaffected.

- [ ] **Step 4: Run tests, confirm they pass**

```bash
npx vitest run web/components/invite-gate.test.tsx
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/components/invite-gate.tsx web/components/invite-gate.test.tsx
git commit -m "fix(web): stop showing pending copy for approved users missing email"
```

---

## Task 10: Deny-by-default operator check when `OPERATOR_CHAT_ID` is unset (Minor, security)

**Files:**
- Modify: `src/telegram/webhook.py` (`_cb_invite_decision`, line ~371)
- Modify: `tests/test_webhook.py`

**Minor (correctness reviewer):** `if ctx.chat_id != settings.OPERATOR_CHAT_ID:` isn't deny-by-default. If `chat_id` resolves to `None` (a callback payload whose `message` has no `chat` key) while `settings.OPERATOR_CHAT_ID` is unset (`None`, the single-operator backward-compat default — see `src/config.py:78`), then `None != None` is `False` and the approve/block callback is treated as authorized. Low practical risk today (still requires already knowing `TELEGRAM_WEBHOOK_SECRET`, and `_notify_operator_invite` never sends the approve/block buttons when `OPERATOR_CHAT_ID` is unset — Task 8 already made that unset case log a warning) but the check itself should not silently pass on `None == None`.

- [ ] **Step 1: Write a failing test reproducing the gap**

In `tests/test_webhook.py`, add (near `test_invite_callback_approve_rejects_non_operator_chat`):

```python
@pytest.mark.asyncio
async def test_invite_callback_approve_rejects_when_operator_chat_id_unset(temp_db, monkeypatch):
    """An unset OPERATOR_CHAT_ID must not let a chat_id-less callback slip through (None == None)."""
    from src import database as db
    from src.telegram import webhook

    monkeypatch.setattr("src.config.settings.OPERATOR_CHAT_ID", None)
    await db.set_user_email(100, "user@example.com")
    await db.set_user_status(100, "pending")
    set_status = AsyncMock(wraps=db.set_user_status)
    monkeypatch.setattr("src.telegram.webhook.database.set_user_status", set_status)
    answered = AsyncMock()
    monkeypatch.setattr("src.telegram.webhook.answer_callback_query", answered)
    monkeypatch.setattr("src.telegram.webhook.edit_message_text", AsyncMock())

    await webhook._handle_callback(
        {
            "id": "CB",
            "data": "invite_approve:100",
            "message": {"message_id": 7},  # no "chat" key -> chat_id resolves to None
        }
    )

    set_status.assert_not_awaited()
    answered.assert_awaited_once_with("CB", text="Not authorized.")
    assert await db.get_user_status(100) == "pending"
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
python -m pytest tests/test_webhook.py::test_invite_callback_approve_rejects_when_operator_chat_id_unset -q
```
Expected: FAIL — `set_status.assert_not_awaited()` fails because the current check lets `chat_id=None` through when `OPERATOR_CHAT_ID` is `None`.

- [ ] **Step 3: Fix the operator check**

In `src/telegram/webhook.py`, in `_cb_invite_decision`:

```python
    if settings.OPERATOR_CHAT_ID is None or ctx.chat_id != settings.OPERATOR_CHAT_ID:
```

(replaces `if ctx.chat_id != settings.OPERATOR_CHAT_ID:`)

- [ ] **Step 4: Run tests, confirm they pass**

```bash
python -m pytest tests/test_webhook.py -q
```
Expected: all pass, including the new test and the existing operator-chat tests (which set `OPERATOR_CHAT_ID = 999`, unaffected by this change).

- [ ] **Step 5: Commit**

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "fix(webhook): deny invite decisions by default when OPERATOR_CHAT_ID is unset"
```

---

## Task 11: webhook.py housekeeping — identity helper, partial cleanup, stale-state messaging (Minor)

**Files:**
- Modify: `src/telegram/webhook.py` (top-level import, `_cb_invite_approve`/`_cb_invite_block` ~lines 387–392, `_handle_callback` ~lines 431–438, `webhook()` ~lines 1455–1460, `_invite_gate_allows` ~lines 1173–1177)
- Modify: `tests/test_webhook.py`

**Minor (ponytail, correctness):** Three independent webhook.py nits from the same round, grouped since they're all no-behavior-change (or single-message-copy-change) cleanups in one file:
1. Task 7 Step 1 inlined `_telegram_identity` on the premise it had a single caller — it actually has two (`webhook()` and `_handle_callback()`), so inlining duplicated the identity-dict construction instead of removing it. Reinstate a small shared helper.
2. `_cb_invite_approve`/`_cb_invite_block` use `functools.partial`, which pulls in an otherwise-unused `import functools` where two 1-line named wrapper functions do the same dedup without losing `__name__` (useful for logging/tracebacks — a `functools.partial` object has none).
3. When a chat is `pending` with a stale-but-unexpired `awaiting_email` chat_state and fires a non-invite callback or sends a photo/document (all of which call `_invite_gate_allows(chat_id, "", identity)` with `text=""`), the empty string fails `normalize_email("")` and sends "Please send a valid email address." — confusing, since the user didn't attempt to submit anything.

- [ ] **Step 1: Reinstate the shared identity helper**

In `src/telegram/webhook.py`, add this function just above `_remember_invite_identity` (~line 1116):

```python
def _telegram_identity(sender: dict, chat: dict) -> dict[str, str | None]:
    return {
        "first_name": sender.get("first_name") or chat.get("first_name") or "",
        "last_name": sender.get("last_name") or chat.get("last_name"),
        "username": sender.get("username") or chat.get("username"),
    }
```

In `_handle_callback` (~line 431), replace:

```python
    if chat_id and prefix not in {"invite_approve", "invite_block"}:
        sender = callback.get("from") or {}
        chat = cb_message.get("chat") or {}
        identity = {
            "first_name": sender.get("first_name") or chat.get("first_name") or "",
            "last_name": sender.get("last_name") or chat.get("last_name"),
            "username": sender.get("username") or chat.get("username"),
        }
        if not await _invite_gate_allows(chat_id, "", identity):
```

with:

```python
    if chat_id and prefix not in {"invite_approve", "invite_block"}:
        identity = _telegram_identity(callback.get("from") or {}, cb_message.get("chat") or {})
        if not await _invite_gate_allows(chat_id, "", identity):
```

In `webhook()` (~line 1455), replace:

```python
    sender = message.get("from") or {}
    identity = {
        "first_name": sender.get("first_name") or chat.get("first_name") or "",
        "last_name": sender.get("last_name") or chat.get("last_name"),
        "username": sender.get("username") or chat.get("username"),
    }
```

with:

```python
    identity = _telegram_identity(message.get("from") or {}, chat)
```

- [ ] **Step 2: Replace `functools.partial` with named wrapper functions**

In `src/telegram/webhook.py`, replace:

```python
_cb_invite_approve = functools.partial(
    _cb_invite_decision, status="approved", notify_message=_INVITE_APPROVED_MESSAGE, log_action="approved"
)
_cb_invite_block = functools.partial(
    _cb_invite_decision, status="blocked", notify_message=_INVITE_BLOCKED_MESSAGE, log_action="blocked"
)
```

with:

```python
async def _cb_invite_approve(ctx: CallbackCtx) -> None:
    await _cb_invite_decision(ctx, status="approved", notify_message=_INVITE_APPROVED_MESSAGE, log_action="approved")


async def _cb_invite_block(ctx: CallbackCtx) -> None:
    await _cb_invite_decision(ctx, status="blocked", notify_message=_INVITE_BLOCKED_MESSAGE, log_action="blocked")
```

Remove the now-unused `import functools` (line 6) — confirm nothing else in the file uses `functools.` before removing it:

```bash
grep -n "functools\." src/telegram/webhook.py
```
Expected: only the two lines being replaced above; safe to delete the import.

- [ ] **Step 3: Fix the stale-`awaiting_email` message on non-text paths**

In `_invite_gate_allows` (~line 1172), replace:

```python
    state = await database.get_chat_state(chat_id)
    if state and state.get("mode") == "awaiting_email" and _resolve_chat_state(state):
        email = normalize_email(text)
        if email is None:
            await send_message(chat_id, "Please send a valid email address.")
            return False
```

with:

```python
    state = await database.get_chat_state(chat_id)
    if state and state.get("mode") == "awaiting_email" and _resolve_chat_state(state):
        if not text:
            await send_message(chat_id, _INVITE_WAITING_MESSAGE)
            return False
        email = normalize_email(text)
        if email is None:
            await send_message(chat_id, "Please send a valid email address.")
            return False
```

- [ ] **Step 4: Add a test for the stale-state messaging fix**

In `tests/test_webhook.py`, add (near `test_callback_reprocess_rejects_blocked_chat`):

```python
@pytest.mark.asyncio
async def test_stale_awaiting_email_state_gets_generic_message_on_non_text_paths(temp_db, monkeypatch):
    """A pending chat with a stale awaiting_email state tapping a button shouldn't be told to 'send a valid email'."""
    from src import database as db
    from src.telegram import webhook

    await db.set_user_status(100, "pending")
    await db.set_chat_state(chat_id=100, mode="awaiting_email", job_id="invite:100", expires_minutes=60 * 24 * 30)
    await _seed_job(temp_db, "J_PENDING", chat_id=100, status="error", content_type="short")
    sent = AsyncMock()
    answered = AsyncMock()
    monkeypatch.setattr("src.telegram.webhook.send_message", sent)
    monkeypatch.setattr("src.telegram.webhook.answer_callback_query", answered)

    await webhook._handle_callback(
        {"id": "CB", "data": "reprocess:J_PENDING", "message": {"chat": {"id": 100}}}
    )

    sent.assert_awaited_once_with(100, "still waiting on Leon.")
    answered.assert_awaited_once_with("CB", text="Access restricted.")
```

- [ ] **Step 5: Run tests**

```bash
python -m pytest tests/test_webhook.py -q
```
Expected: all pass, including the new test. `_telegram_identity` and the `_cb_invite_approve`/`_cb_invite_block` change are pure refactors already covered by the existing operator-chat and callback-gating tests (Tasks 1 and 2) — no new test needed for those two.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "refactor(webhook): reinstate shared identity helper, drop functools.partial, fix stale-state messaging"
```

---

## Task 12: EmailModal/GateScreen UX polish (Minor)

**Files:**
- Modify: `web/components/invite-gate.tsx`
- Modify: `web/components/invite-gate.test.tsx`

**Minor (interfaces reviewer):** Four independent UI nits in the same file from the same round, grouped for one commit since none touch shared state with each other:
1. `GateScreen` still uses `min-h-[calc(100vh-3rem)]` (a leftover from before Task 3 moved `InviteGate` out from under the padded `main`), while the loading/error states use `min-h-screen` — causes a visible vertical jump when the session-check fetch resolves.
2. The retry button uses `window.location.reload()` (full page reload) instead of resetting `loading`/`loadError` to re-run the fetch effect.
3. The session-check fetch isn't aborted on unmount (no `AbortController`) — harmless today given the `alive` guard, but not idiomatic.
4. `EmailModal`'s `previousFocus?.focus()` restore-on-unmount (copied from `ExportModal`) doesn't fit this context — there's no trigger button that opened the modal, so `previousFocus` is `document.body`; after a successful save, focus silently lands on `<body>` instead of the newly-rendered `GateScreen` heading.

- [ ] **Step 1: Normalize `GateScreen`'s min-height and focus its heading on mount**

Replace `GateScreen`:

```tsx
function GateScreen({ status }: { status: Exclude<UserStatus, 'approved'> }) {
  const blocked = status === 'blocked';
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
          {blocked ? 'BLOCKED' : 'PENDING'}
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 text-2xl font-semibold tracking-tight text-ink outline-none"
        >
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
```

(`min-h-[calc(100vh-3rem)]` → `min-h-screen`; added `headingRef` + mount-focus so keyboard/screen-reader users get a cue when the gate state changes — this also fixes finding 4, since focus now lands on the heading instead of wherever `EmailModal` leaves it.)

- [ ] **Step 2: Drop `EmailModal`'s focus-restore-on-unmount**

Replace:

```tsx
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);
```

with:

```tsx
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
```

- [ ] **Step 3: Replace the full-page reload retry with a state reset, and abort the fetch on unmount**

Add a `retryKey` state next to the other `InviteGate` state:

```tsx
  const [user, setUser] = useState<InviteUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
```

Replace the session-check effect:

```tsx
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetch('/api/auth/me', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace('/login');
          return null;
        }
        if (!res.ok) throw new Error('session check failed');
        return (await res.json()) as InviteUser;
      })
      .then((next) => {
        if (alive && next) setUser(next);
      })
      .catch((err) => {
        if (alive && (err as Error)?.name !== 'AbortError') {
          setLoadError('Could not check access. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [router, retryKey]);
```

Replace the retry button:

```tsx
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-4 h-8 rounded-md bg-signal px-3 text-[13px] font-medium text-onsignal transition-ui hover:bg-signal-bright"
          >
            Retry
          </button>
```

(The `AbortController` change (finding 3) has no dedicated test below — the `alive` guard already prevents the observable symptom (state-after-unmount), so there's no behavior bug to assert against; this step is pure resource hygiene.)

- [ ] **Step 4: Restore a lightweight email-format check without reintroducing a duplicate regex**

Task 6 correctly removed the duplicate client-side `_EMAIL_RE`, but dropped format validation entirely instead of narrowing it — a malformed-but-non-empty value like `"asdf"` now shows no app-styled error. Reuse the `<input type="email" required>`'s native constraint validation (already declared on the input) instead of adding a second regex:

Replace the start of `submit()`:

```tsx
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Enter an email address.');
      return;
    }
```

with:

```tsx
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Enter an email address.');
      return;
    }
    if (!event.currentTarget.checkValidity()) {
      setError('Enter a valid email address.');
      return;
    }
```

- [ ] **Step 5: Add tests**

In `web/components/invite-gate.test.tsx`, add:

```tsx
  it('shows a format error for a malformed but non-empty email without calling the API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 1,
      email: null,
      status: 'pending',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    const input = await screen.findByLabelText('Email');
    fireEvent.change(input, { target: { value: 'asdf' } });
    fireEvent.click(screen.getByRole('button', { name: /save email/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a valid email address/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/email', expect.anything());
  });

  it('moves focus to the gate heading when the pending screen mounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        id: 1,
        email: 'user@example.com',
        status: 'pending',
      }), { status: 200 })),
    );

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    expect(await screen.findByRole('heading', { name: 'Pending approval' })).toHaveFocus();
  });

  it('retries the session check without a full page reload', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) return new Response('server error', { status: 500 });
      return new Response(JSON.stringify({
        id: 1,
        email: 'user@example.com',
        status: 'approved',
      }), { status: 200 });
    }));

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    await screen.findByText('Could not check access');
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Dashboard feed')).toBeTruthy();
    expect(callCount).toBe(2);
  });
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run web/components/invite-gate.test.tsx
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/components/invite-gate.tsx web/components/invite-gate.test.tsx
git commit -m "fix(web): normalize gate min-height, lighter retry, restore email format check, fix modal focus"
```

---

## Task 13: Add missing test coverage — focus-trap cycling + 401/403 redirect (Nit)

**Files:**
- Modify: `web/components/invite-gate.test.tsx`

**Nit (react reviewer):** Two coverage gaps, no source change needed:
1. No test exercises the focus-trap's actual Tab/Shift+Tab wrap behavior (only initial autofocus is asserted) — a regression in `trapTab` (e.g. wrong element list, inverted condition) would pass CI silently.
2. No positive-path test confirms 401/403 still redirects to `/login` (only the negative 500-doesn't-redirect case, added in Task 4, is tested).

- [ ] **Step 1: Add the focus-trap cycling test**

In `web/components/invite-gate.test.tsx`, add:

```tsx
  it('traps Tab focus within the email modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        id: 1,
        email: null,
        status: 'pending',
      }), { status: 200 })),
    );

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    const input = await screen.findByLabelText('Email');
    const saveButton = screen.getByRole('button', { name: /save email/i });

    saveButton.focus();
    fireEvent.keyDown(saveButton, { key: 'Tab' });
    expect(input).toHaveFocus();

    input.focus();
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(saveButton).toHaveFocus();
  });
```

- [ ] **Step 2: Add the 401/403 redirect positive-path test**

In `web/components/invite-gate.test.tsx`, add:

```tsx
  it('redirects to /login on a 401 session-check response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })));

    render(<InviteGate><div>Dashboard feed</div></InviteGate>);

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByText('Dashboard feed')).toBeNull();
  });
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run web/components/invite-gate.test.tsx
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add web/components/invite-gate.test.tsx
git commit -m "test(web): cover focus-trap Tab cycling and 401/403 redirect"
```

---

## Final Review

After Tasks 9–13: dispatch the final whole-branch code reviewer (per `superpowers:subagent-driven-development`) against the full diff of Tasks 1–13 (merge-base `main` → HEAD) — the same gate round 1's Final Review section calls for, re-run now that the round 2 fixes are in. Once clean, commit the remaining staged-but-uncommitted work from Tasks 4–8 (bundle with Tasks 9–13's commits in whatever grouping `superpowers:finishing-a-development-branch` recommends), then run `superpowers:finishing-a-development-branch` to decide how to land the branch (this repo's `no-merge-to-main` rule applies: do not merge to `main` without the user explicitly naming it as the target). This is the final auto-generated round for this branch — anything a subsequent review pass finds should go through PR review (`/greploop` or `/check-pr`), not another generated plan.
