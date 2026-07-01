Implementation summary
- Enforced the invite gate in `src/telegram/webhook.py::_handle_callback` for all callback prefixes except `invite_approve` and `invite_block`.
- Reused `_invite_gate_allows(chat_id, "", identity)` as the callback-query source of truth, passing callback-derived identity when available.
- If the gate rejects the callback, `_handle_callback` now answers the callback query with `Access restricted.` and returns before dispatch.
- Kept operator invite callbacks reachable without checking the target user's pending/blocked status.
- Added a blocked-user callback regression test for `reprocess`.
- Updated existing direct `_handle_callback` tests to seed approved users where the test intent is an allowed callback path.

Tests
- Command: `C:\Users\leone\AppData\Local\Programs\Python\Python313\python.exe -m pytest tests/test_webhook.py -q`
- Result: `75 passed in 19.55s`

Files changed
- `src/telegram/webhook.py`
- `tests/test_webhook.py`
- `.superpowers/sdd/task-2-report.md`

Self-review
- The gate is applied at the callback dispatch entry point, so individual callback handlers do not need duplicated status checks.
- `invite_approve` and `invite_block` are explicitly exempted, preserving Task 1's operator workflow.
- The blocked-user test asserts the underlying reprocess side effect does not happen by wrapping `database.create_job` and verifying it was not awaited.
- Existing callback tests now make their preconditions explicit by seeding approved users instead of relying on the old ungated behavior.

Concerns
- Rejection callbacks now use a generic `Access restricted.` callback-query message while `_invite_gate_allows` still sends the status-specific chat message (`Access blocked.`, waiting prompt, or email prompt). That keeps status logic centralized, but the callback ack text is intentionally generic.
