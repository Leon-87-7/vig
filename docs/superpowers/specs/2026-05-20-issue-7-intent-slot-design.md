# Issue #7 Design: Mini-PRD Intent Slot + /spec Command + chat_state Routing

**Date:** 2026-05-20  
**Issue:** [#7](https://github.com/Leon-87-7/vig/issues/7)  
**Approach:** Option B — `database.py` helpers + thin `webhook.py` dispatcher  
**Builds on:** Issue #6 (auto PRD slot, merged in commit 13c12b5)

---

## 1. Architecture Overview

Issue #7 wires the intent-slot path end-to-end: a user can click `✍️ Text your intent` after receiving an auto PRD, type a project direction, and receive a Gemini-2.5-Pro-generated PRD personalised to that direction. A `/spec` command provides a recovery path.

No new modules are introduced. Changes land in five existing files:

| File | Change |
|------|--------|
| `src/database.py` | Add `chat_state` CRUD helpers + `find_job_by_suffix` |
| `src/telegram/sender.py` | Add `send_force_reply` |
| `src/telegram/webhook.py` | Replace `prd_build_spec` stub; add callbacks + routing order |
| `src/processors/prd.py` | Add `run_intent`, `reaper_intent`; update `build_prd_markdown` |
| `src/worker.py` | Add `prd_intent` dispatch + boot `reaper_intent` call |

New test files: `tests/test_webhook.py`; additions to `tests/test_prd.py`.

---

## 2. DB Layer (`database.py`)

The schema already contains all required columns and tables (landed in slice #1 DDL). No DDL changes needed.

### New helpers

```python
async def get_chat_state(chat_id: int) -> dict | None
async def set_chat_state(chat_id: int, mode: str, job_id: str, expires_minutes: int = 10) -> None
async def clear_chat_state(chat_id: int) -> None
async def find_jobs_by_suffix(chat_id: int, suffix: str) -> list[dict]
async def get_recent_jobs(chat_id: int, limit: int = 5) -> list[dict]
```

**`set_chat_state`** uses `INSERT OR REPLACE` — the `chat_state` table's `PRIMARY KEY (chat_id)` gives free upsert semantics. Sets `expires_at = datetime('now', '+10 minutes')`.

**`find_jobs_by_suffix`** returns all matches for the suffix regardless of `content_type` — content-type filtering is done in the webhook handler to distinguish "no match", "only short", and "long match" branches:
```sql
SELECT * FROM jobs
WHERE chat_id = ?
  AND id LIKE '%' || ?
ORDER BY created_at DESC
```
Webhook handler then splits: `long_matches = [j for j in rows if j['content_type']=='long' and j['status'] in ('transcript_done','done')]` and `short_matches = [j for j in rows if j['content_type']=='short']`.

**`get_recent_jobs`** used by the `/spec` no-match fallback to list the last N jobs in a chat:
```sql
SELECT id, title, content_type, status FROM jobs
WHERE chat_id = ?
ORDER BY created_at DESC
LIMIT ?
```

---

## 3. Sender (`telegram/sender.py`)

One new function:

```python
async def send_force_reply(chat_id: int, text: str) -> dict
```

Sends `reply_markup={"force_reply": True, "input_field_placeholder": "Your project direction..."}`. Used by `prd_intent_prompt` callback handler to prompt the user for intent text.

---

## 4. Webhook (`telegram/webhook.py`)

### 4.1 Callback handlers

Replace the existing `prd_build_spec` stub and add two new handlers in `_handle_callback`:

| Callback data | Action |
|---------------|--------|
| `prd_build_spec:{job_id}` | Reply with sub-menu: `[🤖 Build auto Spec \| prd_auto:{job_id}]` `[✍️ Text your intent \| prd_intent_prompt:{job_id}]` |
| `prd_auto:{job_id}` | Attempt atomic lock; enqueue `{"task":"prd_auto","job_id":...}`; reply `📐 PRD already generating, hang tight.` on contention |
| `prd_intent_prompt:{job_id}` | Call `set_chat_state(chat_id, 'awaiting_intent', job_id)`; call `send_force_reply` with prompt text |

Also update `prd.py`'s auto-delivery to emit `prd_build_spec:{job_id}` button (replacing the `prd_intent_stub` button from slice #6).

### 4.2 Message routing order

Executed in strict order for every incoming text message:

```
1. Slash command path
   if text.startswith("/"):
       await clear_chat_state(chat_id)        # side-effect for ALL slash commands
       dispatch to /spec, /cancel, /find, /rebuild-graph, /photoBatch-* handlers
       return

2. Awaiting-intent path
   state = await get_chat_state(chat_id)
   if state and state["expires_at"] > now (UTC):
       pipeline = detect_pipeline(text)
       if pipeline in ("short", "long"):       # bare URL → new video
           await clear_chat_state(chat_id)
           reply "🔄 Started new job; previous intent canceled."
           enqueue video job
       elif len(text.strip()) < 3:             # too short
           reply "📐 Intent too short. Reply with at least a few words..."
           # leave state armed
       else:                                   # valid intent
           await queue.enqueue({"task": "prd_intent", "job_id": state["job_id"], "intent_text": text})
           await clear_chat_state(chat_id)
       return

3. Normal URL routing
   detect_pipeline(text) → create_job / reject
```

### 4.3 Slash commands

| Command | Behaviour |
|---------|-----------|
| `/spec <suffix> [intent...]` | See §4.4 |
| `/cancel` | `clear_chat_state(chat_id)`; reply `✍️ Intent canceled.` |
| `/find <query>` | Existing brain search (unchanged) |
| `/rebuild-graph` | Existing rebuild (unchanged) |
| `/photoBatch-start/end` | Existing batch (unchanged) |
| Any other `/...` | Fall through (Telegram handles `/start`, `/help` natively) |

### 4.4 `/spec` command

```
/spec <suffix> [intent text...]
```

1. Parse: `suffix = parts[1][-4:]`; `intent_text = " ".join(parts[2:]).strip() or None`
2. Query `find_jobs_by_suffix(chat_id, suffix)` → all rows; split into `long_matches` and `short_matches` in Python
3. **`long_matches` empty and `short_matches` empty** → query `get_recent_jobs(chat_id, 5)` and reply `No job ending in {suffix} found.\nLast 5 jobs in this chat:\n• ...`
4. **`long_matches` empty, `short_matches` non-empty** → reply `📐 PRD is only available for long videos. Job {suffix} is a short.`
5. **`long_matches` non-empty** → take index 0 (most recent); reply `📐 PRD for: "{title}" — generating …`
   - No intent → enqueue `prd_auto`
   - Intent present → enqueue `prd_intent`

---

## 5. PRD Processor (`processors/prd.py`)

### 5.1 `build_prd_markdown(prd, *, intent_text=None)`

Signature change: add keyword-only `intent_text` param. When truthy, insert immediately after the `# PRD: ...` title line:

```markdown
**Your direction:** _<intent_text>_
```

### 5.2 `reaper_intent()`

Mirrors `reaper()`:
```sql
UPDATE jobs SET prd_intent_status='error', updated_at=CURRENT_TIMESTAMP
WHERE prd_intent_status='generating' AND updated_at < datetime('now','-10 minutes')
```

### 5.3 `run_intent(job_id, intent_text)`

Follows the same a→k pipeline as `run_auto` with these differences:

| Step | Difference from `run_auto` |
|------|---------------------------|
| **Atomic lock** | Uses cooldown-gate query: `... AND (prd_intent_completed_at IS NULL OR prd_intent_completed_at < datetime('now','-' \|\| ? \|\| ' seconds'))` |
| **Lock contention reply** | Sends user-facing message (unlike `run_auto` which fails silently) |
| **Gemini model** | `settings.PRD_INTENT_MODEL` (`gemini-2.5-pro`) |
| **Prompt** | Prepends: `"The user's project direction: {intent_text}. Use this to shape the PRD."` |
| **Drive filename** | `{slug}_{job_id[-4:]}_intent.md` |
| **Sheets** | `append_prd_row(..., slot='intent', intent_text=intent_text)` |
| **DB fields** | `prd_intent_status`, `prd_intent_drive_file_id`, `prd_intent_drive_url`, `prd_intent_json`, `prd_intent_text`, `prd_intent_completed_at` |
| **Telegram delivery** | Caption: `📐 PRD with your direction: _{intent_text}_` + 4-line summary + `[✍️ Text your intent]` button only |
| **Failure messages** | All failure cases send a user-facing Telegram message |

### 5.4 Failure messages (user-facing)

| Failure | Message |
|---------|---------|
| Both Gemini keys failed | `⚠️ PRD generation failed (both Gemini keys exhausted). Try /spec {suffix} in a few minutes.` |
| JSON parse failure | `⚠️ PRD generation produced invalid output. Please try /spec {suffix} with different intent.` |
| Lock conflict | `📐 PRD already generating, hang tight.` |
| Cooldown violation | `📐 Last PRD just generated. Read it first, then /spec again if you want to refine.` |

---

## 6. Worker (`worker.py`)

Two additions:

1. **Boot**: `await prd.reaper_intent()` alongside the existing `await prd.reaper()`
2. **Dispatch case**:
   ```python
   elif task_type == "prd_intent":
       await prd.run_intent(job_id, task["intent_text"])
   ```
   Failure is caught and a user-facing message sent (unlike `prd_auto` which is silent).

---

## 7. Logging Events

All `intent_text` values are **never logged** — only `intent_text_len` (integer).

| Event key | Fired when |
|-----------|-----------|
| `prd.intent.enqueued` | Task enqueued in worker dispatch |
| `prd.chat_state.armed` | `set_chat_state` called by `prd_intent_prompt` callback |
| `prd.chat_state.consumed` | Valid intent text received, state cleared |
| `prd.chat_state.expired_or_missed` | State found but `expires_at` in the past |
| `prd.chat_state.canceled_by_url` | URL detected while in `awaiting_intent` |
| `prd.spec.matched` | `/spec` found a long-video job |
| `prd.spec.no_match` | `/spec` found no matching job |
| `prd.spec.short_video_rejected` | `/spec` matched only short-video jobs |

---

## 8. Tests

### `tests/test_prd.py` additions

| Test | Coverage |
|------|----------|
| Cooldown gate — 14s apart | Second `run_intent` is rejected |
| Cooldown gate — 16s apart | Both calls succeed |
| `build_prd_markdown` with `intent_text` | "Your direction" line present |
| `build_prd_markdown` without `intent_text` | No direction line |

### `tests/test_webhook.py` (new)

| Test | Coverage |
|------|----------|
| Plain text in `awaiting_intent` → enqueues `prd_intent` | Happy path |
| Slash command in `awaiting_intent` → clears state | Slash escape |
| Bare URL in `awaiting_intent` → new video job | URL hijack |
| Text < 3 chars in `awaiting_intent` → reply, state stays | Min-length guard |
| `/spec` — no match | Error reply + last-5 list |
| `/spec` — only short-video match | Rejection reply |
| `/spec` — single long match (no intent) | Enqueues `prd_auto` |
| `/spec` — multiple long matches | Most-recent wins |
| `intent_text` never in any log record | Privacy check |
| `chat_state` PK-replace semantics | Second `set_chat_state` overwrites first |

---

## 9. Out of Scope

- `/start` and `/help` are native Telegram commands; no explicit handlers added. The slash-command routing path clears `chat_state` as a side-effect for any `/` prefix.
- No new Python modules introduced.
- `sheets.py` receives only minor additions (`slot` and `intent_text` optional params on `append_prd_row`).
