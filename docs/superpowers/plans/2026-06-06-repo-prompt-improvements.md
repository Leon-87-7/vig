# Repo Prompt Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven weaknesses in `_build_repo_prompt` identified by comparing the Gemini output for `run-llama/liteparse` against the actual repo — the Astro hallucination being the sharpest failure.

**Architecture:** Three self-contained tasks. Task 1 touches only the GitHub service layer (`github.py`) to surface topics and bump the bundle cache key. Tasks 2 and 3 touch only the repo processor (`repo.py`) — a new `_prioritize_tree` helper and a full rewrite of the prompt sections inside `_build_repo_prompt`. No schema, database, or Telegram changes.

**Tech Stack:** Python, pytest, unittest.mock

---

## File Map

| File | Change |
|---|---|
| `src/services/github.py` | Add `topics` to `_fetch_bundle_meta_sync`; bump bundle cache key to `v2` |
| `src/processors/repo.py` | Add `_prioritize_tree`; rewrite `_build_repo_prompt` (system_frame, constraints_block, meta_block topics, README cap removal, manifest cap, star calibration) |
| `tests/test_github.py` | Tests for topics field and v2 cache key |
| `tests/test_repo_pipeline.py` | Tests for `_prioritize_tree`; tests for each `_build_repo_prompt` change |

---

## Task 1: github.py — topics field + cache key bump

**Files:**
- Modify: `src/services/github.py` — `_fetch_bundle_meta_sync` (line 108), `fetch_repo_bundle` (line 128)
- Modify: `tests/test_github.py`

**Background:** `_fetch_bundle_meta_sync` fetches repo metadata from the GitHub API and returns a dict. It currently drops `topics` even though the API returns them. The dict is stored directly as `bundle["metadata"]`, so adding the field here makes it available everywhere. The bundle is cached in Redis under `github_repo_bundle:{owner}/{repo}` with a 7-day TTL — existing cached entries won't have topics, so we bump the key to `github_repo_bundle:v2:{owner}/{repo}` to force a cache miss.

- [ ] **Step 1: Write failing test — `_fetch_bundle_meta_sync` returns topics**

Add to `tests/test_github.py`:

```python
from unittest.mock import MagicMock, patch
from src.services.github import _fetch_bundle_meta_sync


def test_fetch_bundle_meta_sync_includes_topics() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "stargazers_count": 100,
        "forks_count": 10,
        "language": "Python",
        "pushed_at": "2026-01-01T00:00:00Z",
        "description": "A repo",
        "archived": False,
        "default_branch": "main",
        "topics": ["machine-learning", "nlp"],
    }

    with patch("src.services.github.requests.get", return_value=mock_resp):
        result = _fetch_bundle_meta_sync("owner", "repo", token=None)

    assert result is not None
    assert result["topics"] == ["machine-learning", "nlp"]


def test_fetch_bundle_meta_sync_topics_defaults_to_empty_list() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "stargazers_count": 5,
        "forks_count": 0,
        "language": None,
        "pushed_at": None,
        "description": None,
        "archived": False,
        "default_branch": "main",
        # no "topics" key
    }

    with patch("src.services.github.requests.get", return_value=mock_resp):
        result = _fetch_bundle_meta_sync("owner", "repo", token=None)

    assert result is not None
    assert result["topics"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

```
pytest tests/test_github.py::test_fetch_bundle_meta_sync_includes_topics tests/test_github.py::test_fetch_bundle_meta_sync_topics_defaults_to_empty_list -v
```

Expected: FAIL — `KeyError: 'topics'` or `AssertionError`

- [ ] **Step 3: Add `topics` to `_fetch_bundle_meta_sync`**

In `src/services/github.py`, update the return dict in `_fetch_bundle_meta_sync` (around line 117):

```python
    return {
        "stars": data["stargazers_count"],
        "forks": data["forks_count"],
        "language": data.get("language"),
        "pushed_at": data.get("pushed_at"),
        "description": data.get("description"),
        "archived": data.get("archived", False),
        "default_branch": data.get("default_branch", "main"),
        "topics": data.get("topics") or [],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```
pytest tests/test_github.py::test_fetch_bundle_meta_sync_includes_topics tests/test_github.py::test_fetch_bundle_meta_sync_topics_defaults_to_empty_list -v
```

Expected: PASS

- [ ] **Step 5: Write failing test — cache key uses v2 prefix**

Add to `tests/test_github.py`:

```python
@pytest.mark.asyncio
async def test_fetch_repo_bundle_uses_v2_cache_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """A bundle pre-seeded under the v2 key must be returned as a cache hit."""
    fake_redis = FakeRedis()
    bundle_data = {
        "owner": "owner", "repo": "repo",
        "metadata": {"stars": 1, "forks": 0, "language": None,
                     "pushed_at": None, "description": None,
                     "archived": False, "topics": []},
        "default_branch": "main", "readme": "", "readme_raw_bytes": 0,
        "tree": [], "manifests": {}, "no_readme": True,
    }
    fake_redis._store["github_repo_bundle:v2:owner/repo"] = json.dumps(bundle_data)

    import src.queue as queue_module
    monkeypatch.setattr(queue_module, "_redis", fake_redis)

    with patch("src.services.github._fetch_bundle_meta_sync") as mock_meta:
        result = await fetch_repo_bundle("owner", "repo", token=None)

    # Cache hit on v2 key — no API call should be made
    mock_meta.assert_not_called()
    assert result["owner"] == "owner"
```

- [ ] **Step 6: Run test to verify it fails**

```
pytest tests/test_github.py::test_fetch_repo_bundle_uses_v2_cache_key -v
```

Expected: FAIL — `mock_meta` IS called (because the key doesn't match yet)

- [ ] **Step 7: Bump the bundle cache key in `fetch_repo_bundle`**

In `src/services/github.py`, change the cache key in `fetch_repo_bundle` (line ~136):

```python
    cache_key = f"github_repo_bundle:v2:{owner}/{repo}"
```

- [ ] **Step 8: Run test to verify it passes**

```
pytest tests/test_github.py::test_fetch_repo_bundle_uses_v2_cache_key -v
```

Expected: PASS

- [ ] **Step 9: Run full github test suite to check for regressions**

```
pytest tests/test_github.py -v
```

Expected: all PASS

- [ ] **Step 10: Commit**

```
git add src/services/github.py tests/test_github.py
git commit -m "feat(github): add topics to bundle metadata and bump cache key to v2"
```

---

## Task 2: repo.py — `_prioritize_tree` helper

**Files:**
- Modify: `src/processors/repo.py`
- Modify: `tests/test_repo_pipeline.py`

**Background:** `_build_repo_prompt` currently samples the file tree with `tree[:200]` — an alphabetical cut. For monorepos, root config files dominate the early slots while important source files deep in subdirectories get dropped. `_prioritize_tree` re-orders paths: source files first, known manifest names second, everything else last. The limit is raised from 200 to 300. The helper lives in `repo.py` (prompt-construction concern, not a data-fetching concern).

- [ ] **Step 1: Write failing tests for `_prioritize_tree`**

Add to `tests/test_repo_pipeline.py` (also add `_prioritize_tree` to the import line at the top):

```python
from src.processors.repo import (
    _format_bundle_message, _days_ago, _parse_owner_repo,
    REPO_ANALYSIS_SCHEMA, _build_repo_prompt, _prioritize_tree,
)


def test_prioritize_tree_source_files_first() -> None:
    tree = ["README.md", "Makefile", "src/main.rs", "src/lib.rs", "LICENSE"]
    result = _prioritize_tree(tree, limit=10)
    # .rs files must come before README.md and Makefile
    rs_indices = [result.index(p) for p in result if p.endswith(".rs")]
    other_indices = [result.index(p) for p in result if not p.endswith(".rs")]
    assert max(rs_indices) < min(other_indices)


def test_prioritize_tree_manifest_files_second() -> None:
    tree = ["LICENSE", "README.md", "Cargo.toml", "src/main.rs"]
    result = _prioritize_tree(tree, limit=10)
    cargo_idx = result.index("Cargo.toml")
    main_idx = result.index("src/main.rs")
    readme_idx = result.index("README.md")
    # source before manifest before rest
    assert main_idx < cargo_idx < readme_idx


def test_prioritize_tree_respects_limit() -> None:
    tree = [f"file_{i}.rs" for i in range(500)]
    result = _prioritize_tree(tree, limit=300)
    assert len(result) == 300


def test_prioritize_tree_empty_tree() -> None:
    assert _prioritize_tree([], limit=300) == []


def test_prioritize_tree_all_source_no_cut() -> None:
    tree = ["a.rs", "b.py", "c.ts"]
    result = _prioritize_tree(tree, limit=300)
    assert set(result) == {"a.rs", "b.py", "c.ts"}
```

- [ ] **Step 2: Run tests to verify they fail**

```
pytest tests/test_repo_pipeline.py::test_prioritize_tree_source_files_first tests/test_repo_pipeline.py::test_prioritize_tree_manifest_files_second tests/test_repo_pipeline.py::test_prioritize_tree_respects_limit tests/test_repo_pipeline.py::test_prioritize_tree_empty_tree tests/test_repo_pipeline.py::test_prioritize_tree_all_source_no_cut -v
```

Expected: FAIL — `ImportError: cannot import name '_prioritize_tree'`

- [ ] **Step 3: Implement `_prioritize_tree` in `repo.py`**

Add after the module-level constants (before `_parse_owner_repo`, around line 24) in `src/processors/repo.py`:

```python
_SOURCE_EXTS = {
    ".rs", ".py", ".ts", ".js", ".go", ".java", ".c", ".cpp", ".h",
    ".rb", ".swift", ".kt", ".cs", ".zig", ".ex", ".exs",
}
_CONFIG_NAMES = {
    "Cargo.toml", "package.json", "pyproject.toml", "go.mod",
    "requirements.txt", "setup.py", "pom.xml", "build.gradle",
    "Gemfile", "mix.exs",
}


def _prioritize_tree(tree: list[str], limit: int = 300) -> list[str]:
    source, config, rest = [], [], []
    for path in tree:
        name = path.rsplit("/", 1)[-1]
        if any(name.endswith(ext) for ext in _SOURCE_EXTS):
            source.append(path)
        elif name in _CONFIG_NAMES:
            config.append(path)
        else:
            rest.append(path)
    return (source + config + rest)[:limit]
```

- [ ] **Step 4: Run tests to verify they pass**

```
pytest tests/test_repo_pipeline.py::test_prioritize_tree_source_files_first tests/test_repo_pipeline.py::test_prioritize_tree_manifest_files_second tests/test_repo_pipeline.py::test_prioritize_tree_respects_limit tests/test_repo_pipeline.py::test_prioritize_tree_empty_tree tests/test_repo_pipeline.py::test_prioritize_tree_all_source_no_cut -v
```

Expected: PASS

- [ ] **Step 5: Wire `_prioritize_tree` into `_build_repo_prompt`**

In `src/processors/repo.py`, in `_build_repo_prompt`, replace:

```python
    tree_sample = tree[:200]
```

with:

```python
    tree_sample = _prioritize_tree(tree, 300)
```

- [ ] **Step 6: Run full repo pipeline tests to check for regressions**

```
pytest tests/test_repo_pipeline.py -v
```

Expected: all PASS

- [ ] **Step 7: Commit**

```
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): add _prioritize_tree — source files first, limit 300"
```

---

## Task 3: repo.py — `_build_repo_prompt` improvements

**Files:**
- Modify: `src/processors/repo.py` — `_build_repo_prompt`
- Modify: `tests/test_repo_pipeline.py`

**Background:** Seven prompt quality issues to fix in one function:
1. **system_frame** — expand with per-field quality guidance (8 fields)
2. **constraints_block** — new named block inserted between meta_block and tree_block with tech_stack and file_pointer grounding rules
3. **topics in meta_block** — surface GitHub topics from `bundle["metadata"]["topics"]`
4. **README cap removed** — drop the redundant `[:10_000]` second cap; `_README_MAX = 50_000` in `github.py` is the only limit. Fix the misleading label `"README (preprocessed):"` → `"README:"`
5. **manifest cap** — raise per-manifest content cap from `2_000` to `4_000` chars
6. **star calibration** — one sentence appended to `focus_block` instructing tone calibration by star count
7. **join order** — add `constraints_block` to the join list between `meta_block` and `tree_block`

- [ ] **Step 1: Write failing tests for all prompt changes**

Add to `tests/test_repo_pipeline.py`:

```python
_BUNDLE_WITH_TOPICS = {
    **_BUNDLE,
    "metadata": {
        **_BUNDLE["metadata"],
        "topics": ["pdf", "ocr", "rust"],
    },
}

_BUNDLE_LONG_README = {
    **_BUNDLE,
    "readme": "x" * 25_000,
}

_BUNDLE_LONG_MANIFEST = {
    **_BUNDLE,
    "manifests": {"Cargo.toml": "a" * 5_000},
}


def test_prompt_contains_topics() -> None:
    prompt = _build_repo_prompt(_BUNDLE_WITH_TOPICS)
    assert "pdf" in prompt
    assert "ocr" in prompt
    assert "rust" in prompt


def test_prompt_omits_topics_line_when_empty() -> None:
    bundle = {**_BUNDLE, "metadata": {**_BUNDLE["metadata"], "topics": []}}
    prompt = _build_repo_prompt(bundle)
    assert "Topics:" not in prompt


def test_prompt_has_constraints_block() -> None:
    prompt = _build_repo_prompt(_BUNDLE)
    assert "STRICT RULES" in prompt
    assert "tech_stack" in prompt
    assert "file_pointer" in prompt


def test_prompt_constraints_block_before_tree() -> None:
    prompt = _build_repo_prompt(_BUNDLE)
    assert prompt.index("STRICT RULES") < prompt.index("File tree:")


def test_prompt_readme_not_double_capped() -> None:
    prompt = _build_repo_prompt(_BUNDLE_LONG_README)
    assert "x" * 25_000 in prompt


def test_prompt_readme_label_is_plain() -> None:
    prompt = _build_repo_prompt(_BUNDLE)
    assert "README (preprocessed)" not in prompt
    assert "README:" in prompt


def test_prompt_manifest_cap_is_4000() -> None:
    prompt = _build_repo_prompt(_BUNDLE_LONG_MANIFEST)
    assert "a" * 4_000 in prompt
    assert "a" * 4_001 not in prompt


def test_prompt_has_star_calibration() -> None:
    prompt = _build_repo_prompt(_BUNDLE)
    assert "star" in prompt.lower()
    assert "1k" in prompt or "1,000" in prompt or "1k+" in prompt


def test_prompt_system_frame_has_field_guidance() -> None:
    prompt = _build_repo_prompt(_BUNDLE)
    for field in ("tagline", "tech_stack", "project_ideas", "when_to_use",
                  "avoid_when", "concepts_taught", "prerequisites",
                  "curriculum_hooks"):
        assert field in prompt, f"system_frame missing guidance for: {field}"
```

- [ ] **Step 2: Run tests to verify they fail**

```
pytest tests/test_repo_pipeline.py::test_prompt_contains_topics tests/test_repo_pipeline.py::test_prompt_omits_topics_line_when_empty tests/test_repo_pipeline.py::test_prompt_has_constraints_block tests/test_repo_pipeline.py::test_prompt_constraints_block_before_tree tests/test_repo_pipeline.py::test_prompt_readme_not_double_capped tests/test_repo_pipeline.py::test_prompt_readme_label_is_plain tests/test_repo_pipeline.py::test_prompt_manifest_cap_is_4000 tests/test_repo_pipeline.py::test_prompt_has_star_calibration tests/test_repo_pipeline.py::test_prompt_system_frame_has_field_guidance -v
```

Expected: all FAIL

- [ ] **Step 3: Rewrite `_build_repo_prompt`**

Replace the entire `_build_repo_prompt` function body in `src/processors/repo.py`:

```python
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
        "developer utility and educational value.\n"
        "Field guidance:\n"
        "- tagline: one sentence capturing what makes this repo distinct from its "
        "alternatives — not a rephrasing of the GitHub description.\n"
        "- tech_stack: languages, libraries, runtimes, and build tools directly "
        "used in this repo.\n"
        "- project_ideas: concrete mini-projects a developer could start this "
        "weekend — name the artifact, not just the domain.\n"
        "- when_to_use: the specific scenario where this is the right tool — name "
        "the constraint or context that makes it the best choice.\n"
        "- avoid_when: the specific scenario where a better alternative exists — "
        "name the alternative.\n"
        "- concepts_taught: CS or engineering concepts a student would learn by "
        "reading this codebase.\n"
        "- prerequisites: what a learner must already know to benefit from "
        "studying this repo.\n"
        "- curriculum_hooks[].why: why this specific file is the best teaching "
        "example for this concept — not just what the concept is."
    )

    topics = meta.get("topics") or []
    meta_block = (
        f"Repository: {owner}/{repo}\n"
        f"Stars: {meta.get('stars', 0):,} | Forks: {meta.get('forks', 0):,} | "
        f"Language: {meta.get('language') or 'Unknown'}\n"
        f"Description: {meta.get('description') or '(none)'}\n"
    )
    if topics:
        meta_block += f"Topics: {', '.join(topics)}\n"
    if meta.get("archived"):
        meta_block += "⚠️ This repository is ARCHIVED.\n"

    constraints_block = (
        "STRICT RULES:\n"
        "- tech_stack: only include technologies directly evidenced by files, "
        "imports, or manifests in THIS repo. Do not infer from config files that "
        "reference external systems.\n"
        "- file_pointer: must be an exact path from the provided file tree. "
        "Never invent a path."
    )

    tree_sample = _prioritize_tree(tree, 300)
    tree_block = "File tree:\n" + "\n".join(f"  {p}" for p in tree_sample)

    if manifests:
        manifest_block = "Package manifests:\n" + "\n\n".join(
            f"--- {p} ---\n{c[:4_000]}" for p, c in manifests.items()
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
        readme_block = f"README:\n{readme}"

    if freestyle_prompt:
        focus_block = (
            f"User instruction: {freestyle_prompt}\nAnswer using the repository context above."
        )
    else:
        focus_block = (
            "Extract a structured analysis matching the JSON schema. "
            "Be specific about developer use-cases and educational concepts.\n"
            "Calibrate confidence to star count: for repos with 1k+ stars make "
            "direct claims; for repos under 100 stars use hedged language "
            "(e.g. 'appears to', 'may be useful for')."
        )

    return "\n\n".join(
        [system_frame, meta_block, constraints_block, tree_block, manifest_block, readme_block, focus_block]
    )
```

- [ ] **Step 4: Run failing tests to verify they all pass**

```
pytest tests/test_repo_pipeline.py::test_prompt_contains_topics tests/test_repo_pipeline.py::test_prompt_omits_topics_line_when_empty tests/test_repo_pipeline.py::test_prompt_has_constraints_block tests/test_repo_pipeline.py::test_prompt_constraints_block_before_tree tests/test_repo_pipeline.py::test_prompt_readme_not_double_capped tests/test_repo_pipeline.py::test_prompt_readme_label_is_plain tests/test_repo_pipeline.py::test_prompt_manifest_cap_is_4000 tests/test_repo_pipeline.py::test_prompt_has_star_calibration tests/test_repo_pipeline.py::test_prompt_system_frame_has_field_guidance -v
```

Expected: all PASS

- [ ] **Step 5: Run full repo pipeline suite for regressions**

```
pytest tests/test_repo_pipeline.py -v
```

Expected: all PASS

- [ ] **Step 6: Run full test suite**

```
pytest -x -q
```

Expected: all PASS (no cross-module regressions)

- [ ] **Step 7: Commit**

```
git add src/processors/repo.py tests/test_repo_pipeline.py
git commit -m "feat(repo): improve _build_repo_prompt — constraints block, topics, field guidance, readme cap, manifest cap, star calibration"
```
