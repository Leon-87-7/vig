# Repo Pipeline #2–#8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full repo URL pipeline across issues #67–#73: GitHub bundle fetch, Gemini analysis, Telegram document delivery, Sheets persistence, Second Brain ingest, edge-case handling, and freestyle re-run.

**Branch:** `repo-pipeline`

**Architecture:** `src/services/github.py` grows four fetch helpers + `preprocess_readme` + `fetch_repo_bundle` with 7-day Redis cache; `src/processors/repo.py` replaces the stub with full pipeline logic (Gemini, document, inline button, Sheets + brain as fire-and-forget); `src/services/sheets.py` gains `append_repo_row` + `update_repo_row`; `src/telegram/webhook.py` `/force` handler gets Redis cache invalidation for repo URLs; `src/database.py` gains a v6→v7 migration to include `'repo'` in the `content_type` CHECK.

**Tech Stack:** Python 3.13, requests + asyncio.to_thread (GitHub calls), redis.asyncio (Redis), aiosqlite (SQLite), google-genai Gemini 2.5 Flash (structured output), Telegram Bot API sendDocument + sendMessage, Google Sheets API v4, pytest-asyncio, pytest monkeypatch

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/database.py` | Modify | Migration v6→v7: add `'repo'` to `content_type` CHECK |
| `src/services/github.py` | Modify | `fetch_readme`, `fetch_tree`, `fetch_manifest`, `preprocess_readme`, `fetch_repo_bundle`, `_detect_manifests` |
| `src/processors/repo.py` | Modify (full rewrite of logic) | Full pipeline: bundle → Gemini → doc → summary → Sheets + brain (fire-and-forget) |
| `src/services/sheets.py` | Modify | `TAB_REPO`, `_repo_row`, `append_repo_row`, `update_repo_row` |
| `src/telegram/webhook.py` | Modify | `/force` Redis DEL for both repo cache keys |
| `tests/test_database.py` | Modify | Add `test_create_repo_job` |
| `tests/test_github.py` | Modify | Tests for all new github.py functions |
| `tests/test_repo_pipeline.py` | Modify | Replace stub tests; full pipeline tests for all 7 issues |
| `tests/test_sheets.py` | Modify | `append_repo_row` / `update_repo_row` tests |
| `tests/test_webhook.py` | Modify | `/force` repo Redis invalidation test |

---

### Task 1: DB migration — add `'repo'` to `content_type` CHECK

**Files:**
- Modify: `src/database.py`
- Modify: `tests/test_database.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_database.py` (after existing imports):

```python
@pytest.mark.asyncio
async def test_create_repo_job() -> None:
    """content_type='repo' must be accepted by the jobs CHECK constraint."""
    import tempfile, os, src.database as db
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    old = db.settings.DB_PATH
    try:
        db.settings.DB_PATH = db_path
        await db.init_db()
        job_id = await db.create_job(
            chat_id=1, url="https://github.com/owner/repo", content_type="repo"
        )
        job = await db.get_job(job_id)
        assert job is not None
        assert job["content_type"] == "repo"
    finally:
        db.settings.DB_PATH = old
        os.unlink(db_path)
```

- [ ] **Step 2: Run to confirm it fails**

```
pytest tests/test_database.py::test_create_repo_job -v
```
Expected: FAIL — `IntegrityError: CHECK constraint failed`

- [ ] **Step 3: Add migration v6→v7 and update SCHEMA_SQL**

In `src/database.py`:

1. In `SCHEMA_SQL`, change the `CHECK` line in the `jobs` table:
```python
    CHECK(content_type IN ('short', 'long', 'article', 'repo')),
```

2. In `_V6_CREATE`, make the same change.

3. Define `_V7_CREATE` (same as `_V6_CREATE` but with `'repo'` added — copy the full DDL block and update the CHECK):
```python
_V7_CREATE = """CREATE TABLE IF NOT EXISTS jobs_v7 (
    id                          TEXT PRIMARY KEY,
    chat_id                     INTEGER NOT NULL,
    message_id                  INTEGER,
    url                         TEXT NOT NULL,
    content_type                TEXT NOT NULL,
    status                      TEXT NOT NULL DEFAULT 'pending',
    attempt                     INTEGER NOT NULL DEFAULT 1,
    error_msg                   TEXT,
    drive_url                   TEXT,
    title                       TEXT,
    transcript                  TEXT,
    ai_category                 TEXT,
    ai_topic                    TEXT,
    ai_objective                TEXT,
    ai_action_points            TEXT,
    ai_tools                    TEXT,
    ai_market_data              TEXT,
    prd_auto_status             TEXT,
    prd_auto_drive_file_id      TEXT,
    prd_auto_drive_url          TEXT,
    prd_auto_json               TEXT,
    prd_intent_status           TEXT,
    prd_intent_drive_file_id    TEXT,
    prd_intent_drive_url        TEXT,
    prd_intent_json             TEXT,
    prd_intent_text             TEXT,
    prd_intent_completed_at     TEXT,
    sheets_row_id               TEXT,
    template                    TEXT,
    template_analysis           TEXT,
    key_phrases                 TEXT,
    validation_warning_sent     INTEGER DEFAULT 0,
    template_detection_method   TEXT,
    processing_time_ms          INTEGER,
    promise_gap                 TEXT,
    bot_message_id              INTEGER,
    freestyle_prompt            TEXT,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at                TIMESTAMP,
    CHECK(content_type IN ('short', 'long', 'article', 'repo')),
    CHECK(status IN ('pending','processing','transcript_done','enriching','done','error','cancelled')),
    CHECK(prd_auto_status IS NULL OR prd_auto_status IN ('generating','done','error')),
    CHECK(prd_intent_status IS NULL OR prd_intent_status IN ('generating','done','error'))
)"""

_V7_COLS = [
    "id", "chat_id", "message_id", "url", "content_type", "status", "attempt",
    "error_msg", "drive_url", "title", "transcript", "ai_category", "ai_topic",
    "ai_objective", "ai_action_points", "ai_tools", "ai_market_data",
    "prd_auto_status", "prd_auto_drive_file_id", "prd_auto_drive_url", "prd_auto_json",
    "prd_intent_status", "prd_intent_drive_file_id", "prd_intent_drive_url",
    "prd_intent_json", "prd_intent_text", "prd_intent_completed_at", "sheets_row_id",
    "template", "template_analysis", "key_phrases", "validation_warning_sent",
    "template_detection_method", "processing_time_ms", "promise_gap", "bot_message_id",
    "freestyle_prompt", "created_at", "updated_at", "completed_at",
]


async def _migrate_v6_v7(conn: aiosqlite.Connection) -> None:
    """Expand content_type CHECK to include 'repo'."""
    await conn.execute(_V7_CREATE)
    cur = await conn.execute("PRAGMA table_info(jobs)")
    rows = await cur.fetchall()
    existing = {row[1] for row in rows}
    copy_cols = [c for c in _V7_COLS if c in existing]
    if copy_cols:
        col_str = ", ".join(copy_cols)
        await conn.execute(
            f"INSERT OR IGNORE INTO jobs_v7 ({col_str}) SELECT {col_str} FROM jobs"
        )
    await conn.execute("DROP TABLE jobs")
    await conn.execute("ALTER TABLE jobs_v7 RENAME TO jobs")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_chat_id ON jobs(chat_id)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url)")
```

4. Append to `_MIGRATIONS`:
```python
_MIGRATIONS.append(_migrate_v6_v7)
```

(The `is_fresh` path already uses `len(_MIGRATIONS)` so no change needed there.)

- [ ] **Step 4: Run to confirm it passes**

```
pytest tests/test_database.py::test_create_repo_job -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/database.py tests/test_database.py
git commit -m "feat(db): add 'repo' to content_type CHECK — migration v6→v7 (#67)"
```

---

### Task 2: GitHub fetch helpers + `preprocess_readme` (#67 — Part 1)

**Files:**
- Modify: `src/services/github.py`
- Modify: `tests/test_github.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_github.py` (after existing imports at top; add `import base64, pytest` if not present):

```python
import base64
import re

from src.services.github import (
    preprocess_readme,
    fetch_readme,
    fetch_tree,
    fetch_manifest,
    _detect_manifests,
)

# ---------------------------------------------------------------------------
# preprocess_readme
# ---------------------------------------------------------------------------

def test_preprocess_readme_strips_badge_line() -> None:
    raw = "[![Build](https://img.shields.io/badge/build-ok.svg)](https://github.com/x)\nHello world"
    result = preprocess_readme(raw)
    assert "shields.io" not in result
    assert "Hello world" in result


def test_preprocess_readme_strips_details_html() -> None:
    raw = "<details><summary>More</summary>Hidden text</details>\nVisible"
    result = preprocess_readme(raw)
    assert "<details>" not in result
    assert "Visible" in result


def test_preprocess_readme_strips_img_tag() -> None:
    raw = "Some text\n<img src='logo.png' />\nMore text"
    result = preprocess_readme(raw)
    assert "<img" not in result
    assert "Some text" in result
    assert "More text" in result


def test_preprocess_readme_truncates_at_50000() -> None:
    raw = "x" * 60_000
    assert len(preprocess_readme(raw)) == 50_000


def test_preprocess_readme_short_text_unchanged() -> None:
    raw = "Just a simple README.\nNo HTML here."
    assert preprocess_readme(raw) == raw


# ---------------------------------------------------------------------------
# _detect_manifests
# ---------------------------------------------------------------------------

def test_detect_manifests_depth1() -> None:
    tree = ["pyproject.toml", "src/main.py", "go.mod", "Dockerfile"]
    detected = _detect_manifests(tree)
    assert "pyproject.toml" in detected
    assert "go.mod" in detected
    assert "Dockerfile" in detected
    assert "src/main.py" not in detected


def test_detect_manifests_depth2_included() -> None:
    tree = ["src/package.json", "README.md"]
    assert "src/package.json" in _detect_manifests(tree)


def test_detect_manifests_depth3_excluded() -> None:
    tree = ["a/b/Cargo.toml"]
    assert "a/b/Cargo.toml" not in _detect_manifests(tree)


# ---------------------------------------------------------------------------
# fetch_readme
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_readme_returns_content() -> None:
    with patch("src.services.github._readme_sync", return_value=b"# Hello World"):
        result = await fetch_readme("owner", "repo", "tok")
    assert result == "# Hello World"


@pytest.mark.asyncio
async def test_fetch_readme_returns_none_on_404() -> None:
    with patch("src.services.github._readme_sync", return_value=None):
        result = await fetch_readme("owner", "missing", "tok")
    assert result is None


@pytest.mark.asyncio
async def test_fetch_readme_returns_none_on_error() -> None:
    with patch("src.services.github._readme_sync", side_effect=ConnectionError("timeout")):
        result = await fetch_readme("owner", "repo", "tok")
    assert result is None


# ---------------------------------------------------------------------------
# fetch_tree
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_tree_returns_paths() -> None:
    paths = ["src/main.py", "README.md", "go.mod"]
    with patch("src.services.github._tree_sync", return_value=paths):
        result = await fetch_tree("owner", "repo", "main", "tok")
    assert result == paths


@pytest.mark.asyncio
async def test_fetch_tree_returns_empty_on_error() -> None:
    with patch("src.services.github._tree_sync", side_effect=RuntimeError("5xx")):
        result = await fetch_tree("owner", "repo", "main", "tok")
    assert result == []


# ---------------------------------------------------------------------------
# fetch_manifest
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_manifest_returns_content() -> None:
    with patch("src.services.github._manifest_sync", return_value="[tool.poetry]"):
        result = await fetch_manifest("owner", "repo", "pyproject.toml", "tok")
    assert result == "[tool.poetry]"


@pytest.mark.asyncio
async def test_fetch_manifest_returns_none_on_404() -> None:
    with patch("src.services.github._manifest_sync", return_value=None):
        result = await fetch_manifest("owner", "repo", "Cargo.toml", "tok")
    assert result is None
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_github.py -k "preprocess_readme or detect_manifests or fetch_readme or fetch_tree or fetch_manifest" -v
```
Expected: FAIL — `ImportError` (functions don't exist yet)

- [ ] **Step 3: Implement in `src/services/github.py`**

Add after the existing imports and before `_TTL`:

```python
import base64 as _base64
import re as _re

_BADGE_LINE_RE = _re.compile(r"^\s*[\[!].*\]\(.*\)\s*$")
_INLINE_HTML_TAGS = {"details", "picture", "img", "table", "sub", "sup", "kbd", "p"}
_HTML_TAG_RE = _re.compile(
    r"</?(" + "|".join(_INLINE_HTML_TAGS) + r")(\s[^>]*)?>",
    _re.IGNORECASE,
)
_README_MAX = 50_000
_BUNDLE_TTL = 86_400 * 7  # 7 days

_MANIFEST_NAMES = frozenset([
    "pyproject.toml", "setup.py", "setup.cfg", "requirements.txt",
    "package.json", "pnpm-lock.yaml", "go.mod", "Cargo.toml",
    "Gemfile", "composer.json", "build.gradle", "build.gradle.kts",
    "pom.xml", "Dockerfile",
])


def preprocess_readme(raw: str) -> str:
    """Strip badge-only lines, inline HTML blocks, and truncate to 50 KB."""
    lines = [line for line in raw.splitlines() if not _BADGE_LINE_RE.match(line)]
    text = _HTML_TAG_RE.sub("", "\n".join(lines))
    return text[:_README_MAX]


def _detect_manifests(tree: list[str]) -> list[str]:
    """Return paths whose basename is a known manifest file and depth ≤ 2."""
    return [p for p in tree if len(p.split("/")) <= 2 and p.split("/")[-1] in _MANIFEST_NAMES]


def _readme_sync(owner: str, repo: str, token: str) -> bytes | None:
    """Return raw README bytes, or None on 404. Raises on other errors."""
    url = f"https://api.github.com/repos/{owner}/{repo}/readme"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return _base64.b64decode(resp.json()["content"].replace("\n", ""))


def _tree_sync(owner: str, repo: str, branch: str, token: str) -> list[str]:
    """Return flat list of blob paths. Raises on error."""
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return [item["path"] for item in resp.json().get("tree", []) if item.get("type") == "blob"]


def _manifest_sync(owner: str, repo: str, path: str, token: str) -> str | None:
    """Return manifest content as string, or None on 404. Raises on other errors."""
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return _base64.b64decode(resp.json()["content"].replace("\n", "")).decode("utf-8", errors="replace")


async def fetch_readme(owner: str, repo: str, token: str) -> str | None:
    """Return raw README text, or None on 404 or any error. Never raises."""
    try:
        raw = await asyncio.to_thread(_readme_sync, owner, repo, token)
    except Exception as exc:
        log.warning("github_readme_fetch_failed", repo=f"{owner}/{repo}", error=str(exc)[:120])
        return None
    return raw.decode("utf-8", errors="replace") if raw is not None else None


async def fetch_tree(owner: str, repo: str, branch: str, token: str) -> list[str]:
    """Return flat list of blob paths. Returns [] on any error."""
    try:
        return await asyncio.to_thread(_tree_sync, owner, repo, branch, token)
    except Exception as exc:
        log.warning("github_tree_fetch_failed", repo=f"{owner}/{repo}", error=str(exc)[:120])
        return []


async def fetch_manifest(owner: str, repo: str, path: str, token: str) -> str | None:
    """Return manifest content, or None on 404 or any error."""
    try:
        return await asyncio.to_thread(_manifest_sync, owner, repo, path, token)
    except Exception as exc:
        log.warning("github_manifest_fetch_failed", repo=f"{owner}/{repo}", path=path, error=str(exc)[:120])
        return None
```

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_github.py -k "preprocess_readme or detect_manifests or fetch_readme or fetch_tree or fetch_manifest" -v
```
Expected: all PASS

- [ ] **Step 5: Run all github tests (no regressions)**

```
pytest tests/test_github.py -v
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/github.py tests/test_github.py
git commit -m "feat(github): preprocess_readme, fetch_readme/tree/manifest, _detect_manifests (#67)"
```

---

### Task 3: `fetch_repo_bundle` + Redis bundle cache (#67 — Part 2)

**Files:**
- Modify: `src/services/github.py`
- Modify: `tests/test_github.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_github.py`:

```python
from src.services.github import fetch_repo_bundle


class TrackingRedis:
    """In-memory Redis double that tracks TTLs."""
    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._ttls: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value
        if ex is not None:
            self._ttls[key] = ex


_SAMPLE_BUNDLE = {
    "owner": "octocat", "repo": "Hello-World",
    "metadata": {"stars": 10, "forks": 2, "language": "Python",
                 "pushed_at": "2026-01-01T00:00:00Z", "description": "hi",
                 "archived": False},
    "default_branch": "main",
    "readme": "Hello", "readme_raw_bytes": 5,
    "tree": ["README.md"], "manifests": {}, "no_readme": False,
}


@pytest.mark.asyncio
async def test_fetch_repo_bundle_cache_hit_no_api_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cache hit: bundle returned from Redis, no GitHub API calls made."""
    import json
    fake_redis = TrackingRedis()
    fake_redis._store["github_repo_bundle:octocat/Hello-World"] = json.dumps(_SAMPLE_BUNDLE)

    import src.queue as q
    monkeypatch.setattr(q, "_redis", fake_redis)

    with patch("src.services.github._fetch_bundle_meta_sync") as mock_meta:
        result = await fetch_repo_bundle("octocat", "Hello-World", "tok")

    mock_meta.assert_not_called()
    assert result["owner"] == "octocat"
    assert result["readme"] == "Hello"


@pytest.mark.asyncio
async def test_fetch_repo_bundle_cold_cache_written_with_7day_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cache miss: bundle assembled, written to Redis with 7-day TTL."""
    import json
    fake_redis = TrackingRedis()

    import src.queue as q
    monkeypatch.setattr(q, "_redis", fake_redis)

    meta = {"stars": 5, "forks": 1, "language": "Go", "pushed_at": "2026-01-01T00:00:00Z",
            "description": None, "archived": False, "default_branch": "main"}

    with (
        patch("src.services.github._fetch_bundle_meta_sync", return_value=meta),
        patch("src.services.github._readme_sync", return_value=b"# Hello"),
        patch("src.services.github._tree_sync", return_value=["README.md", "go.mod"]),
        patch("src.services.github._manifest_sync", return_value="module x\n\ngo 1.21"),
    ):
        result = await fetch_repo_bundle("octocat", "myrepo", "tok")

    assert "go.mod" in result["manifests"]
    cached_raw = fake_redis._store.get("github_repo_bundle:octocat/myrepo")
    assert cached_raw is not None
    assert fake_redis._ttls.get("github_repo_bundle:octocat/myrepo") == 86_400 * 7


@pytest.mark.asyncio
async def test_fetch_repo_bundle_no_readme_sets_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """When README is 404, bundle has no_readme=True and empty readme string."""
    import json, src.queue as q
    monkeypatch.setattr(q, "_redis", TrackingRedis())

    meta = {"stars": 0, "forks": 0, "language": None, "pushed_at": None,
            "description": None, "archived": False, "default_branch": "main"}

    with (
        patch("src.services.github._fetch_bundle_meta_sync", return_value=meta),
        patch("src.services.github._readme_sync", return_value=None),
        patch("src.services.github._tree_sync", return_value=[".gitignore"]),
        patch("src.services.github._manifest_sync", return_value=None),
    ):
        result = await fetch_repo_bundle("ghost", "empty-repo", "tok")

    assert result["no_readme"] is True
    assert result["readme"] == ""
    assert result["readme_raw_bytes"] == 0


@pytest.mark.asyncio
async def test_fetch_repo_bundle_404_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """When metadata call returns None (404), fetch_repo_bundle raises FileNotFoundError."""
    import src.queue as q
    monkeypatch.setattr(q, "_redis", TrackingRedis())

    with patch("src.services.github._fetch_bundle_meta_sync", return_value=None):
        with pytest.raises(FileNotFoundError):
            await fetch_repo_bundle("ghost", "private-repo", "tok")
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_github.py -k "fetch_repo_bundle" -v
```
Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement `_fetch_bundle_meta_sync` + `fetch_repo_bundle`**

Add to `src/services/github.py` (after `fetch_manifest`):

```python
def _fetch_bundle_meta_sync(owner: str, repo: str, token: str) -> dict | None:
    """Full metadata including default_branch. Returns None on 404. Raises on 403/5xx."""
    url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    return {
        "stars": data["stargazers_count"],
        "forks": data["forks_count"],
        "language": data.get("language"),
        "pushed_at": data.get("pushed_at"),
        "description": data.get("description"),
        "archived": data.get("archived", False),
        "default_branch": data.get("default_branch", "main"),
    }


async def fetch_repo_bundle(owner: str, repo: str, token: str) -> dict:
    """Assemble the full repo bundle with README, file tree, and manifests.

    Cache key: github_repo_bundle:{owner}/{repo}, TTL 7 days.
    Raises FileNotFoundError on 404, requests.HTTPError on 403/5xx.
    """
    from src import queue

    cache_key = f"github_repo_bundle:{owner}/{repo}"
    client = queue._client()

    try:
        cached = await client.get(cache_key)
        if cached:
            log.info("github_bundle_cache_hit", repo=f"{owner}/{repo}")
            return json.loads(cached)
    except Exception:
        log.warning("github_bundle_cache_read_failed", repo=f"{owner}/{repo}")

    meta = await asyncio.to_thread(_fetch_bundle_meta_sync, owner, repo, token)
    if meta is None:
        raise FileNotFoundError(f"{owner}/{repo} not found or private")

    default_branch = meta.pop("default_branch")

    readme_raw_bytes_obj, tree = await asyncio.gather(
        asyncio.to_thread(_readme_sync, owner, repo, token),
        asyncio.to_thread(_tree_sync, owner, repo, default_branch, token),
    )

    no_readme = readme_raw_bytes_obj is None
    readme_raw_bytes = len(readme_raw_bytes_obj) if readme_raw_bytes_obj else 0
    readme_text = readme_raw_bytes_obj.decode("utf-8", errors="replace") if readme_raw_bytes_obj else ""
    readme_preprocessed = preprocess_readme(readme_text)

    manifest_paths = _detect_manifests(tree)
    manifest_contents: list[str | None] = []
    if manifest_paths:
        manifest_contents = list(await asyncio.gather(*[
            asyncio.to_thread(_manifest_sync, owner, repo, path, token)
            for path in manifest_paths
        ]))

    manifests = {
        path: content
        for path, content in zip(manifest_paths, manifest_contents)
        if content is not None
    }

    bundle = {
        "owner": owner,
        "repo": repo,
        "metadata": meta,
        "default_branch": default_branch,
        "readme": readme_preprocessed,
        "readme_raw_bytes": readme_raw_bytes,
        "tree": tree,
        "manifests": manifests,
        "no_readme": no_readme,
    }

    try:
        await client.set(cache_key, json.dumps(bundle), ex=_BUNDLE_TTL)
        log.info("github_bundle_cache_written", repo=f"{owner}/{repo}")
    except Exception:
        log.warning("github_bundle_cache_write_failed", repo=f"{owner}/{repo}")

    return bundle
```

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_github.py -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/github.py tests/test_github.py
git commit -m "feat(github): fetch_repo_bundle + Redis bundle cache (7-day TTL) (#67)"
```

---

### Task 4: `/force` Redis cache invalidation for repo (#67 — Part 3)

**Files:**
- Modify: `src/telegram/webhook.py`
- Modify: `tests/test_webhook.py`

- [ ] **Step 1: Write failing test**

Find the existing `/force` tests section in `tests/test_webhook.py` and add:

```python
@pytest.mark.asyncio
async def test_force_repo_deletes_both_redis_cache_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """When /force is called with a repo URL and an existing job, both Redis keys are deleted."""
    deleted: list[str] = []

    class SpyRedis:
        async def delete(self, *keys: str) -> int:
            deleted.extend(keys)
            return len(keys)
        async def get(self, key: str) -> None:
            return None
        async def lpos(self, *a, **kw) -> None:
            return None

    monkeypatch.setattr("src.queue._redis", SpyRedis())
    monkeypatch.setattr("src.telegram.webhook.queue._client", lambda: SpyRedis())

    existing_job = {
        "id": "20260101_120000_ABCD", "content_type": "repo",
        "bot_message_id": None, "drive_url": None, "status": "done",
    }
    monkeypatch.setattr("src.telegram.webhook.database.find_recent_job_by_url",
                        AsyncMock(return_value=existing_job))
    monkeypatch.setattr("src.telegram.webhook.database.list_allowed_domains",
                        AsyncMock(return_value=set()))
    monkeypatch.setattr("src.telegram.webhook.database.get_markdown_cache",
                        AsyncMock(return_value=None))
    monkeypatch.setattr("src.telegram.webhook.database.reset_job", AsyncMock())
    monkeypatch.setattr("src.telegram.webhook.database.clear_chat_state", AsyncMock())
    monkeypatch.setattr("src.telegram.webhook.queue.enqueue", AsyncMock())
    monkeypatch.setattr("src.telegram.webhook.send_message", AsyncMock())

    # Dispatch /force via the slash handler directly
    from src.telegram.webhook import _cmd_force, SlashCtx
    ctx = SlashCtx(chat_id=1, parts=["/force", "https://github.com/owner/repo"], message_id=None)
    await _cmd_force(ctx)

    assert "github_repo_bundle:owner/repo" in deleted
    assert "github_meta:owner/repo" in deleted
```

- [ ] **Step 2: Run to confirm it fails**

```
pytest tests/test_webhook.py::test_force_repo_deletes_both_redis_cache_keys -v
```
Expected: FAIL

- [ ] **Step 3: Add Redis DEL to `_cmd_force` in `src/telegram/webhook.py`**

In `_cmd_force`, inside the `if existing_job:` block, after `await database.reset_job(job_id)` and before `await queue.enqueue(...)`:

```python
        if pipeline == "repo":
            try:
                from urllib.parse import urlparse as _urlparse
                parts = [s for s in _urlparse(lookup_url).path.split("/") if s]
                owner_r, repo_r = parts[0], parts[1]
                redis_client = queue._client()
                await redis_client.delete(
                    f"github_repo_bundle:{owner_r}/{repo_r}",
                    f"github_meta:{owner_r}/{repo_r}",
                )
                log.info("force.repo_bundle_cache_cleared", owner=owner_r, repo=repo_r)
            except Exception:
                log.warning("force.repo_cache_clear_failed", url=lookup_url)
```

- [ ] **Step 4: Run to confirm it passes**

```
pytest tests/test_webhook.py::test_force_repo_deletes_both_redis_cache_keys -v
```
Expected: PASS

- [ ] **Step 5: Run full webhook tests**

```
pytest tests/test_webhook.py -v --tb=short 2>&1 | tail -20
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "feat(webhook): DEL both repo Redis cache keys on /force (#67)"
```

---

### Task 5: Upgrade `processors/repo.py` to bundle stats message (#67 — Part 4)

**Files:**
- Modify: `src/processors/repo.py`
- Modify: `tests/test_repo_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_repo_pipeline.py` (after existing imports; add `import pytest` and `from unittest.mock import AsyncMock` if missing):

```python
from src.processors.repo import _format_bundle_message, _days_ago, _parse_owner_repo

_BUNDLE = {
    "owner": "anthropics",
    "repo": "claude-code",
    "metadata": {
        "stars": 12_345, "forks": 678, "language": "TypeScript",
        "pushed_at": "2026-01-01T00:00:00Z", "description": "AI tool",
        "archived": False,
    },
    "default_branch": "main",
    "readme": "x" * 200,
    "readme_raw_bytes": 5_000,
    "tree": ["a.py", "b.py", "c.py"],
    "manifests": {"pyproject.toml": "[tool]", "package.json": "{}"},
    "no_readme": False,
}


def test_bundle_message_has_stats() -> None:
    msg = _format_bundle_message("anthropics", "claude-code", _BUNDLE)
    assert "12,345" in msg
    assert "678" in msg
    assert "TypeScript" in msg


def test_bundle_message_has_readme_stats() -> None:
    msg = _format_bundle_message("anthropics", "claude-code", _BUNDLE)
    assert "200 bytes" in msg
    assert "4.9 KB" in msg


def test_bundle_message_has_tree_count() -> None:
    msg = _format_bundle_message("anthropics", "claude-code", _BUNDLE)
    assert "3 files" in msg


def test_bundle_message_has_manifest_list() -> None:
    msg = _format_bundle_message("anthropics", "claude-code", _BUNDLE)
    assert "pyproject.toml" in msg
    assert "package.json" in msg


def test_bundle_message_no_manifests_shows_none() -> None:
    bundle = {**_BUNDLE, "manifests": {}}
    msg = _format_bundle_message("anthropics", "claude-code", bundle)
    assert "none" in msg.lower()


@pytest.mark.asyncio
async def test_run_calls_fetch_repo_bundle(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle_calls: list[tuple] = []

    async def fake_bundle(owner, repo, token):
        bundle_calls.append((owner, repo))
        return _BUNDLE

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", fake_bundle)
    monkeypatch.setattr("src.processors.repo.send_message", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert ("anthropics", "claude-code") in bundle_calls
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_repo_pipeline.py -k "bundle_message or calls_fetch_repo" -v
```
Expected: FAIL

- [ ] **Step 3: Implement in `src/processors/repo.py`**

Replace the entire file content. Key changes:

1. Import `fetch_repo_bundle` from github service.
2. Add `_format_bundle_message(owner, repo, bundle) -> str`.
3. Update `run()` to call `fetch_repo_bundle` and send the bundle stats message.

New file content (preserving `_days_ago` and `_parse_owner_repo`):

```python
"""Repo pipeline processor — full implementation."""
from __future__ import annotations

import asyncio
import json as _json
import re as _re
from datetime import datetime, timezone
from urllib.parse import urlparse

from src import brain, database
from src.config import settings
from src.services import gemini
from src.services.github import fetch_repo_bundle
from src.services.sheets import append_repo_row, update_repo_row
from src.telegram.sender import send_document, send_inline_keyboard, send_message
from src.utils.logger import get_logger

log = get_logger(__name__)


def _parse_owner_repo(url: str) -> tuple[str, str]:
    parts = [s for s in urlparse(url).path.split("/") if s]
    return parts[0], parts[1]


def _days_ago(pushed_at: str | None) -> int:
    if not pushed_at:
        return 0
    try:
        pushed = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - pushed).days
    except Exception:
        return 0


def _normalize_repo_url(url: str) -> str:
    owner, repo = _parse_owner_repo(url)
    return f"https://github.com/{owner}/{repo}"


def _format_bundle_message(owner: str, repo: str, bundle: dict) -> str:
    meta = bundle.get("metadata") or {}
    stars = meta.get("stars", 0)
    forks = meta.get("forks", 0)
    language = meta.get("language") or "Unknown"
    days = _days_ago(meta.get("pushed_at"))
    readme_bytes = len(bundle.get("readme", ""))
    raw_kb = bundle.get("readme_raw_bytes", 0) / 1024
    tree_count = len(bundle.get("tree", []))
    manifests = bundle.get("manifests") or {}
    manifest_list = ", ".join(sorted(manifests.keys())) if manifests else "none"
    repo_url = f"https://github.com/{owner}/{repo}"

    return (
        f"📦 {owner}/{repo}\n"
        f"⭐ {stars:,} | 🔀 {forks:,} | 💻 {language} | 📅 {days} days ago\n"
        "\n"
        f"📄 README: {readme_bytes} bytes ({raw_kb:.1f} KB raw)\n"
        f"🗂  Tree: {tree_count} files\n"
        f"📦 Manifests: {manifest_list}\n"
        "\n"
        "🚧 Gemini analysis coming soon.\n"
        "\n"
        f"🔗 {repo_url}"
    )


async def run(job: dict) -> None:
    job_id = job["id"]
    chat_id = job["chat_id"]
    url = job["url"]

    await database.update_job_status(job_id, "processing")
    owner, repo = _parse_owner_repo(url)

    bundle = await fetch_repo_bundle(owner, repo, settings.GITHUB_TOKEN)
    msg = _format_bundle_message(owner, repo, bundle)
    await send_message(chat_id, msg)

    await database.update_job_status(job_id, "done")
    log.info("repo_bundle_sent", job_id=job_id, repo=f"{owner}/{repo}")
```

(This temporarily skips Gemini/doc/Sheets/brain — each subsequent task layers those in.)

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_repo_pipeline.py -v
```
Expected: all PASS (old stub tests can be deleted — they test `_format_stub_message` which no longer exists)

- [ ] **Step 5: Commit**

```bash
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): upgrade stub to bundle-stats message via fetch_repo_bundle (#67)"
```

---

### Task 6: `REPO_ANALYSIS_SCHEMA` + `_build_repo_prompt` (#68 — Part 1)

**Files:**
- Modify: `src/processors/repo.py`
- Modify: `tests/test_repo_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_repo_pipeline.py`:

```python
from src.processors.repo import REPO_ANALYSIS_SCHEMA, _build_repo_prompt


def test_repo_analysis_schema_has_all_top_level_keys() -> None:
    props = REPO_ANALYSIS_SCHEMA.get("properties", {})
    for key in ("title", "tagline", "tech_stack", "for_developers", "for_education"):
        assert key in props, f"missing key: {key}"


def test_repo_analysis_schema_curriculum_hooks_fields() -> None:
    hooks = (
        REPO_ANALYSIS_SCHEMA["properties"]["for_education"]["properties"]
        ["curriculum_hooks"]["items"]["properties"]
    )
    assert "concept" in hooks
    assert "file_pointer" in hooks
    assert "why" in hooks


def test_build_repo_prompt_contains_metadata() -> None:
    prompt = _build_repo_prompt(_BUNDLE)
    assert "anthropics" in prompt or "claude-code" in prompt
    assert "12,345" in prompt or "TypeScript" in prompt


def test_build_repo_prompt_contains_tree_and_manifests() -> None:
    prompt = _build_repo_prompt(_BUNDLE)
    assert "pyproject.toml" in prompt
    assert "a.py" in prompt or "file tree" in prompt.lower()


def test_build_repo_prompt_freestyle_substitutes_focus() -> None:
    prompt = _build_repo_prompt(_BUNDLE, freestyle_prompt="explain for a Rust developer")
    assert "Rust developer" in prompt


def test_build_repo_prompt_no_readme_flag_adjusts_instructions() -> None:
    bundle = {**_BUNDLE, "no_readme": True, "readme": ""}
    prompt = _build_repo_prompt(bundle, flags={"no_readme": True})
    lower = prompt.lower()
    assert "no readme" in lower or "tree" in lower or "manifest" in lower
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_repo_pipeline.py -k "schema or build_repo_prompt" -v
```
Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement in `src/processors/repo.py`**

Add after `_format_bundle_message`:

```python
# ---------------------------------------------------------------------------
# Gemini schema + prompt builder (#68)
# ---------------------------------------------------------------------------

REPO_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "tagline": {"type": "string"},
        "tech_stack": {"type": "array", "items": {"type": "string"}},
        "for_developers": {
            "type": "object",
            "properties": {
                "project_ideas": {"type": "array", "items": {"type": "string"}},
                "when_to_use": {"type": "string"},
                "avoid_when": {"type": "string"},
            },
            "required": ["project_ideas", "when_to_use", "avoid_when"],
        },
        "for_education": {
            "type": "object",
            "properties": {
                "concepts_taught": {"type": "array", "items": {"type": "string"}},
                "prerequisites": {"type": "array", "items": {"type": "string"}},
                "curriculum_hooks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "concept": {"type": "string"},
                            "file_pointer": {"type": ["string", "null"]},
                            "why": {"type": "string"},
                        },
                        "required": ["concept", "file_pointer", "why"],
                    },
                },
            },
            "required": ["concepts_taught", "prerequisites", "curriculum_hooks"],
        },
    },
    "required": ["title", "tagline", "tech_stack", "for_developers", "for_education"],
}


def _build_repo_prompt(
    bundle: dict,
    freestyle_prompt: str | None = None,
    flags: dict | None = None,
) -> str:
    owner = bundle.get("owner", "")
    repo = bundle.get("repo", "")
    meta = bundle.get("metadata") or {}
    no_readme = (flags or {}).get("no_readme", bundle.get("no_readme", False))
    tree = bundle.get("tree", [])
    manifests = bundle.get("manifests") or {}
    readme = bundle.get("readme", "")

    system_frame = (
        "You are a technical analyst evaluating open-source repositories for "
        "developer utility and educational value. Be specific, concise, and opinionated."
    )

    meta_block = (
        f"Repository: {owner}/{repo}\n"
        f"Stars: {meta.get('stars', 0):,} | Forks: {meta.get('forks', 0):,} | "
        f"Language: {meta.get('language') or 'Unknown'}\n"
        f"Description: {meta.get('description') or '(none)'}\n"
    )
    if meta.get("archived"):
        meta_block += "⚠️ This repository is ARCHIVED.\n"

    tree_sample = tree[:200]
    tree_block = "File tree:\n" + "\n".join(f"  {p}" for p in tree_sample)

    if manifests:
        manifest_block = "Package manifests:\n" + "\n\n".join(
            f"--- {p} ---\n{c[:2_000]}" for p, c in manifests.items()
        )
    else:
        manifest_block = "Package manifests: (none detected)"

    if no_readme:
        readme_block = (
            "README: (not available — no README in this repository)\n"
            "Instruction: lean on the file tree and manifests for analysis. "
            "Flag in the tagline that no README was found."
        )
    else:
        readme_block = f"README (preprocessed):\n{readme[:10_000]}"

    if freestyle_prompt:
        focus_block = f"User instruction: {freestyle_prompt}\nAnswer using the repository context above."
    else:
        focus_block = (
            "Extract a structured analysis matching the JSON schema. "
            "Be specific about developer use-cases and educational concepts."
        )

    return "\n\n".join([system_frame, meta_block, tree_block, manifest_block, readme_block, focus_block])
```

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_repo_pipeline.py -k "schema or build_repo_prompt" -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): REPO_ANALYSIS_SCHEMA + _build_repo_prompt (#68)"
```

---

### Task 7: Gemini call + DB persistence + summary message + Freestyle button (#68 — Part 2)

**Files:**
- Modify: `src/processors/repo.py`
- Modify: `tests/test_repo_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_repo_pipeline.py`:

```python
_ANALYSIS = {
    "title": "anthropics/claude-code",
    "tagline": "AI coding assistant for the terminal",
    "tech_stack": ["TypeScript", "Node.js"],
    "for_developers": {
        "project_ideas": ["Build custom AI workflows", "Extend with plugins"],
        "when_to_use": "When you need AI assistance in the terminal",
        "avoid_when": "When you need a GUI IDE",
    },
    "for_education": {
        "concepts_taught": ["LLM tool use", "CLI design"],
        "prerequisites": ["TypeScript basics"],
        "curriculum_hooks": [
            {"concept": "Tool calling", "file_pointer": "src/tools/", "why": "Demonstrates LLM tool patterns"},
        ],
    },
}


@pytest.mark.asyncio
async def test_run_calls_gemini_flash_with_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    gemini_calls: list[dict] = []

    async def spy_generate(prompt, *, model, schema=None):
        gemini_calls.append({"model": model, "schema": schema})
        return _json.dumps(_ANALYSIS)

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", spy_generate)
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert len(gemini_calls) == 1
    assert gemini_calls[0]["model"] == "gemini-2.5-flash"
    assert gemini_calls[0]["schema"] is not None


@pytest.mark.asyncio
async def test_run_persists_template_analysis_and_ai_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    updated_kwargs: dict = {}

    async def spy_update(job_id, status, **kwargs):
        updated_kwargs.update(kwargs)

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", spy_update)
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert "template_analysis" in updated_kwargs
    assert updated_kwargs.get("ai_topic") == "AI coding assistant for the terminal"
    assert "ai_objective" in updated_kwargs
    assert "ai_action_points" in updated_kwargs
    assert "ai_tools" in updated_kwargs


@pytest.mark.asyncio
async def test_run_sends_summary_with_freestyle_button(monkeypatch: pytest.MonkeyPatch) -> None:
    keyboard_calls: list[dict] = []

    async def spy_keyboard(chat_id, text, buttons, **kwargs):
        keyboard_calls.append({"text": text, "buttons": buttons})

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", spy_keyboard)
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert len(keyboard_calls) == 1
    text = keyboard_calls[0]["text"]
    assert "AI coding assistant for the terminal" in text
    assert "🛠 For developers" in text
    assert "🎓 For teaching" in text
    btns = keyboard_calls[0]["buttons"]
    flat = [btn for row in btns for btn in row]
    assert any("Freestyle" in b.get("text", "") for b in flat)
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_repo_pipeline.py -k "calls_gemini or persists_template or summary_with_freestyle" -v
```
Expected: FAIL

- [ ] **Step 3: Implement Gemini call, DB persistence, summary + button in `run()`**

Add `_format_summary_message` helper and update `run()` in `src/processors/repo.py`:

```python
def _format_summary_message(owner: str, repo: str, analysis: dict, bundle: dict) -> str:
    meta = bundle.get("metadata") or {}
    stars = meta.get("stars", 0)
    forks = meta.get("forks", 0)
    language = meta.get("language") or "Unknown"
    days = _days_ago(meta.get("pushed_at"))
    tagline = analysis.get("tagline", "")
    repo_url = f"https://github.com/{owner}/{repo}"
    project_ideas = analysis.get("for_developers", {}).get("project_ideas") or []
    first_idea = (project_ideas[0][:80] + "…") if project_ideas else "—"
    concepts = analysis.get("for_education", {}).get("concepts_taught") or []
    hooks = analysis.get("for_education", {}).get("curriculum_hooks") or []
    edu_line = (concepts[0] if concepts else "") + (f" • {hooks[0]['concept']}…" if hooks else "")

    return "\n".join([
        f"📦 {owner}/{repo}",
        tagline,
        "",
        f"⭐ {stars:,} | 🔀 {forks:,} | 💻 {language} | 📅 {days} days ago",
        "",
        "🛠 For developers",
        f"  {first_idea}",
        "",
        "🎓 For teaching",
        f"  {edu_line}",
        "",
        f"🔗 {repo_url}",
    ])


async def run(job: dict) -> None:
    job_id = job["id"]
    chat_id = job["chat_id"]
    url = job["url"]
    freestyle_prompt = job.get("freestyle_prompt")

    await database.update_job_status(job_id, "processing")
    owner, repo = _parse_owner_repo(url)

    bundle = await fetch_repo_bundle(owner, repo, settings.GITHUB_TOKEN)

    flags = {"no_readme": bundle.get("no_readme", False)}
    prompt = _build_repo_prompt(bundle, freestyle_prompt=freestyle_prompt, flags=flags)

    raw = await gemini.generate(prompt, model="gemini-2.5-flash", schema=REPO_ANALYSIS_SCHEMA)
    try:
        analysis = _json.loads(raw)
    except Exception:
        m = _re.search(r"\{[\s\S]*\}", raw)
        analysis = _json.loads(m.group(0)) if m else {}

    await database.update_job_status(
        job_id, "done",
        template_analysis=_json.dumps(analysis),
        title=f"{owner}/{repo}",
        ai_topic=analysis.get("tagline", ""),
        ai_objective=(analysis.get("for_developers") or {}).get("when_to_use", ""),
        ai_action_points=_json.dumps((analysis.get("for_developers") or {}).get("project_ideas", [])),
        ai_tools=_json.dumps(analysis.get("tech_stack", [])),
    )

    summary = _format_summary_message(owner, repo, analysis, bundle)
    freestyle_btn = [[{"text": "✍️ Freestyle", "callback_data": f"freestyle:{job_id}"}]]
    await send_inline_keyboard(chat_id, summary, freestyle_btn)

    log.info("repo_gemini_done", job_id=job_id, repo=f"{owner}/{repo}")
```

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_repo_pipeline.py -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): Gemini analysis + DB persistence + summary + Freestyle button (#68)"
```

---

### Task 8: `render_repo_markdown` + Telegram document delivery (#69)

**Files:**
- Modify: `src/processors/repo.py`
- Modify: `tests/test_repo_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_repo_pipeline.py`:

```python
from src.processors.repo import render_repo_markdown, _sanitize_filename


def test_render_has_all_section_headings() -> None:
    md = render_repo_markdown(_ANALYSIS, _BUNDLE)
    for heading in ("## Tech Stack", "## 🛠 For Developers", "## 🎓 For Education", "### Curriculum Hooks"):
        assert heading in md, f"missing: {heading}"


def test_render_includes_tagline() -> None:
    md = render_repo_markdown(_ANALYSIS, _BUNDLE)
    assert "AI coding assistant for the terminal" in md


def test_render_archived_includes_warning_h2() -> None:
    bundle = {**_BUNDLE, "metadata": {**_BUNDLE["metadata"], "archived": True}}
    assert "## ⚠️ Archived" in render_repo_markdown(_ANALYSIS, bundle)


def test_render_no_readme_includes_info_h2() -> None:
    bundle = {**_BUNDLE, "no_readme": True}
    assert "## ℹ️ No README" in render_repo_markdown(_ANALYSIS, bundle)


def test_render_hook_with_file_pointer_includes_backtick_path() -> None:
    md = render_repo_markdown(_ANALYSIS, _BUNDLE)
    assert "`src/tools/`" in md


def test_render_hook_without_file_pointer_omits_suffix() -> None:
    analysis = {
        **_ANALYSIS,
        "for_education": {**_ANALYSIS["for_education"],
                          "curriculum_hooks": [{"concept": "Async", "file_pointer": None, "why": "Core"}]},
    }
    md = render_repo_markdown(analysis, _BUNDLE)
    assert "Async" in md
    assert "`None`" not in md


def test_render_empty_tech_stack_shows_none_placeholder() -> None:
    analysis = {**_ANALYSIS, "tech_stack": []}
    md = render_repo_markdown(analysis, _BUNDLE)
    assert "_(none)_" in md


def test_sanitize_filename_basic() -> None:
    assert _sanitize_filename("anthropics", "claude-code") == "anthropics-claude-code.md"


def test_sanitize_filename_dot_in_owner() -> None:
    result = _sanitize_filename("golang.org", "go")
    assert result.endswith(".md")
    assert "golang.org" in result or "golang" in result


def test_sanitize_filename_fallback_on_empty() -> None:
    result = _sanitize_filename("", "", job_id="20260101_120000_ABCD")
    assert result == "20260101_120000_ABCD.md"


@pytest.mark.asyncio
async def test_run_sends_document_before_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    call_order: list[str] = []

    async def spy_doc(chat_id, file_bytes, filename, **kw):
        call_order.append("doc")

    async def spy_kbd(chat_id, text, buttons, **kw):
        call_order.append("kbd")

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", spy_doc)
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", spy_kbd)
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert call_order.index("doc") < call_order.index("kbd")


@pytest.mark.asyncio
async def test_run_document_failure_does_not_abort(monkeypatch: pytest.MonkeyPatch) -> None:
    kbd_calls: list = []

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock(side_effect=RuntimeError("blip")))
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard",
                        AsyncMock(side_effect=lambda *a, **kw: kbd_calls.append(1)))
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)   # must not raise

    assert kbd_calls
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_repo_pipeline.py -k "render or sanitize or sends_document or document_failure" -v
```
Expected: FAIL

- [ ] **Step 3: Implement `render_repo_markdown`, `_sanitize_filename`, and document delivery in `run()`**

Add to `src/processors/repo.py`:

```python
def _sanitize_filename(owner: str, repo: str, *, job_id: str = "") -> str:
    raw = f"{owner}-{repo}"
    sanitized = _re.sub(r"[^a-zA-Z0-9 \-_.]", "", raw).strip()[:80]
    return f"{sanitized}.md" if sanitized else f"{job_id}.md"


def render_repo_markdown(analysis: dict, bundle: dict) -> str:
    owner = bundle.get("owner", "")
    repo = bundle.get("repo", "")
    meta = bundle.get("metadata") or {}
    stars = meta.get("stars", 0)
    forks = meta.get("forks", 0)
    language = meta.get("language") or "Unknown"
    days = _days_ago(meta.get("pushed_at"))
    repo_url = f"https://github.com/{owner}/{repo}"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    tagline = analysis.get("tagline", "")
    tech_stack = analysis.get("tech_stack") or []
    for_dev = analysis.get("for_developers") or {}
    for_edu = analysis.get("for_education") or {}

    lines = [
        f"# {owner}/{repo}", "",
        f"> {tagline}", "",
        f"⭐ {stars:,}  🔀 {forks:,}  💻 {language}  📅 {days} days ago", "",
    ]
    if meta.get("archived"):
        lines += ["## ⚠️ Archived — no longer maintained", ""]
    if bundle.get("no_readme"):
        lines += ["## ℹ️ No README detected — analysis is shallower than usual", ""]

    lines += ["## Tech Stack", ""]
    lines += [f"- {t}" for t in tech_stack] or ["_(none)_"]
    lines += ["", "## 🛠 For Developers", "", "### Project Ideas", ""]
    lines += [f"- {i}" for i in (for_dev.get("project_ideas") or [])] or ["_(none)_"]
    lines += ["", "### When to Use", "", for_dev.get("when_to_use", ""), "",
              "### Avoid When", "", for_dev.get("avoid_when", ""), ""]
    lines += ["## 🎓 For Education", "", "### Concepts Taught", ""]
    lines += [f"- {c}" for c in (for_edu.get("concepts_taught") or [])] or ["_(none)_"]
    lines += ["", "### Prerequisites", ""]
    lines += [f"- {p}" for p in (for_edu.get("prerequisites") or [])] or ["_(none)_"]
    lines += ["", "### Curriculum Hooks", ""]
    for hook in (for_edu.get("curriculum_hooks") or []):
        fp = hook.get("file_pointer")
        pointer = f" — `{fp}`" if fp else ""
        lines.append(f"- **{hook.get('concept', '')}**{pointer}")
        lines.append(f"  {hook.get('why', '')}")
    if not (for_edu.get("curriculum_hooks") or []):
        lines.append("_(none)_")

    lines += ["", "---", "", f"🔗 [{repo_url}]({repo_url})", f"_Generated by vig at {timestamp}_"]
    return "\n".join(lines)
```

Update `run()` to add document delivery before summary:

```python
    # Document delivery — before summary; failure is non-fatal
    filename = _sanitize_filename(owner, repo, job_id=job_id)
    try:
        await send_document(chat_id, render_repo_markdown(analysis, bundle).encode(), filename)
    except Exception as exc:
        log.warning("repo_doc_send_failed", job_id=job_id, error=str(exc)[:120])

    # Summary + Freestyle button
    summary = _format_summary_message(owner, repo, analysis, bundle)
    freestyle_btn = [[{"text": "✍️ Freestyle", "callback_data": f"freestyle:{job_id}"}]]
    await send_inline_keyboard(chat_id, summary, freestyle_btn)
```

(Move the DB update call before the document send so status is 'done' before delivery.)

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_repo_pipeline.py -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): render_repo_markdown + Telegram document delivery (#69)"
```

---

### Task 9: Sheets persistence (#70)

**Files:**
- Modify: `src/services/sheets.py`
- Modify: `src/processors/repo.py`
- Modify: `tests/test_sheets.py`
- Modify: `tests/test_repo_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_sheets.py`:

```python
import asyncio
from unittest.mock import patch as _patch

from src.services.sheets import TAB_REPO, append_repo_row, update_repo_row

_SHEETS_JOB = {
    "id": "20260101_120000_ABCD",
    "url": "https://github.com/anthropics/claude-code",
    "sheets_row_id": None,
    "created_at": "2026-01-01T12:00:00Z",
    "status": "done",
}
_SHEETS_ANALYSIS = {
    "title": "anthropics/claude-code",
    "tagline": "AI coding tool",
    "tech_stack": ["TypeScript", "Node.js"],
    "for_developers": {
        "project_ideas": ["Build workflows", "Extend"],
        "when_to_use": "In terminal",
        "avoid_when": "GUI needed",
    },
    "for_education": {
        "concepts_taught": ["LLM tool use"],
        "prerequisites": ["TypeScript"],
        "curriculum_hooks": [
            {"concept": "Tool calling", "file_pointer": "src/", "why": "Patterns"},
            {"concept": "Async", "file_pointer": None, "why": "Core"},
        ],
    },
}
_SHEETS_BUNDLE = {
    "owner": "anthropics", "repo": "claude-code",
    "metadata": {"stars": 100, "forks": 10, "language": "TypeScript",
                 "pushed_at": "2026-01-01T00:00:00Z", "description": "AI", "archived": False},
}


def test_tab_repo_constant() -> None:
    assert TAB_REPO == "Repo Analysis"


@pytest.mark.asyncio
async def test_append_repo_row_produces_20_columns() -> None:
    rows: list[list] = []

    def fake_append(tab, values):
        rows.append(values)
        return 5

    with _patch("src.services.sheets._append_sync", fake_append), \
         _patch("asyncio.to_thread", lambda fn, *a: asyncio.coroutine(lambda: fn(*a))()):
        pass

    async def patched_to_thread(fn, *args):
        return fn(*args)

    with _patch("src.services.sheets._append_sync", fake_append), \
         _patch("asyncio.to_thread", patched_to_thread):
        await append_repo_row(_SHEETS_JOB, _SHEETS_ANALYSIS, _SHEETS_BUNDLE)

    assert rows, "no row appended"
    assert len(rows[0]) == 20


@pytest.mark.asyncio
async def test_append_repo_row_tech_stack_newline_joined() -> None:
    rows: list[list] = []

    async def patched_to_thread(fn, *args):
        return fn(*args)

    with _patch("src.services.sheets._append_sync", lambda t, v: (rows.append(v), 5)[1]), \
         _patch("asyncio.to_thread", patched_to_thread):
        await append_repo_row(_SHEETS_JOB, _SHEETS_ANALYSIS, _SHEETS_BUNDLE)

    tech_col = rows[0][6]  # column index 6
    assert "TypeScript" in tech_col
    assert "Node.js" in tech_col
    assert "\n" in tech_col


@pytest.mark.asyncio
async def test_append_repo_row_curriculum_hooks_serialization() -> None:
    rows: list[list] = []

    async def patched_to_thread(fn, *args):
        return fn(*args)

    with _patch("src.services.sheets._append_sync", lambda t, v: (rows.append(v), 5)[1]), \
         _patch("asyncio.to_thread", patched_to_thread):
        await append_repo_row(_SHEETS_JOB, _SHEETS_ANALYSIS, _SHEETS_BUNDLE)

    hooks_col = rows[0][17]  # column index 17
    assert "Tool calling — src/: Patterns" in hooks_col
    assert "Async: Core" in hooks_col
    assert "file_pointer" not in hooks_col


@pytest.mark.asyncio
async def test_append_repo_row_archived_is_TRUE_FALSE_string() -> None:
    rows: list[list] = []
    bundle = {**_SHEETS_BUNDLE, "metadata": {**_SHEETS_BUNDLE["metadata"], "archived": True}}

    async def patched_to_thread(fn, *args):
        return fn(*args)

    with _patch("src.services.sheets._append_sync", lambda t, v: (rows.append(v), 5)[1]), \
         _patch("asyncio.to_thread", patched_to_thread):
        await append_repo_row(_SHEETS_JOB, _SHEETS_ANALYSIS, bundle)

    assert rows[0][11] == "TRUE"  # archived column


@pytest.mark.asyncio
async def test_append_repo_row_failure_does_not_raise() -> None:
    async def patched_to_thread(fn, *args):
        raise RuntimeError("403 Forbidden")

    with _patch("asyncio.to_thread", patched_to_thread):
        await append_repo_row(_SHEETS_JOB, _SHEETS_ANALYSIS, _SHEETS_BUNDLE)  # must not raise
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_sheets.py -k "repo_row or tab_repo" -v
```
Expected: FAIL

- [ ] **Step 3: Implement in `src/services/sheets.py`**

Add after the existing tab constants:

```python
TAB_REPO = "Repo Analysis"


def _repo_row(job: dict, analysis: dict, bundle: dict) -> list:
    owner = bundle.get("owner", "")
    repo = bundle.get("repo", "")
    meta = bundle.get("metadata") or {}
    for_dev = analysis.get("for_developers") or {}
    for_edu = analysis.get("for_education") or {}

    def join_list(items: list) -> str:
        return "\n".join(str(x) for x in items) if items else ""

    def hooks_str(hooks: list) -> str:
        parts = []
        for h in hooks:
            fp = h.get("file_pointer")
            fp_part = f" — {fp}" if fp else ""
            parts.append(f"{h.get('concept', '')}{fp_part}: {h.get('why', '')}")
        return "\n".join(parts)

    return [
        job.get("id", ""),
        job.get("url", ""),
        owner,
        repo,
        analysis.get("title", f"{owner}/{repo}"),
        analysis.get("tagline", ""),
        join_list(analysis.get("tech_stack") or []),
        meta.get("stars", ""),
        meta.get("forks", ""),
        meta.get("language") or "",
        meta.get("pushed_at") or "",
        "TRUE" if meta.get("archived") else "FALSE",
        join_list(for_dev.get("project_ideas") or []),
        for_dev.get("when_to_use", ""),
        for_dev.get("avoid_when", ""),
        join_list(for_edu.get("concepts_taught") or []),
        join_list(for_edu.get("prerequisites") or []),
        hooks_str(for_edu.get("curriculum_hooks") or []),
        job.get("created_at", ""),
        job.get("status", ""),
    ]


async def append_repo_row(job: dict, analysis: dict, bundle: dict) -> int | None:
    """Append one row to 'Repo Analysis' tab and return the 1-based row index."""
    row = _repo_row(job, analysis, bundle)
    try:
        row_idx = await asyncio.to_thread(_append_sync, TAB_REPO, row)
        log.info("sheets_repo_appended", job_id=job.get("id"), row_idx=row_idx)
        return row_idx
    except Exception:
        log.exception("sheets_repo_failed", job_id=job.get("id"))
        return None


async def update_repo_row(row_idx: int, job: dict, analysis: dict, bundle: dict) -> None:
    """Overwrite the Repo Analysis row at row_idx (1-based) in-place."""
    row = _repo_row(job, analysis, bundle)
    try:
        await asyncio.to_thread(_update_sync, TAB_REPO, row_idx, row)
        log.info("sheets_repo_updated", job_id=job.get("id"), row_idx=row_idx)
    except Exception:
        log.exception("sheets_repo_update_failed", job_id=job.get("id"))
```

Then add fire-and-forget Sheets calls in `run()` in `src/processors/repo.py`:

```python
async def _sheets_append_safe(job_id: str, job: dict, analysis: dict, bundle: dict) -> None:
    try:
        row_idx = await append_repo_row(job, analysis, bundle)
        if row_idx is not None:
            await database.update_job_status(job_id, "done", sheets_row_id=str(row_idx))
    except Exception as exc:
        log.warning("repo_sheets_append_failed", job_id=job_id, error=str(exc)[:120])


async def _sheets_update_safe(row_idx: int, job: dict, analysis: dict, bundle: dict) -> None:
    try:
        await update_repo_row(row_idx, job, analysis, bundle)
    except Exception as exc:
        log.warning("repo_sheets_update_failed", job_id=job.get("id"), error=str(exc)[:120])
```

Add to `run()` after `send_inline_keyboard`:

```python
    # Sheets — fire-and-forget
    current_job = {"id": job_id, "url": url, "created_at": job.get("created_at", ""), "status": "done"}
    sheets_row_id = job.get("sheets_row_id")
    if sheets_row_id:
        asyncio.create_task(_sheets_update_safe(int(sheets_row_id), current_job, analysis, bundle))
    else:
        asyncio.create_task(_sheets_append_safe(job_id, current_job, analysis, bundle))
```

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_sheets.py -k "repo_row or tab_repo" -v
pytest tests/test_repo_pipeline.py -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/sheets.py src/processors/repo.py tests/test_sheets.py tests/test_repo_pipeline.py
git commit -m "feat(repo): Sheets persistence — append_repo_row + update_repo_row, fire-and-forget (#70)"
```

---

### Task 10: Second Brain ingest (#71)

**Files:**
- Modify: `src/processors/repo.py`
- Modify: `tests/test_repo_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_repo_pipeline.py`:

```python
@pytest.mark.asyncio
async def test_run_ingests_normalized_repo_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """brain.ingest_links called with exactly the root repo URL (no subpaths)."""
    ingest_calls: list[dict] = []

    async def fake_ingest(links, topic, source_job_id):
        ingest_calls.append({"links": links, "topic": topic, "source_job_id": source_job_id})

    tasks_run: list = []

    async def eager_create_task(coro):
        tasks_run.append(1)
        return await coro

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")
    monkeypatch.setattr("src.processors.repo.brain.ingest_links", fake_ingest)
    monkeypatch.setattr("asyncio.create_task", eager_create_task)

    # URL with subpath — should be normalized
    job = {"id": "abc", "chat_id": 1,
           "url": "https://github.com/anthropics/claude-code/blob/main/README.md",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    brain_calls = [c for c in ingest_calls]
    assert len(brain_calls) == 1
    assert brain_calls[0]["links"][0]["url"] == "https://github.com/anthropics/claude-code"
    assert brain_calls[0]["topic"] == _ANALYSIS["tagline"]
    assert brain_calls[0]["source_job_id"] == "abc"


@pytest.mark.asyncio
async def test_run_brain_failure_leaves_job_done(monkeypatch: pytest.MonkeyPatch) -> None:
    statuses: list[str] = []

    async def failing_ingest(links, topic, source_job_id):
        raise RuntimeError("embed failed")

    async def track_status(job_id, status, **kwargs):
        statuses.append(status)

    async def eager_create_task(coro):
        try:
            await coro
        except Exception:
            pass

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", track_status)
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")
    monkeypatch.setattr("src.processors.repo.brain.ingest_links", failing_ingest)
    monkeypatch.setattr("asyncio.create_task", eager_create_task)

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert "done" in statuses
    assert "error" not in statuses
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_repo_pipeline.py -k "ingests_normalized or brain_failure_leaves" -v
```
Expected: FAIL

- [ ] **Step 3: Add brain ingest to `run()` in `src/processors/repo.py`**

Add helper:

```python
async def _brain_ingest_safe(repo_url: str, *, topic: str, source_job_id: str) -> None:
    try:
        # README body hyperlinks are NOT ingested per spec §Design Decisions #19
        await brain.ingest_links([{"url": repo_url}], topic=topic, source_job_id=source_job_id)
        log.info("repo_brain_ingested", url=repo_url)
    except Exception as exc:
        log.warning("repo_brain_ingest_failed", url=repo_url, error=str(exc)[:120])
```

Add at end of `run()` (after Sheets `create_task`):

```python
    # Brain ingest — fire-and-forget
    asyncio.create_task(_brain_ingest_safe(
        _normalize_repo_url(url),
        topic=analysis.get("tagline", ""),
        source_job_id=job_id,
    ))
```

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_repo_pipeline.py -k "ingests_normalized or brain_failure_leaves" -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): Second Brain ingest — normalized URL, fire-and-forget (#71)"
```

---

### Task 11: Edge cases — archived, no-README, GitHub API failures, GeminiUnavailableError (#72)

**Files:**
- Modify: `src/processors/repo.py`
- Modify: `tests/test_repo_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_repo_pipeline.py`:

```python
from src.services.gemini import GeminiUnavailableError


@pytest.mark.asyncio
async def test_run_archived_repo_warning_in_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    archived_bundle = {**_BUNDLE, "metadata": {**_BUNDLE["metadata"], "archived": True}}
    texts: list[str] = []

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=archived_bundle))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard",
                        AsyncMock(side_effect=lambda c, t, b, **kw: texts.append(t)))
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)
    assert any("⚠️ Archived" in t for t in texts)


@pytest.mark.asyncio
async def test_run_no_readme_warning_in_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    no_readme_bundle = {**_BUNDLE, "no_readme": True, "readme": ""}
    texts: list[str] = []

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=no_readme_bundle))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard",
                        AsyncMock(side_effect=lambda c, t, b, **kw: texts.append(t)))
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)
    assert any("ℹ️ No README" in t for t in texts)


@pytest.mark.asyncio
async def test_run_github_404_error_path(monkeypatch: pytest.MonkeyPatch) -> None:
    statuses: list[str] = []
    user_messages: list[str] = []

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle",
                        AsyncMock(side_effect=FileNotFoundError("not found")))
    monkeypatch.setattr("src.processors.repo.database.update_job_status",
                        AsyncMock(side_effect=lambda jid, s, **kw: statuses.append(s)))
    monkeypatch.setattr("src.processors.repo.send_message",
                        AsyncMock(side_effect=lambda c, t, **kw: user_messages.append(t)))
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert "error" in statuses
    assert any("check the URL" in m or "not found" in m.lower() for m in user_messages)


@pytest.mark.asyncio
async def test_run_gemini_unavailable_error_path(monkeypatch: pytest.MonkeyPatch) -> None:
    statuses: list[str] = []
    user_messages: list[str] = []

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate",
                        AsyncMock(side_effect=GeminiUnavailableError("both keys failed")))
    monkeypatch.setattr("src.processors.repo.database.update_job_status",
                        AsyncMock(side_effect=lambda jid, s, **kw: statuses.append(s)))
    monkeypatch.setattr("src.processors.repo.send_message",
                        AsyncMock(side_effect=lambda c, t, **kw: user_messages.append(t)))
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert "error" in statuses
    assert any("Gemini" in m or "/force" in m for m in user_messages)


@pytest.mark.asyncio
async def test_run_rate_limit_403_shows_rate_limit_message(monkeypatch: pytest.MonkeyPatch) -> None:
    user_messages: list[str] = []

    class FakeHTTPError(Exception):
        class response:
            status_code = 403
            headers = {"X-RateLimit-Remaining": "0"}

    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle",
                        AsyncMock(side_effect=FakeHTTPError()))
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_message",
                        AsyncMock(side_effect=lambda c, t, **kw: user_messages.append(t)))
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert any("limit" in m.lower() or "hour" in m.lower() for m in user_messages)
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_repo_pipeline.py -k "archived_repo or no_readme_warning or github_404 or gemini_unavail or rate_limit" -v
```
Expected: FAIL

- [ ] **Step 3: Implement error handling + archived/no-README warnings in `run()`**

Add `_classify_github_error` and `GeminiUnavailableError` import to `src/processors/repo.py`:

```python
from src.services.gemini import GeminiUnavailableError


def _classify_github_error(exc: Exception) -> str:
    """Map a GitHub API exception to a user-visible message."""
    if isinstance(exc, FileNotFoundError):
        return "Repo not found or private — check the URL."
    status = getattr(getattr(exc, "response", None), "status_code", None)
    headers = getattr(getattr(exc, "response", None), "headers", {}) or {}
    if status == 403 and str(headers.get("X-RateLimit-Remaining", "1")) == "0":
        return "GitHub API limit hit, try again in an hour."
    if status in (401, 403):
        return "GitHub authentication failed — check GITHUB_TOKEN."
    if status == 404:
        return "Repo not found or private — check the URL."
    return "GitHub unavailable, retry."
```

Update `run()` to wrap `fetch_repo_bundle` and `gemini.generate` in try/except, and prepend warning lines to the summary for archived / no-README bundles:

```python
async def run(job: dict) -> None:
    job_id = job["id"]
    chat_id = job["chat_id"]
    url = job["url"]
    freestyle_prompt = job.get("freestyle_prompt")

    await database.update_job_status(job_id, "processing")
    owner, repo = _parse_owner_repo(url)

    try:
        bundle = await fetch_repo_bundle(owner, repo, settings.GITHUB_TOKEN)
    except Exception as exc:
        log.warning("repo_github_error", job_id=job_id, error=str(exc)[:120])
        await database.update_job_status(job_id, "error", error_msg=str(exc)[:200])
        await send_message(chat_id, f"❌ {_classify_github_error(exc)}")
        return

    flags = {"no_readme": bundle.get("no_readme", False)}
    prompt = _build_repo_prompt(bundle, freestyle_prompt=freestyle_prompt, flags=flags)

    try:
        raw = await gemini.generate(prompt, model="gemini-2.5-flash", schema=REPO_ANALYSIS_SCHEMA)
    except GeminiUnavailableError as exc:
        log.error("repo_gemini_failed", job_id=job_id)
        await database.update_job_status(job_id, "error", error_msg=str(exc)[:200])
        await send_message(chat_id, "❌ Gemini unavailable, try /force later.")
        return

    try:
        analysis = _json.loads(raw)
    except Exception:
        m = _re.search(r"\{[\s\S]*\}", raw)
        analysis = _json.loads(m.group(0)) if m else {}

    await database.update_job_status(
        job_id, "done",
        template_analysis=_json.dumps(analysis),
        title=f"{owner}/{repo}",
        ai_topic=analysis.get("tagline", ""),
        ai_objective=(analysis.get("for_developers") or {}).get("when_to_use", ""),
        ai_action_points=_json.dumps((analysis.get("for_developers") or {}).get("project_ideas", [])),
        ai_tools=_json.dumps(analysis.get("tech_stack", [])),
    )

    # Warning prefix lines for archived / no-README
    warning_lines: list[str] = []
    meta = bundle.get("metadata") or {}
    if meta.get("archived"):
        warning_lines.append("⚠️ Archived — no longer maintained")
    if bundle.get("no_readme"):
        warning_lines.append("ℹ️ No README detected — analysis is shallower than usual")

    # Document (non-fatal)
    filename = _sanitize_filename(owner, repo, job_id=job_id)
    try:
        await send_document(chat_id, render_repo_markdown(analysis, bundle).encode(), filename)
    except Exception as exc:
        log.warning("repo_doc_send_failed", job_id=job_id, error=str(exc)[:120])

    # Summary + Freestyle button
    prefix = "\n".join(warning_lines) + "\n\n" if warning_lines else ""
    summary = prefix + _format_summary_message(owner, repo, analysis, bundle)
    freestyle_btn = [[{"text": "✍️ Freestyle", "callback_data": f"freestyle:{job_id}"}]]
    await send_inline_keyboard(chat_id, summary, freestyle_btn)

    # Sheets — fire-and-forget
    current_job = {"id": job_id, "url": url, "created_at": job.get("created_at", ""), "status": "done"}
    sheets_row_id = job.get("sheets_row_id")
    if sheets_row_id:
        asyncio.create_task(_sheets_update_safe(int(sheets_row_id), current_job, analysis, bundle))
    else:
        asyncio.create_task(_sheets_append_safe(job_id, current_job, analysis, bundle))

    # Brain ingest — fire-and-forget
    asyncio.create_task(_brain_ingest_safe(
        _normalize_repo_url(url), topic=analysis.get("tagline", ""), source_job_id=job_id,
    ))

    log.info("repo_pipeline_done", job_id=job_id, repo=f"{owner}/{repo}")
```

- [ ] **Step 4: Run to confirm they pass**

```
pytest tests/test_repo_pipeline.py -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): edge cases — archived, no-README, API errors, Gemini fallback (#72)"
```

---

### Task 12: Freestyle re-run verification (#73)

**Files:**
- Modify: `tests/test_repo_pipeline.py`

The `run()` implementation from Task 11 already handles the freestyle path:
- `freestyle_prompt` → passed to `_build_repo_prompt`
- `sheets_row_id is not None` → routes to `_sheets_update_safe` (not `_sheets_append_safe`)

This task writes tests to prove that explicitly, then runs the full suite.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_repo_pipeline.py`:

```python
@pytest.mark.asyncio
async def test_freestyle_prompt_passed_to_build_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    """freestyle_prompt is forwarded to _build_repo_prompt."""
    prompts_seen: list[str | None] = []
    original_build = None

    import src.processors.repo as repo_mod
    original = repo_mod._build_repo_prompt

    def spy_build(bundle, freestyle_prompt=None, flags=None):
        prompts_seen.append(freestyle_prompt)
        return original(bundle, freestyle_prompt=freestyle_prompt, flags=flags)

    monkeypatch.setattr("src.processors.repo._build_repo_prompt", spy_build)
    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": "explain for a Rust developer",
           "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert prompts_seen and prompts_seen[0] == "explain for a Rust developer"


@pytest.mark.asyncio
async def test_freestyle_with_sheets_row_id_calls_update_not_append(monkeypatch: pytest.MonkeyPatch) -> None:
    """With sheets_row_id set, _sheets_update_safe is called; _sheets_append_safe is not."""
    update_calls: list = []
    append_calls: list = []

    async def fake_update_safe(row_idx, job, analysis, bundle):
        update_calls.append(row_idx)

    async def fake_append_safe(job_id, job, analysis, bundle):
        append_calls.append(job_id)

    import src.processors.repo as repo_mod
    monkeypatch.setattr(repo_mod, "_sheets_update_safe", fake_update_safe)
    monkeypatch.setattr(repo_mod, "_sheets_append_safe", fake_append_safe)
    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    # Immediately run tasks in-place so we can assert
    monkeypatch.setattr("asyncio.create_task", lambda coro: None)

    # We need to call the actual Sheets path directly — patch create_task to run coros
    import asyncio as _asyncio
    async def eager_create_task(coro):
        await coro

    monkeypatch.setattr("asyncio.create_task", eager_create_task)

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": "explain for a Rust developer",
           "template_analysis": _json.dumps(_ANALYSIS), "sheets_row_id": "5"}
    from src.processors.repo import run
    await run(job)

    assert update_calls == [5]
    assert not append_calls


@pytest.mark.asyncio
async def test_fresh_job_calls_append_not_update(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without sheets_row_id, _sheets_append_safe is called; _sheets_update_safe is not."""
    update_calls: list = []
    append_calls: list = []

    async def fake_update_safe(row_idx, job, analysis, bundle):
        update_calls.append(row_idx)

    async def fake_append_safe(job_id, job, analysis, bundle):
        append_calls.append(job_id)

    import src.processors.repo as repo_mod
    monkeypatch.setattr(repo_mod, "_sheets_update_safe", fake_update_safe)
    monkeypatch.setattr(repo_mod, "_sheets_append_safe", fake_append_safe)
    monkeypatch.setattr("src.processors.repo.fetch_repo_bundle", AsyncMock(return_value=_BUNDLE))
    monkeypatch.setattr("src.processors.repo.gemini.generate", AsyncMock(return_value=_json.dumps(_ANALYSIS)))
    monkeypatch.setattr("src.processors.repo.send_document", AsyncMock())
    monkeypatch.setattr("src.processors.repo.send_inline_keyboard", AsyncMock())
    monkeypatch.setattr("src.processors.repo.database.update_job_status", AsyncMock())
    monkeypatch.setattr("src.processors.repo.settings.GITHUB_TOKEN", "tok")

    import asyncio as _asyncio
    async def eager_create_task(coro):
        await coro
    monkeypatch.setattr("asyncio.create_task", eager_create_task)

    job = {"id": "abc", "chat_id": 1, "url": "https://github.com/anthropics/claude-code",
           "freestyle_prompt": None, "template_analysis": None, "sheets_row_id": None}
    from src.processors.repo import run
    await run(job)

    assert append_calls == ["abc"]
    assert not update_calls
```

- [ ] **Step 2: Run to confirm they fail (or pass immediately if Task 11 was complete)**

```
pytest tests/test_repo_pipeline.py -k "freestyle_prompt_passed or sheets_row_id_calls_update or fresh_job_calls_append" -v
```
Expected: PASS (Task 11 already implemented the routing)

If any FAIL, adjust `run()` until all three pass.

- [ ] **Step 3: Run the complete test suite**

```
pytest tests/ -v --tb=short 2>&1 | tail -40
```
Expected: all PASS — no regressions

- [ ] **Step 4: Commit**

```bash
git add tests/test_repo_pipeline.py
git commit -m "test(repo): verify freestyle re-run — prompt forwarding, update vs append routing (#73)"
```

---

## Final checks before PR

- [ ] `pytest tests/ -v` — all green
- [ ] `git log --oneline -15` — 12 commits, one per task
- [ ] Open PR against `repo-pipeline` branch:

```bash
git push -u origin repo-pipeline
gh pr create \
  --title "feat(repo): full repo pipeline #2–#8 (issues #67–#73)" \
  --body "Closes #67, #68, #69, #70, #71, #72, #73

## What ships
- GitHub bundle fetch (README, tree, manifests) with 7-day Redis cache
- /force extended to DEL both repo Redis cache keys
- Gemini 2.5 Flash analysis with structured JSON schema
- DB migration v6→v7 for 'repo' content_type
- Telegram document delivery (<owner>-<repo>.md) + summary with Freestyle button
- Sheets persistence (Repo Analysis tab, append on first run / update on freestyle)
- Second Brain ingest (normalized repo URL, fire-and-forget)
- Edge cases: archived, no-README, GitHub 404/403/5xx, GeminiUnavailableError
- Freestyle re-run: cache hit, update in place, same job_id

## Test plan
- [ ] \`pytest tests/ -v\` passes
- [ ] Manual: paste a real repo URL, receive .md document + summary + Freestyle button
- [ ] Manual: paste again, observe bundle cache-hit logs
- [ ] Manual: run \`/force <url>\`, paste again, observe cold-cache fetch
- [ ] Manual: tap Freestyle, send prompt, receive fresh re-analysis; verify Sheets row updated in place
- [ ] Manual: \`/find <tagline-keyword>\` returns the repo after ingest"
```
