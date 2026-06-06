---
adr: "0021"
title: Repo prompt improvements — topics, tree prioritisation, structured grounding, and prompt layering
status: accepted
date: 2026-06-07
---

## Context

The repo pipeline (`src/processors/repo.py`) feeds a single assembled prompt into
Gemini to produce structured JSON (tagline, tech\_stack, project\_ideas, etc.). Two
categories of problem were observed in early output:

**Hallucination in structured fields.** Gemini regularly invented `file_pointer`
paths that did not exist in the repo, and included technologies in `tech_stack`
that were mentioned in external CI config or referenced services rather than used
directly in the codebase. The prompt gave no explicit grounding rules for either
field.

**Under-informed context.** The file tree was capped at 200 entries with no ordering
guarantee — a monorepo with hundreds of generated or vendored files would exhaust
the cap before any source file appeared, leaving Gemini with nothing to reason
about. GitHub topics (the human-curated classification tags) were fetched by the
API but discarded. README content had two independent caps that could conflict.
Per-manifest content was limited to 2 000 chars, which was too short to see
dependency versions in large `package.json` or `Cargo.toml` files.

**Over-specified prompts in freestyle mode.** The `system_frame` block contained
detailed per-field guidance for all eight JSON schema fields. In freestyle mode
(where the user asks a free-form question and no schema is enforced) this guidance
was dead weight — ~400 tokens of noise that could bias the model toward structured
vocabulary while it was answering a conversational question.

## Decisions

### 1. Topics as a first-class bundle field; v2 cache key

`topics` is now returned from `_fetch_bundle_meta_sync` and stored in
`bundle["metadata"]["topics"]`. If the API response omits the key, it defaults to
`[]`.

The Redis cache key was bumped from `github_repo_bundle:{owner}/{repo}` to
`github_repo_bundle:v2:{owner}/{repo}`. Stale bundles cached under the old key
lack `topics`, so any attempt to read them with the new schema would silently
surface an empty list even for repos with many topics. A key-version bump forces a
cache miss and a fresh fetch on next access rather than requiring a manual cache
purge.

The `Topics:` line is conditionally appended to `meta_block` — omitted when the
list is empty, so repos without tags do not emit a misleading blank label.

### 2. `_prioritize_tree` — three-tier ordering, 300-entry cap

A new `_prioritize_tree(tree, limit=300)` function replaces the raw `tree[:200]`
slice. It buckets every path into one of three tiers before capping:

1. **Source files** — paths whose filename extension is in `_SOURCE_EXTS`
   (`.rs`, `.py`, `.ts`, `.js`, `.go`, `.java`, `.c`, `.cpp`, `.h`,
   `.rb`, `.swift`, `.kt`, `.cs`, `.zig`, `.ex`, `.exs`).
2. **Manifest/config files** — paths whose basename is in `_CONFIG_NAMES`
   (see §4 for the canonical list).
3. **Everything else** — docs, assets, lock files, generated artefacts.

The rationale: Gemini's `file_pointer` and `tech_stack` fields depend on seeing
actual source and manifest paths. Before this change, a repo with 250 auto-generated
protobuf files would exhaust the old 200-entry cap before exposing a single `.go`
file. The 300-entry limit was chosen empirically: it fits within Gemini Flash's
context comfortably while covering the meaningful surface of any repo we have
tested.

### 3. Constraints block — always included, even in freestyle mode

A `constraints_block` with STRICT RULES was added to ground the two most
hallucination-prone fields:

- **`tech_stack`**: only technologies directly evidenced by files, imports, or
  manifests in the provided tree. CI or deployment configs that reference external
  systems are excluded.
- **`file_pointer`**: must be an exact path from the provided file tree. Inventing
  paths is prohibited.

During code review a question arose: should this block appear in freestyle mode?
The decision was **yes** — the rules govern factual claims about the repository
regardless of output format. A freestyle question like "what stack does this use?"
should produce the same grounded answer as the structured path. Excluding the
constraints block in freestyle mode would create an inconsistent factual standard
between the two output modes.

### 4. Field guidance isolated to the structured path

Per-field quality guidance (distinct `tagline`, `when_to_use` naming the
alternative, `curriculum_hooks[].why` explaining *why* the file is the best
example) was moved out of `system_frame` and into a separate `field_guidance_block`
that is only included when `freestyle_prompt` is absent.

`system_frame` retains only the role sentence ("You are a technical analyst…").
This means:

- In **structured mode**: role → field guidance → constraints → data → schema
  instructions.
- In **freestyle mode**: role → constraints → data → user question.

The separation avoids sending JSON-schema-specific vocabulary to the model when it
is being asked a conversational question. The constraints block remains in both
paths (see §3).

### 5. Single README cap enforcement point

The prompt builder previously applied `readme[:10_000]` in addition to the
`_README_MAX = 50_000` cap already enforced by `preprocess_readme` in
`github.py`. The lower cap was removed from the prompt builder. `preprocess_readme`
is now the single enforcement point. The README label was corrected from
`"README (preprocessed):"` to `"README:"` — the preprocessing is an
implementation detail, not a signal that belongs in the prompt.

The 10 000-char cap was a holdover from early development. A repository with a
25 000-char README (not unusual for large projects) was being silently truncated
mid-sentence, degrading the quality of all README-dependent fields. The 50 000-char
limit set in `github.py` represents the real policy; the prompt builder has no
business re-capping it.

### 6. Per-manifest content cap raised 2 000 → 4 000 chars

Manifest files are sliced to `c[:4_000]` before inclusion in `manifest_block`. The
previous 2 000-char limit cut off `Cargo.toml` and `package.json` files before
reaching their `[dependencies]` / `"dependencies"` sections on medium-sized
projects, which are exactly the sections Gemini needs to populate `tech_stack`
accurately. 4 000 chars covers the dependency block of every manifest we have
encountered in testing.

### 7. Star-calibrated confidence language

A sentence was added to `focus_block` in structured mode:

> Calibrate confidence to star count: for repos with 1k+ stars make direct claims;
> for repos under 100 stars use hedged language (e.g. 'appears to', 'may be useful
> for').

Low-star repos often lack README coverage and have sparse commit history, so the
same tone of voice used for `tokio` is inappropriate for a three-star weekend
project. The threshold (1 000 / 100) was chosen as a rough proxy for
community-validated maturity; it is embedded in the prompt rather than applied
post-hoc in formatting so the model can calibrate the *content* of its claims, not
just their phrasing.

### 8. `_CONFIG_NAMES` / `_MANIFEST_NAMES` alignment

`_CONFIG_NAMES` (used for tier-2 tree prioritisation) and `_MANIFEST_NAMES` (used
to decide which files to fetch content for) had grown apart. The alignment decision:

- **`_MANIFEST_NAMES`** gains `mix.exs` (Elixir). Its content is now fetched and
  included in the manifest block.
- **`_CONFIG_NAMES`** gains `setup.cfg`, `composer.json`, `build.gradle.kts`, and
  `Dockerfile`. These files were being fetched and shown in the manifest content
  block but sorted into the lowest tree tier, giving a misleading signal about
  their importance.
- **Lock files** (`pnpm-lock.yaml`) are kept in `_MANIFEST_NAMES` for content
  fetching but deliberately excluded from `_CONFIG_NAMES`. Lock files are often
  thousands of lines of machine-generated content; surfacing them in tier 2 of the
  file tree would obscure actual source files for JS/TS projects.

A comment on `_CONFIG_NAMES` was updated to make the lock-file exclusion explicit
and to drop the misleading "Keep in sync" instruction that implied the sets were
identical.

## Consequences

- **Pro:** Gemini hallucination of `file_pointer` and `tech_stack` fields should
  drop materially — the constraints block gives it an explicit prohibition and the
  tree prioritisation ensures relevant evidence is always visible.
- **Pro:** Topics appear in the meta block, improving the model's ability to
  produce accurate taglines and `when_to_use` sentences for repos whose README
  descriptions are sparse.
- **Pro:** Field guidance no longer leaks into freestyle responses. Freestyle token
  cost drops by ~400 tokens per call.
- **Pro:** README content for large projects is no longer silently truncated at 10K.
- **Con:** Bundle cache miss rate will spike immediately after deploy (v2 key bump).
  All cached bundles are effectively invalidated. Each repo requested within the
  next 7 days will incur one fresh GitHub API round-trip. At vig's current
  single-user scale this is negligible.
- **Con:** `_CONFIG_NAMES` and `_MANIFEST_NAMES` still diverge on lock files by
  design. Future contributors must understand the intentional asymmetry; the comment
  on `_CONFIG_NAMES` is the canonical explanation.
- **Neutral:** The 300-entry tree cap is a heuristic. A monorepo exceeding 300
  source files will still be truncated — but now within the source tier, not before
  it. This is a better failure mode.

## Considered Alternatives

- **Structured grounding via JSON schema constraints alone** — The Gemini schema
  already marks `file_pointer` as a `string`. We considered relying solely on the
  schema + few-shot examples to prevent invented paths, without a prose constraints
  block. Rejected: schema type alone does not communicate *where* the value must
  come from; prose rules closer to the data are more effective for factual
  grounding.
- **Exclude constraints block in freestyle mode** — Considered during code review.
  Rejected (see §3): grounding rules should be consistent regardless of output
  format.
- **Single `_MANIFEST_AND_CONFIG_NAMES` constant shared between modules** — Would
  eliminate the dual-set problem entirely. Rejected for now: the modules have
  different responsibilities (fetch vs. display priority), and a shared constant
  would require either a new shared module or a circular import. The aligned-but-
  separate approach is simpler at current scale.
- **Dynamic tree cap based on token budget** — Rejected as premature: Gemini Flash
  has a large context window and the 300-entry cap has not been a binding constraint
  in any repo tested so far.
