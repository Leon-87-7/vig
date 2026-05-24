# Promise-Gap Extraction + Telegram Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add promise-gap analysis (unfulfilled promises + hidden value) to every enrichment job — stored in the DB (#33) and rendered in the Telegram enrichment message (#34).

**Architecture:** `_build_prompt()` gains a universal suffix that instructs Gemini to return a `promise_gap` object. `enrich()` pops it from the parsed JSON and returns a 3-tuple. `run()` persists it via the existing `update_job_status(**fields)` mechanism, then passes it to `_build_enrichment_message()` which appends a delimited section to the Telegram message.

**Tech Stack:** Python, aiosqlite, pytest-asyncio, unittest.mock

---

## File Map

| File | Change |
|---|---|
| `src/database.py` | Add `promise_gap TEXT` to `SCHEMA_SQL`; add `ALTER TABLE` guard in `init_db()` |
| `src/processors/enrichment.py` | Add `_PROMISE_GAP_SUFFIX` constant; update `_build_prompt()`, `enrich()` (3-tuple), `_build_enrichment_message()`, `run()` |
| `tests/test_enrichment.py` | Add 4 new test functions (2 for #33, 2 for #34) |

---

### Task 1: DB Schema — `promise_gap TEXT` column

**Files:**
- Modify: `src/database.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_database.py` (append at the bottom):

```python
import aiosqlite
import pytest

@pytest.mark.asyncio
async def test_promise_gap_column_exists(tmp_path, monkeypatch) -> None:
    """promise_gap column must exist after init_db()."""
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr("src.config.settings.DB_PATH", db_file)
    from src import database
    await database.init_db()
    async with aiosqlite.connect(db_file) as conn:
        cursor = await conn.execute("PRAGMA table_info(jobs)")
        cols = {row[1] async for row in cursor}
    assert "promise_gap" in cols
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest tests/test_database.py::test_promise_gap_column_exists -v
```

Expected: FAIL — `assert "promise_gap" in cols`

- [ ] **Step 3: Add column to SCHEMA_SQL and init_db() guard**

In `src/database.py`, inside `SCHEMA_SQL`, add after `processing_time_ms INTEGER,` (line 63):

```python
    processing_time_ms          INTEGER,
    promise_gap                 TEXT,
```

Then in `init_db()`, extend `_TEMPLATE_COLUMNS` (or add a new list right after it commits):

After the `for stmt in _TEMPLATE_COLUMNS:` block (after `await conn.commit()`), add:

```python
    # One-time column addition for promise_gap (issue #33)
    try:
        await conn.execute("ALTER TABLE jobs ADD COLUMN promise_gap TEXT")
        await conn.commit()
    except Exception:
        pass  # column already exists
```

- [ ] **Step 4: Run test to verify it passes**

```
pytest tests/test_database.py::test_promise_gap_column_exists -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/database.py tests/test_database.py
git commit -m "feat(db): add promise_gap TEXT column to jobs schema (#33)"
```

---

### Task 2: Prompt Suffix — instruct Gemini to return `promise_gap`

**Files:**
- Modify: `src/processors/enrichment.py`
- Test: `tests/test_enrichment.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_enrichment.py`:

```python
from src.processors.enrichment import _build_prompt

def test_build_prompt_contains_promise_gap_instruction() -> None:
    prompt = _build_prompt("My Title", "some transcript content")
    assert "promise_gap" in prompt
    assert "gaps" in prompt
    assert "hidden_value" in prompt
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest tests/test_enrichment.py::test_build_prompt_contains_promise_gap_instruction -v
```

Expected: FAIL — `assert "promise_gap" in prompt`

- [ ] **Step 3: Add `_PROMISE_GAP_SUFFIX` and wire it into `_build_prompt()`**

In `src/processors/enrichment.py`, add this module-level constant after `EMBEDDING_DIM = 768`:

```python
_PROMISE_GAP_SUFFIX = """

### STEP 6: PROMISE-GAP ANALYSIS
Identify where the title/thumbnail sets expectations the content does not fully satisfy.

Add this field to your JSON output (alongside the other fields):
  "promise_gap": {
    "gaps": ["specific promise in the title that the video never delivers"],
    "hidden_value": ["genuinely useful insight not signalled by the title"]
  }

Use empty arrays when nothing fits. This field is REQUIRED in every response."""
```

Then in `_build_prompt()`, change the final `return` line from:

```python
    return f"""Analyze this YouTube transcript for a video titled: "{title}".
...
{extra}{context}
### TRANSCRIPT:
{truncated}"""
```

to append the suffix before `### TRANSCRIPT:`:

```python
    return f"""Analyze this YouTube transcript for a video titled: "{title}".
...
{extra}{context}{_PROMISE_GAP_SUFFIX}
### TRANSCRIPT:
{truncated}"""
```

(Only the last line of the f-string changes — replace `{extra}{context}` with `{extra}{context}{_PROMISE_GAP_SUFFIX}`)

Exact edit — in the f-string at the end of `_build_prompt()`, the line:
```
{extra}{context}
### TRANSCRIPT:
```
becomes:
```
{extra}{context}{_PROMISE_GAP_SUFFIX}
### TRANSCRIPT:
```

- [ ] **Step 4: Run test to verify it passes**

```
pytest tests/test_enrichment.py::test_build_prompt_contains_promise_gap_instruction -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/processors/enrichment.py tests/test_enrichment.py
git commit -m "feat(enrichment): add promise-gap instruction suffix to _build_prompt (#33)"
```

---

### Task 3: `enrich()` — pop `promise_gap` and return 3-tuple

**Files:**
- Modify: `src/processors/enrichment.py`
- Test: `tests/test_enrichment.py`

The current signature is:
```python
async def enrich(job: dict) -> tuple[Enrichment, dict | None]:
```
We change it to:
```python
async def enrich(job: dict) -> tuple[Enrichment, dict | None, dict | None]:
```

- [ ] **Step 1: Write the failing test**

Add to `tests/test_enrichment.py` — update the existing `_SAMPLE_GEMINI_JSON` fixture at the top of the file to include `promise_gap`, then add a new test:

First, find and update `_SAMPLE_GEMINI_JSON` (around line 114 in current file) to add the `promise_gap` key:

```python
_SAMPLE_GEMINI_JSON = json.dumps({
    "category": "Technical Tutorial",
    "topic": "claude code + n8n",
    "objective": "Show how to integrate Claude Code with n8n workflows.",
    "action_points": ["Use Claude API", "Set up n8n webhook", "Test the flow"],
    "tools": [
        {"name": "n8n", "type": "service", "url": "https://n8n.io", "description": "Workflow automation platform"},
        {"name": "Claude", "type": "service", "url": "https://claude.ai", "description": "AI assistant"},
    ],
    "market_data": "",
    "promise_gap": {
        "gaps": ["Advanced deployment never covered"],
        "hidden_value": ["Practical n8n error handling tips"],
    },
})
```

Then add this test (after the existing `test_enrich_returns_enrichment_on_success`):

```python
@pytest.mark.asyncio
async def test_enrich_pops_and_returns_promise_gap(monkeypatch: pytest.MonkeyPatch) -> None:
    """enrich() must pop promise_gap from parsed JSON and return it as 3rd element."""
    monkeypatch.setattr("src.config.settings.GEMINI_FREE_API_KEY", "free-key")
    monkeypatch.setattr("src.config.settings.GEMINI_PAID_API_KEY", "")

    with patch.object(GeminiClient, "_call_sync", return_value=_SAMPLE_GEMINI_JSON):
        result, template_analysis, promise_gap = await enrich(
            {"title": "Test Video", "transcript": "some transcript"}
        )

    assert promise_gap == {
        "gaps": ["Advanced deployment never covered"],
        "hidden_value": ["Practical n8n error handling tips"],
    }
    assert template_analysis is None
    assert isinstance(result, Enrichment)
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest tests/test_enrichment.py::test_enrich_pops_and_returns_promise_gap -v
```

Expected: FAIL — cannot unpack 3 values from a 2-tuple

- [ ] **Step 3: Update `enrich()` to return 3-tuple**

In `src/processors/enrichment.py`, update `enrich()`:

```python
async def enrich(job: dict) -> tuple[Enrichment, dict | None, dict | None]:
    """Call Gemini with free→paid key fallback. Raises EnrichmentUnavailableError if both fail."""
    from src.services.gemini_client import gemini_client, GeminiUnavailableError

    title = job.get("title", "") or "Untitled"
    transcript = job.get("transcript", "") or ""
    template = job.get("template") or "summary"
    key_phrases = json.loads(job.get("key_phrases") or "[]")
    prompt = _build_prompt(title, transcript, template, key_phrases)

    try:
        raw = await gemini_client.generate(prompt, model="gemini-2.5-flash")
    except GeminiUnavailableError as exc:
        raise EnrichmentUnavailableError(str(exc)) from exc
    data = _extract_json(raw)
    template_analysis = data.pop("template_analysis", None)
    promise_gap = data.pop("promise_gap", None)
    result = _parse_enrichment(data)
    log.info("enrichment_ok", category=result.category, topic=result.topic)
    return result, template_analysis, promise_gap
```

Also update the existing `test_enrich_returns_enrichment_on_success` test to unpack 3 values (it will break otherwise):

```python
@pytest.mark.asyncio
async def test_enrich_returns_enrichment_on_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """When a key succeeds, enrich() returns a populated Enrichment dataclass."""
    monkeypatch.setattr("src.config.settings.GEMINI_FREE_API_KEY", "free-key")
    monkeypatch.setattr("src.config.settings.GEMINI_PAID_API_KEY", "")

    with patch.object(GeminiClient, "_call_sync", return_value=_SAMPLE_GEMINI_JSON):
        result, template_analysis, promise_gap = await enrich(
            {"title": "Test Video", "transcript": "some transcript"}
        )

    assert isinstance(result, Enrichment)
    assert result.category == "Technical Tutorial"
    assert result.topic == "claude code + n8n"
    assert "Use Claude API" in result.action_points_str
    assert template_analysis is None
```

Also update `test_enrich_both_keys_failed_raises` — it doesn't unpack the return value so it's fine, but double-check it still passes.

- [ ] **Step 4: Run all enrichment tests**

```
pytest tests/test_enrichment.py -v
```

Expected: ALL PASS (including the updated existing tests)

- [ ] **Step 5: Commit**

```bash
git add src/processors/enrichment.py tests/test_enrichment.py
git commit -m "feat(enrichment): pop promise_gap from Gemini response, return 3-tuple (#33)"
```

---

### Task 4: `run()` — persist `promise_gap` on successful enrichment

**Files:**
- Modify: `src/processors/enrichment.py` (`run()` function only)

`update_job_status()` already accepts arbitrary `**fields` and maps them to SQL columns, so no changes needed in `database.py` beyond the schema column added in Task 1.

- [ ] **Step 1: Update `run()` to unpack 3-tuple and persist `promise_gap`**

In `src/processors/enrichment.py`, in `run()`, change:

```python
    try:
        enrichment, template_analysis = await enrich(job)
```

to:

```python
    try:
        enrichment, template_analysis, promise_gap = await enrich(job)
```

Then in the `update_job_status(...)` call inside `run()`, add `promise_gap`:

```python
    await database.update_job_status(
        job_id,
        "done",
        ai_category=enrichment.category,
        ai_topic=enrichment.topic,
        ai_objective=enrichment.objective,
        ai_action_points=enrichment.action_points_str,
        ai_tools=enrichment.tools_str,
        ai_market_data=enrichment.market_data,
        template_analysis=json.dumps(template_analysis) if template_analysis else None,
        promise_gap=json.dumps(promise_gap) if promise_gap else None,
        completed_at=now,
    )
```

- [ ] **Step 2: Run the full test suite to check nothing broke**

```
pytest tests/ -v --tb=short
```

Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/processors/enrichment.py
git commit -m "feat(enrichment): persist promise_gap on successful enrichment job (#33)"
```

---

### Task 5: `_build_enrichment_message()` — render promise-gap section (#34)

**Files:**
- Modify: `src/processors/enrichment.py` (`_build_enrichment_message()` and its call in `run()`)
- Test: `tests/test_enrichment.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_enrichment.py`:

```python
def test_build_enrichment_message_with_promise_gap() -> None:
    """Message includes separator + gaps + hidden_value when promise_gap is present."""
    job = {"id": "20260519_120000_ABCD", "title": "Test Video", "chat_id": 1, "drive_url": ""}
    enrichment = _make_enrichment()
    promise_gap = {
        "gaps": ["Advanced deployment never covered"],
        "hidden_value": ["Practical n8n error handling tips"],
    }
    msg = _build_enrichment_message(job, enrichment, promise_gap=promise_gap)
    assert "=====PROMISE=GAP=====" in msg
    assert "Advanced deployment never covered" in msg
    assert "Practical n8n error handling tips" in msg


def test_build_enrichment_message_no_promise_gap_omits_separator() -> None:
    """Separator absent when promise_gap is None."""
    job = {"id": "20260519_120000_ABCD", "title": "Test Video", "chat_id": 1, "drive_url": ""}
    enrichment = _make_enrichment()
    msg = _build_enrichment_message(job, enrichment)
    assert "=====PROMISE=GAP=====" not in msg


def test_build_enrichment_message_empty_promise_gap_omits_separator() -> None:
    """Separator absent when both arrays are empty."""
    job = {"id": "20260519_120000_ABCD", "title": "Test Video", "chat_id": 1, "drive_url": ""}
    enrichment = _make_enrichment()
    promise_gap = {"gaps": [], "hidden_value": []}
    msg = _build_enrichment_message(job, enrichment, promise_gap=promise_gap)
    assert "=====PROMISE=GAP=====" not in msg
```

- [ ] **Step 2: Run tests to verify they fail**

```
pytest tests/test_enrichment.py::test_build_enrichment_message_with_promise_gap tests/test_enrichment.py::test_build_enrichment_message_no_promise_gap_omits_separator tests/test_enrichment.py::test_build_enrichment_message_empty_promise_gap_omits_separator -v
```

Expected: FAIL — `_build_enrichment_message` doesn't have `promise_gap` param

- [ ] **Step 3: Update `_build_enrichment_message()` signature and body**

Replace the current `_build_enrichment_message()` function with:

```python
def _build_enrichment_message(
    job: dict,
    enrichment: Enrichment,
    template_analysis: dict | None = None,
    promise_gap: dict | None = None,
) -> str:
    tag = f"job_{job['id'][-4:]}:"
    title = _escape_md(job.get("title", "Untitled"))
    drive_url = job.get("drive_url", "")

    tools_lines = []
    for t in enrichment.tools_raw:
        prefix = "$" if t.get("type") == "symbol" else f"\\[{_escape_md(t.get('type', 'tool'))}]"
        url_part = f" ({t['url']})" if t.get("url") else ""
        name = _escape_md(t["name"])
        desc = _escape_md(t.get("description", ""))
        tools_lines.append(f"• {prefix} {name}{url_part}: {desc}")

    action_lines = [f"• {_escape_md(ap)}" for ap in enrichment.action_points_str.split(" | ") if ap]

    transcript_line = (
        f"📄 [Transcript]({drive_url})" if drive_url else "📄 Transcript _(unavailable)_"
    )

    parts = [
        f"{tag}",
        f"=📺 {title}",
        f"🗃️ {_escape_md(enrichment.category)}",
        f"🎫 {_escape_md(enrichment.topic)}",
        "",
        "🎯 Objective",
        _escape_md(enrichment.objective),
        "",
        "✅ Action Points",
        *action_lines,
        "",
        "🛠 Tools",
        *tools_lines,
        "",
        transcript_line,
        "",
        "📐 Build Spec available — use the button below",
    ]
    if template_analysis:
        template = job.get("template") or "summary"
        parts.append(_format_template_analysis(template, template_analysis))

    gaps = promise_gap.get("gaps", []) if promise_gap else []
    hidden = promise_gap.get("hidden_value", []) if promise_gap else []
    if gaps or hidden:
        parts.append("\n=====PROMISE=GAP=====")
        if gaps:
            parts.append("❌ Unfulfilled:")
            parts.extend(f"• {_escape_md(g)}" for g in gaps)
        if hidden:
            parts.append("💎 Hidden value:")
            parts.extend(f"• {_escape_md(h)}" for h in hidden)

    return "\n".join(parts)
```

- [ ] **Step 4: Update the call in `run()` to pass `promise_gap`**

In `run()`, change:

```python
    msg = _build_enrichment_message(job, enrichment, template_analysis)
```

to:

```python
    msg = _build_enrichment_message(job, enrichment, template_analysis, promise_gap)
```

- [ ] **Step 5: Run all enrichment tests**

```
pytest tests/test_enrichment.py -v
```

Expected: ALL PASS

- [ ] **Step 6: Run full test suite**

```
pytest tests/ -v --tb=short
```

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/processors/enrichment.py tests/test_enrichment.py
git commit -m "feat(enrichment): render promise-gap section in Telegram message (#34)"
```

---

## Self-Review

### Spec coverage

| AC | Task |
|---|---|
| `promise_gap TEXT` column in DDL | Task 1 |
| `update_job_status()` accepts/persists `promise_gap` | Task 1 (column) + Task 4 (call site) — no signature change needed (uses `**fields`) |
| `_build_prompt()` has universal promise-gap suffix | Task 2 |
| `enrich()` pops `promise_gap` and returns it (3-tuple) | Task 3 |
| `promise_gap` persisted on every successful enrichment | Task 4 |
| Unit test: `_build_prompt()` contains instruction block | Task 2 |
| Unit test: `enrich()` pops and returns `promise_gap` | Task 3 |
| `_build_enrichment_message()` reads `promise_gap` | Task 5 |
| `=====PROMISE=GAP=====` separator in message | Task 5 |
| `gaps` under "❌ Unfulfilled:" label | Task 5 |
| `hidden_value` under "💎 Hidden value:" label | Task 5 |
| Section omitted when `promise_gap` is `None` or both empty | Task 5 |
| Unit test: separator + both subsections when data present | Task 5 |
| Unit test: separator absent when `promise_gap` is `None` | Task 5 |

All AC items covered.

### Placeholder scan

No TBDs, TODOs, or "similar to Task N" references — all code is complete.

### Type consistency

- `enrich()` returns `tuple[Enrichment, dict | None, dict | None]` — Task 3 defines it, Task 4 unpacks it, Task 5 receives `promise_gap: dict | None`.
- `_build_enrichment_message()` gains `promise_gap: dict | None = None` — default `None` means all existing call sites (and tests that don't pass it) continue to work.
- `update_job_status(..., promise_gap=...)` — keyword arg, no signature change.
