# Invite Gate — Council Review Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every finding from the `/council-review` of branch `invite-gate-255-256` vs `main` (4 parallel reviewers: ponytail, correctness, interfaces, react — synthesized 2026-07-01). Two are auth-bypass Blockers in the Telegram invite-approval flow; the rest are UX/a11y/DRY fixes in the invite gate web component and minor hardening in the Python backend.

**Architecture:** The invite gate has two enforcement points that must agree: (1) `src/auth/middleware.py` blocks non-approved users from `/api/*` (except `/api/auth/*`), and (2) `src/telegram/webhook.py::_invite_gate_allows` blocks non-approved chats from the *message* path in the Telegram webhook. The callback_query path (`_handle_callback` → `_CALLBACK_TABLE`) was never wired into either check, and the operator-only `invite_approve`/`invite_block` callbacks never verify the caller is the operator — that's the two Blockers. On the frontend, `web/components/invite-gate.tsx` gates `children` client-side; `web/app/(dashboard)/layout.tsx` renders `<Sidebar>` before/outside that gate, so nav chrome is visible before approval resolves.

**Tech Stack:** Python (FastAPI, aiosqlite), pytest/pytest-asyncio; Next.js App Router, React, Vitest + Testing Library.

## Global Constraints

- Do not weaken `SessionMiddleware`'s existing `approved`-status check in `src/auth/middleware.py` — only clarify/comment its exemption scope.
- The operator identity for Telegram authorization is `settings.OPERATOR_CHAT_ID` (see `src/telegram/webhook.py::_notify_operator_invite`, line ~1126) — reuse it, don't invent a new operator-identity source.
- `_invite_gate_allows` (webhook.py ~line 1144) is the single source of truth for "is this chat allowed to act" on the Telegram side — the callback path must call the same function, not a re-implementation.
- Keep `EmailPayload`/email-normalization behavior identical after dedup — the consolidated validator must accept/reject exactly what `_EMAIL_RE` in `src/api/auth.py` and `src/telegram/webhook.py` currently accept/reject (same regex semantics), since `tests/test_auth.py` and `tests/test_webhook.py` already assert on current behavior.
- Web changes must keep the existing dark-plate/JetBrains Mono design system (`DESIGN.md`) — reuse the project's existing `Spinner` and `ExportModal`'s dialog/focus-trap pattern rather than inventing new primitives.
- Every task adds/extends tests proving the specific fix (unit test for the bug, not a broad new suite).

---

## Task 1: Authorize invite approve/block callbacks + collapse duplication

**Files:**
- Modify: `src/telegram/webhook.py` (`_cb_invite_approve`, `_cb_invite_block`, lines ~367–390)
- Modify: `tests/test_webhook.py`

**Blocker (correctness reviewer, verified):** `_cb_invite_approve`/`_cb_invite_block` trust `ctx.job_id` (target chat to approve/block) with no check that `ctx.chat_id` is `settings.OPERATOR_CHAT_ID`. Any chat that can fire an `invite_approve:<id>`/`invite_block:<id>` callback can self-approve or block arbitrary users. Compare `_cb_document_md` (line ~351–355), which checks `job.get("chat_id") == ctx.chat_id` before acting.

Ponytail also flagged these two functions as near-duplicates (same shape, `"approved"`/`"blocked"` + two swapped message/log strings) — fix both in the same task since the duplication and the missing check live in the same lines.

- [x] **Step 1: Add operator check, collapse into one handler**

Replace both functions with a single `_cb_invite_decision(ctx, status, notify_msg, log_action)` (or equivalent) that:
1. Returns early (with `answer_callback_query(ctx.cq_id, text="Not authorized.")` and a log line) if `ctx.chat_id != settings.OPERATOR_CHAT_ID`.
2. Otherwise does what the two functions currently do (parse `target_chat_id`, `database.set_user_status`, notify target, edit operator's message).

Keep `"invite_approve"` and `"invite_block"` as two entries in `_CALLBACK_TABLE` (e.g. via `functools.partial` or two thin wrappers calling the shared function with different `status`/messages) — do not change the callback data format or the table's public shape.

- [x] **Step 2: Add tests for the authorization check**

In `tests/test_webhook.py`, add a test that dispatches `invite_approve:<id>` (and `invite_block:<id>`) via `_handle_callback` from a **non-operator** `chat.id` and asserts `database.set_user_status` was NOT called and the target user's status is unchanged. Also verify the existing operator-chat test(s) still pass unmodified in behavior (approve/block from the operator chat still works).

- [x] **Step 3: Run tests**

```bash
python -m pytest tests/test_webhook.py -q
```
Expected: all pass, including the new authorization test.

- [x] **Step 4: Commit**

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "fix(webhook): require operator chat for invite approve/block callbacks"
```

**Status: done, committed as `3971bb1`.** Council-verified (2026-07-01 round 2): fix confirmed correct — see Round 2 findings below for one residual defense-in-depth nit on the operator check.

---

## Task 2: Enforce invite gate on callback_query dispatch

**Files:**
- Modify: `src/telegram/webhook.py` (`_handle_callback`, lines ~413–430)
- Modify: `tests/test_webhook.py`

**Blocker (correctness reviewer, verified):** Only the message/photo/document paths call `_invite_gate_allows` (confirmed 3 call sites, all in `webhook()`/`_route_text`, none in `_handle_callback`). A `blocked` chat with any pre-existing job can still trigger `reprocess`, `document_md`, `prd_*`, etc. via inline buttons.

- [x] **Step 1: Gate non-invite callbacks by status**

In `_handle_callback`, after resolving `chat_id` and before dispatching to `handler`, for any `prefix` other than `"invite_approve"`/`"invite_block"` (those must remain reachable so the operator can act on a pending user regardless of that user's own status), check the calling chat's status via the same status lookup `_invite_gate_allows` uses (reuse the underlying status-check helper it calls, or call `_invite_gate_allows(chat_id, "", identity)` if that's safe to call without side effects for this path — match whatever `_invite_gate_allows` already does for consistency). If not allowed, `answer_callback_query(cq_id, text=...)` with a rejection message and return before dispatch.

- [x] **Step 2: Add test for blocked-user callback rejection**

Add a test where a chat with `status == "blocked"` fires a non-invite callback (e.g. `reprocess:<job_id>`) and assert the underlying handler's side effect (e.g. `database.update_job_status` or whatever `_cb_reprocess` does) does NOT occur.

- [x] **Step 3: Run tests**

```bash
python -m pytest tests/test_webhook.py -q
```

- [x] **Step 4: Commit**

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "fix(webhook): enforce invite gate on callback_query dispatch"
```

**Status: done, committed as `da2049f`.** Council-verified (2026-07-01 round 2): confirmed correct, no bypass found.

---

## Task 3: Gate dashboard chrome (Sidebar) behind approval

**Files:**
- Modify: `web/app/(dashboard)/layout.tsx`

**Major (interfaces + react reviewers):** `<Sidebar />` is mounted outside/before `<InviteGate>`, so full nav chrome renders and is clickable while a user is pending/blocked/still loading, and looks like an inset panel inside an otherwise fully-dressed dashboard rather than a focused blocking state.

- [x] **Step 1: Move `InviteGate` to wrap the whole layout**

Restructure `layout.tsx` so `<InviteGate>` wraps the entire `flex h-screen` container (including `<Sidebar>`), not just `children`. `InviteGate` should render its own gate screens (loading/pending/blocked/email-modal) full-screen when not approved, and only render its `children` prop (the full `<Sidebar> + main content` layout) once `status === 'approved'` (and email is present).

- [x] **Step 2: Verify no regressions in existing layout tests**

Check whether `web/app/(dashboard)/layout.tsx` or `invite-gate.tsx` currently has any test asserting on layout structure; if so, update it to match. Run:
```bash
npx vitest run web/components/invite-gate.test.tsx
```

- [x] **Step 3: Commit**

```bash
git add "web/app/(dashboard)/layout.tsx"
git commit -m "fix(web): gate sidebar chrome behind invite approval"
```

**Status: done, committed as `35c8a30`.** Council-verified (2026-07-01 round 2): resolved cleanly, no remaining issue.

---

## Task 4: Harden invite-gate.tsx error handling (session check + email submit)

**Files:**
- Modify: `web/components/invite-gate.tsx`
- Modify: `web/components/invite-gate.test.tsx`

**Major (react + interfaces reviewers):**
1. The session-check effect treats any fetch failure (network blip, 500, parse error) the same as a 401 and force-redirects to `/login` — no distinction, no retry path, silently logs out approved users on transient errors.
2. `submit()` (email save) has no `try/catch`: a rejected fetch (offline/DNS failure) skips `setSaving(false)`, leaving the button stuck on "Saving..." forever with no error shown.

- [x] **Step 1: Fix session-check redirect logic**

In the effect that fetches the current user/session, only call `router.replace('/login')` when the response status is 401 or 403. For other failures (network error thrown, 5xx, JSON parse error), set a distinct error state and render a retry affordance instead of redirecting — do not silently assume unauthenticated.

- [x] **Step 2: Wrap `submit()` in try/catch/finally**

Ensure `setSaving(false)` always runs (in a `finally`), and a thrown fetch error (not just a non-2xx response) sets the existing error state with a user-visible message instead of leaving the UI stuck.

- [x] **Step 3: Add tests**

In `invite-gate.test.tsx`, add:
- A test that a transient fetch failure (rejected promise / 500) during the session check does NOT redirect to `/login` and instead shows an error/retry state.
- A test that a rejected `submit()` fetch resets `saving` to false and shows an error message (button is re-enabled, not stuck).

- [x] **Step 4: Run tests**

```bash
npx vitest run web/components/invite-gate.test.tsx
```

- [ ] **Step 5: Commit** — implemented and staged, not yet committed (bundled with Task 5's changes to the same files; see Round 2 findings below for a follow-up before committing).

```bash
git add web/components/invite-gate.tsx web/components/invite-gate.test.tsx
git commit -m "fix(web): don't redirect to login on transient fetch errors"
```

---

## Task 5: EmailModal accessibility + loading state + blocked/needsEmail overlap

**Files:**
- Modify: `web/components/invite-gate.tsx`
- Modify: `web/components/invite-gate.test.tsx`

**Minor (react + interfaces reviewers, and correctness's blocked/needsEmail overlap finding):**
1. `EmailModal` has no `role="dialog"`/`aria-modal="true"`/`aria-labelledby`, no focus moved to the input on mount, no focus trap — mirror the existing pattern in `web/components/ExportModal.tsx` (`dialogRef`/focus-trap/`aria-*`).
2. The error message isn't wired via `aria-describedby`/`role="alert"` — screen readers never announce validation failures.
3. The loading state is a bare empty `<div className="min-h-screen bg-canvas" />` — use the project's existing `Spinner` component instead.
4. `needsEmail` (`!user.email`) and `status` are independent: a `blocked` user without a stored email sees the "blocked" screen **and** the email modal simultaneously, implying resubmitting an email might unblock them (it doesn't — `set_user_email` never touches `status`).

- [x] **Step 1: Read `ExportModal.tsx` for the existing dialog pattern**

Read `web/components/ExportModal.tsx` (`dialogRef`/`closeButtonRef`/`trapTab`, lines ~42–80) to match the codebase's established convention exactly — don't invent a new one.

- [x] **Step 2: Add dialog semantics + focus trap to `EmailModal`**

Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the "Email required" heading, move focus to the email input on mount, and trap Tab focus within the modal (reuse `ExportModal`'s trap approach).

- [x] **Step 3: Wire the error message for screen readers**

Add an `id` on the error `<p>`, `aria-describedby` on the `<input>` pointing at it, and `role="alert"` on the error element.

- [x] **Step 4: Replace the bare loading div with `Spinner`**

Import the project's existing `Spinner` (used in `ExportModal.tsx` ~line 111–115) and use it for the initial session-check loading state, with a short label (e.g. "Checking access…").

- [x] **Step 5: Exclude `blocked` status from the email modal**

Change the condition that renders `EmailModal` so it never renders when `status === 'blocked'` — a blocked user should only ever see the blocked screen.

- [x] **Step 6: Add tests**

- Assert the modal has `role="dialog"` and `aria-modal="true"`, and that focus lands on the email input on mount.
- Assert a `blocked` user with no email sees only the blocked screen, not the email modal.

- [x] **Step 7: Run tests**

```bash
npx vitest run web/components/invite-gate.test.tsx
```

- [ ] **Step 8: Commit** — implemented and staged, not yet committed. **Do not commit yet** — Round 2 review (below) found this step introduced a new Major bug (approved-but-missing-email users see "pending" copy); fix that first, then commit Tasks 4+5 together.

```bash
git add web/components/invite-gate.tsx web/components/invite-gate.test.tsx
git commit -m "fix(web): a11y for email modal, spinner loading state, blocked/needsEmail overlap"
```

---

## Task 6: Consolidate email validation into one shared validator

**Files:**
- Modify: `src/utils/validators.py`
- Modify: `src/api/auth.py`
- Modify: `src/telegram/webhook.py`
- Modify: `web/components/invite-gate.tsx`

**Minor (ponytail + correctness, same finding):** The same email regex/normalization logic is duplicated in `src/api/auth.py:39-44`, `src/telegram/webhook.py:46,1109-1111`, and again client-side in `web/components/invite-gate.tsx:16`. `src/utils/validators.py` already exists and is imported by `webhook.py` for other validation.

- [x] **Step 1: Add a shared email validator/normalizer to `src/utils/validators.py`**

Move the `_EMAIL_RE` pattern and normalization function there (name it per that module's existing conventions), preserving exact current regex semantics (per Global Constraints — do not change what's accepted/rejected).

- [x] **Step 2: Use it from `src/api/auth.py` and `src/telegram/webhook.py`**

Replace both local copies with imports from `src/utils/validators.py`. Delete the now-dead local `_EMAIL_RE`/normalize definitions in both files.

- [x] **Step 3: Drop the redundant client-side JS regex**

In `web/components/invite-gate.tsx`, remove the JS-side `EMAIL_RE.test()` check (line ~16/51) — the `<input type="email" required>` already gets HTML5 constraint validation before submit, and the server is the source of truth. Keep any non-emptiness check needed for the button-disabled state if one currently depends on the regex.

- [x] **Step 4: Run tests**

```bash
python -m pytest tests/test_auth.py tests/test_webhook.py -q
npx vitest run web/components/invite-gate.test.tsx
```
Expected: unchanged pass/fail behavior — this is a pure dedup, not a behavior change.

- [ ] **Step 5: Commit** — implemented and staged, not yet committed. Round 2 review found the client-side regex was dropped entirely rather than narrowed (see findings below) — decide whether to restore a lightweight format check before committing.

```bash
git add src/utils/validators.py src/api/auth.py src/telegram/webhook.py web/components/invite-gate.tsx
git commit -m "refactor: consolidate email validation into src/utils/validators.py"
```

---

## Task 7: Trim `_telegram_identity` indirection + skip redundant upserts

**Files:**
- Modify: `src/telegram/webhook.py`
- Modify: `tests/test_webhook.py`

**Minor (ponytail + correctness):**
1. `_telegram_identity()` builds a 3-key dict that only feeds one `database.upsert_user` call in `_remember_invite_identity` — single caller, no reuse; inline it.
2. `_invite_gate_allows` unconditionally calls `database.upsert_user` on every incoming message, even for already-approved users whose identity hasn't changed — an avoidable DB write on the hot path.

- [x] **Step 1: Inline `_telegram_identity`** — done, but Round 2 review found this task's own premise was wrong: `_telegram_identity` had **two** call sites (`webhook()` and `_handle_callback()`), not one. Inlining duplicated the 3-key identity dict at both sites instead of eliminating the duplication. Follow-up: reinstate a small shared helper (see findings below).

Remove the `_telegram_identity()` helper and `_remember_invite_identity`'s intermediate dict; construct the `database.upsert_user(...)` call arguments directly at its one call site.

- [x] **Step 2: Skip the upsert when status is already `approved` and identity is unchanged**

In `_invite_gate_allows`, only call `upsert_user` when the user is not yet `approved`, or when the incoming name/username differs from the stored one. Do not change behavior for pending/unknown/blocked users — they must still get upserted every time (that's how the operator sees fresh identity info).

- [x] **Step 3: Add/adjust a test**

Add a test asserting `database.upsert_user` is NOT called for a second message from an already-`approved` user whose identity is unchanged, and IS still called for a `pending` user.

- [x] **Step 4: Run tests**

```bash
python -m pytest tests/test_webhook.py -q
```

- [ ] **Step 5: Commit** — implemented and staged, not yet committed. Fix the Step 1 duplication regression first.

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "perf(webhook): skip redundant upsert_user for unchanged approved users"
```

---

## Task 8: Middleware exemption comment + operator-unset warning

**Files:**
- Modify: `src/auth/middleware.py` (lines ~39–40)
- Modify: `src/telegram/webhook.py` (`_notify_operator_invite`, lines ~1122–1141)

**Nit (correctness reviewer):**
1. The whole `/api/auth/*` prefix is exempted from the approval gate (needed for `/me` and email submission) with no comment pinning the intended exemption scope — a future endpoint added under that prefix would silently bypass the gate too.
2. `_notify_operator_invite` silently no-ops with no log line if `settings.OPERATOR_CHAT_ID` is unset, hiding a pending signup with no operator visibility.

- [x] **Step 1: Add a comment in `middleware.py`**

Add a one-line comment above the `/api/auth/` exemption naming exactly which routes are meant to be reachable pre-approval (e.g. `/api/auth/me`, `/api/auth/email`) so a future addition under that prefix is a deliberate, reviewed choice, not a silent gap. Do not change the exemption logic itself.

- [x] **Step 2: Log a warning when `OPERATOR_CHAT_ID` is unset**

In `_notify_operator_invite`, when `settings.OPERATOR_CHAT_ID` is `None`/falsy, log a warning (e.g. `log.warning("invite.operator_chat_id_unset", chat_id=...)`) before returning, so a misconfiguration is visible in logs instead of silent.

- [x] **Step 3: Run tests**

```bash
python -m pytest tests/test_webhook.py -q
```

- [ ] **Step 4: Commit** — implemented and staged, not yet committed.

```bash
git add src/auth/middleware.py src/telegram/webhook.py
git commit -m "chore: document auth exemption scope, warn on unset OPERATOR_CHAT_ID"
```

---

## Final Review

After all 8 tasks: dispatch the final whole-branch code reviewer (per `superpowers:subagent-driven-development`) against the full diff of this plan's work (merge-base `main` → HEAD), then run `superpowers:finishing-a-development-branch` to decide how to land the branch (this repo's `no-merge-to-main` rule applies: do not merge to `main` without the user explicitly naming it as the target).

---

## Round 2: Post-implementation `/council-review` findings (2026-07-01)

All 8 tasks above were implemented (Tasks 1–3 committed as `3971bb1`/`da2049f`/`35c8a30`; Tasks 4–8 implemented and staged, not yet committed). A second `/council-review` run against the resulting diff (4 parallel reviewers: ponytail, correctness, interfaces, react) confirmed **both original Blockers are correctly fixed** (verified by code read + passing test suites: `pytest tests/test_webhook.py tests/test_auth.py` 96 passed, `vitest run invite-gate.test.tsx` 8/8 passed) and surfaced 10 follow-up findings (1 Major, 6 Minor, 3 Nit), converted below into Tasks 9–13. These follow the same Global Constraints as Tasks 1–8. **Do not commit Tasks 4–8 until Task 9 (the Major) is fixed** — it's a regression introduced by Task 5.

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

## Round 2 Final Review

After Tasks 9–13: dispatch the final whole-branch code reviewer (per `superpowers:subagent-driven-development`) against the full diff of Tasks 1–13 (merge-base `main` → HEAD) — the same gate the original Final Review section (above) calls for, re-run now that the Round 2 fixes are in. Once clean, commit the remaining staged-but-uncommitted work from Tasks 4–8 (bundle with Tasks 9–13's commits in whatever grouping `superpowers:finishing-a-development-branch` recommends), then run `superpowers:finishing-a-development-branch` to decide how to land the branch (this repo's `no-merge-to-main` rule applies: do not merge to `main` without the user explicitly naming it as the target).
