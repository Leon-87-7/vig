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

> A second `/council-review` pass on this branch found 10 more findings (1 Major, 6 Minor, 3 Nit) after Tasks 1–8 were implemented — see [invite-gate-255-256-council-fixes-round2.md](./invite-gate-255-256-council-fixes-round2.md) (Tasks 9–13) before running the Final Review above.
