# Fix Test Mocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 21 pre-existing test failures in `test_article_pipeline.py` (5) and `test_repo_pipeline.py` (16) caused by `send_message` mocks that return `None` or a non-dict, plus a missing `edit_message_text` mock.

**Architecture:** Both `article.run()` and `repo.run()` call `send_message(...)` and immediately read `.get("message_id")` off the result (line 178 and line 325 respectively). If the mock returns `None`, this AttributeErrors instantly. If it returns a bare `MagicMock`, `status_msg_id` becomes a truthy MagicMock which triggers an `edit_message_text` call — a real HTTP call that fails in test. The pattern is the same in both files; the fixes are symmetric.

**Tech Stack:** pytest, pytest-asyncio (`asyncio_mode = "auto"` already set), `unittest.mock.AsyncMock`

---

## Failure anatomy

| Pattern | Count | Root cause | File |
|---|---|---|---|
| A | 2 | `_capture_send` returns `None` implicitly → `None.get("message_id")` | article |
| B | 3 | `AsyncMock()` with no `return_value` → MagicMock triggers real `edit_message_text` | article |
| C/D | 13 | `send_message` never mocked → real HTTP call → 404 / event-loop teardown | repo |
| E | 3 | `send_message` mocked with `side_effect=lambda` that returns `None` → `None.get(...)` | repo |

Total: 21. All are in two pre-existing test files, unrelated to PR 114.

---

## Task 1: Article — autouse fixture for `edit_message_text`

**Files:**
- Modify: `tests/test_article_pipeline.py` (insert after `temp_db` fixture, ~line 66)

When `send_message` returns `{"message_id": 123}` (after later fixes), `article.run()` calls `edit_message_text(chat_id, 123, ...)` on the real function — an unmocked HTTP call. Add an autouse fixture to intercept it for every test in this file.

- [ ] **Step 1: Insert autouse fixture**

Add this block immediately after the `temp_db` fixture (after line 65 `pass`):

```python
@pytest.fixture(autouse=True)
def _mock_edit_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("src.processors.article.edit_message_text", AsyncMock())
```

- [ ] **Step 2: Verify the file is valid Python**

Run: `python -m py_compile tests/test_article_pipeline.py`
Expected: no output (exit 0)

- [ ] **Step 3: Commit**

```bash
git add tests/test_article_pipeline.py
git commit -m "test(article): autouse fixture for edit_message_text"
```

---

## Task 2: Article Pattern A — `_capture_send` missing return (2 tests)

**Files:**
- Modify: `tests/test_article_pipeline.py:180–181` and `:211–212`

`_capture_send` appends text but returns `None` implicitly. `article.run()` does:
```python
status_result = await send_message(...)
status_msg_id = status_result.get("message_id")  # AttributeError when status_result is None
```

Fix: add `return {"message_id": 123}` to both closures.

- [ ] **Step 1: Edit `test_article_run_paywall_phrase_sets_warning` (line 180–181)**

Change:
```python
    async def _capture_send(chat_id, text, **kwargs):
        sent_messages.append(text)
```
To:
```python
    async def _capture_send(chat_id, text, **kwargs):
        sent_messages.append(text)
        return {"message_id": 123}
```

- [ ] **Step 2: Edit `test_article_run_short_body_sets_paywall_warning` (line 211–212)**

Same change — there is an identical `_capture_send` closure in this test.

- [ ] **Step 3: Run both tests**

Run: `pytest tests/test_article_pipeline.py::test_article_run_paywall_phrase_sets_warning tests/test_article_pipeline.py::test_article_run_short_body_sets_paywall_warning -v`
Expected: 2 passed

- [ ] **Step 4: Commit**

```bash
git add tests/test_article_pipeline.py
git commit -m "test(article): fix _capture_send to return message_id dict (pattern A)"
```

---

## Task 3: Article Pattern B — bare `AsyncMock()` for `send_message` (3 tests)

**Files:**
- Modify: `tests/test_article_pipeline.py:96`, `:136`, `:259`

`AsyncMock()` without `return_value` resolves to a `MagicMock` when awaited. `MagicMock().get("message_id")` returns another `MagicMock` (truthy), so `status_msg_id` becomes a MagicMock. The autouse fixture from Task 1 prevents `edit_message_text` from making a real HTTP call, but the MagicMock `status_msg_id` can still break downstream code that expects an int or None.

Fix: `AsyncMock()` → `AsyncMock(return_value={"message_id": 123})`

- [ ] **Step 1: Fix `test_article_run_cache_hit_does_not_call_jina` (line 96)**

Change:
```python
    send_msg = AsyncMock()
```
To:
```python
    send_msg = AsyncMock(return_value={"message_id": 123})
```

- [ ] **Step 2: Fix `test_article_run_cache_miss_calls_jina_and_caches` (line 136)**

Change:
```python
    send_msg = AsyncMock()
```
To:
```python
    send_msg = AsyncMock(return_value={"message_id": 123})
```

- [ ] **Step 3: Fix `test_article_run_freestyle_override_uses_prompt` (line 259)**

Change:
```python
    monkeypatch.setattr("src.processors.article.send_message", AsyncMock())
```
To:
```python
    monkeypatch.setattr("src.processors.article.send_message", AsyncMock(return_value={"message_id": 123}))
```

- [ ] **Step 4: Run all 5 article async tests**

Run: `pytest tests/test_article_pipeline.py -k asyncio -v` (or just run the whole file)
Expected: all async tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/test_article_pipeline.py
git commit -m "test(article): add return_value to send_message mocks (pattern B)"
```

---

## Task 4: Repo — autouse fixture for `send_message` + `edit_message_text`

**Files:**
- Modify: `tests/test_repo_pipeline.py` (insert after `_BUNDLE` dict, ~line 30)

13 of the 16 async repo tests never mock `send_message`, so the real function fires a live HTTP request to `https://api.telegram.org/bottest-token/sendMessage`, receiving a 404 or triggering event-loop teardown errors. `edit_message_text` has the same problem once `status_msg_id` is set. A single autouse fixture fixes all 13 with one addition.

- [ ] **Step 1: Insert autouse fixture**

After the `_BUNDLE` dict (after line 29), add:

```python
@pytest.fixture(autouse=True)
def _mock_telegram(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.processors.repo.send_message",
        AsyncMock(return_value={"message_id": 123}),
    )
    monkeypatch.setattr("src.processors.repo.edit_message_text", AsyncMock())
```

- [ ] **Step 2: Verify syntax**

Run: `python -m py_compile tests/test_repo_pipeline.py`
Expected: exit 0

- [ ] **Step 3: Run repo tests, expect 13/16 async to pass (3 still fail via Pattern E)**

Run: `pytest tests/test_repo_pipeline.py -v --tb=line 2>&1 | tail -30`
At this point tests using `side_effect=lambda` that overrides `send_message` (Pattern E) still fail.

- [ ] **Step 4: Commit**

```bash
git add tests/test_repo_pipeline.py
git commit -m "test(repo): autouse fixture for send_message + edit_message_text (patterns C/D)"
```

---

## Task 5: Repo Pattern E — fix lambda mocks that return `None` (3 tests)

**Files:**
- Modify: `tests/test_repo_pipeline.py:530–531`, `:553–554`, `:578–579`

Three tests mock `send_message` with `AsyncMock(side_effect=lambda c, t, **kw: user_messages.append(t))`. This lambda overrides the autouse fixture. `list.append()` returns `None`, so `status_result.get("message_id")` crashes.

Fix: `lambda c, t, **kw: user_messages.append(t) or {"message_id": 123}`.  
`list.append()` returns `None`; `None or dict` evaluates to the dict. The lambda still captures the message text AND now returns the required response dict.

- [ ] **Step 1: Fix `test_run_github_404_error_path` (line 530–531)**

Change:
```python
    monkeypatch.setattr("src.processors.repo.send_message",
                        AsyncMock(side_effect=lambda c, t, **kw: user_messages.append(t)))
```
To:
```python
    monkeypatch.setattr("src.processors.repo.send_message",
                        AsyncMock(side_effect=lambda c, t, **kw: user_messages.append(t) or {"message_id": 123}))
```

- [ ] **Step 2: Fix `test_run_gemini_unavailable_error_path` (line 553–554)**

Same change — identical lambda pattern.

- [ ] **Step 3: Fix `test_run_rate_limit_403_shows_rate_limit_message` (line 578–579)**

Same change.

- [ ] **Step 4: Run the full repo test suite**

Run: `pytest tests/test_repo_pipeline.py -v`
Expected: all 44 tests pass (28 sync + 16 async)

- [ ] **Step 5: Commit**

```bash
git add tests/test_repo_pipeline.py
git commit -m "test(repo): fix send_message lambdas to return message_id dict (pattern E)"
```

---

## Final validation

Run the full test suite to confirm no regressions:

```bash
pytest tests/test_article_pipeline.py tests/test_repo_pipeline.py -v
```

Expected: **47 passed, 0 failed** (17 article + 44 repo — but ~6 non-async article tests + 5 async = 11 article; and 28 sync + 16 async = 44 repo; total ~55 tests).

Then run the full suite:

```bash
pytest --tb=short -q
```

Expected: same pass count as post-PR-114 baseline (all tests that were passing before still pass; the 21 failures are now fixed).
