# Kanban Sync

Shared procedure for reflecting issue-tracker changes into a project's `ISSUE_KANBAN.md` board. Invoked as the **final step** by `to-issue-kanban` (after publishing new issues), `triage-kanban` (after applying a triage outcome), and `update-kanban` (after a full board↔GitHub reconcile). The first two **pass in** the set of issues they just touched and what changed; `update-kanban` **derives** that set itself by diffing the whole board against `gh`, then applies it through the same §2–§6 machinery (plus the opt-in PR section, §8).

This board is a **read-only snapshot** — GitHub Issues is authoritative. These edits are **surgical**: touch only the affected rows and dep-map nodes, preserve every hand-written Note and the Dependency Map. The only full build is the bootstrap case (§1).

## 1. Locate (or bootstrap) the board

Glob `**/ISSUE_KANBAN.md` from the repo root:

- **Exactly one match** → use it.
- **Multiple matches** → ask the user which one.
- **Zero matches** → **bootstrap** a new file at the repo root:
  1. Write the skeleton (§7).
  2. Detect the repo URL from `git remote get-url origin` for the header.
  3. **Ask the human** how much to backfill, with this explanation:
     > **B (fast):** route every issue from `gh issue list --state all` into a column by label; backfilled Done rows get Notes `closed on GH`. No per-issue PR lookups.
     > **C (complete):** same, plus one `gh` call per closed issue to fill real PR #/commit Notes — accurate but slow on large repos (e.g. 90+ issues).
  4. Backfill per their choice. Seed the Dependency Map with a `Critical path:` placeholder; it grows as `to-issue-kanban` runs.

## 2. Column mapping

| Triage state        | Board column                              |
| ------------------- | ----------------------------------------- |
| `needs-triage`      | **Needs Triage**                          |
| `needs-info`        | **Needs Triage** (stays / returns here)   |
| `ready-for-agent`   | **Ready for Agent**                       |
| `ready-for-human`   | **Ready for Human**                       |
| `wontfix`           | **remove the row** (closed, not actioned) |
| closed-as-completed | **Done**, routed through the §9 window    |

`triage-kanban` also **syncs already-closed issues into Done** whenever it encounters one. Distinguish closed-as-completed (→ Done) from closed-as-`wontfix` (→ remove row). For Done Notes, pull PR #/commit/`closed on GH` from the close event + linked PR via `gh`. "→ Done" means the row lands on the live board and immediately passes through the §9 rolling-window check — a newly-closed issue can appear on the live board and archive back out on the very next sync if its Dependency Map group has already aged out.

## 3. Row fields

Columns differ: Needs Triage / Ready for Agent carry **Depends On**; Ready for Human / Done carry **Notes**. All carry **Area**.

- **Depends On** — from the blocked-by edges (`to-issue-kanban` computes them; triage carries them over unchanged).
- **Notes** — from the close event / linked PR.
- **Area** — **derive** in this order: (1) issue **labels** → (2) conventional-commit **scope** in the title (`feat(webhook):` → `Webhook`, `refactor(telegram):` → `Refactor / Telegram`) → (3) `—`. `to-issue-kanban` surfaces the proposed Area in its Step-4 quiz for correction; `triage-kanban` derives silently.

## 4. Safety rules (surgical edits)

- **Primary key = issue `#N`.** Never produce a duplicate `#N` row.
  - **Add:** append only if no `#N` row exists anywhere on the board.
  - **Move:** remove the existing `#N` row from its old column, insert into the new column.
- **Placement:** append to the bottom of the target column. **Ready for Agent** is _"unblocked-first, then dependency chain"_ — if a moved issue has **no** Depends On, note in the report that it may belong higher, and leave final ordering to the human.
- **Repair on touch:** if a table you're editing is malformed (orphaned rows outside the table, stray blank lines splitting it), repair its structure while you're there so it stays parseable.

## 5. Dependency Map

- **`to-issue-kanban`:** append a **new labeled block** for the plan/spec/PRD being broken down, matching the existing `Feature (source: path)` style, with the slice tree drawn from the blocked-by edges. When a new slice is blocked by an issue that **already exists** elsewhere in the map, add an inbound cross-ref (`◄── also #N`) rather than redrawing that tree. Emit a `Critical path:` line if the slice graph is linear enough. Do not touch other blocks.
- **`triage-kanban`:** the only dep-map edit is appending ` ✅-Done` to an existing `#N` node **when moving it to Done** (idempotent — skip if already present). Never restructure.

## 6. Write & report

Write the file, then print a concise diff summary, e.g.:

```
ISSUE_KANBAN.md updated:
  + #96–#99 → Needs Triage
  ~ #82 moved Ready for Agent → Done (✅-Done in dep map; Notes: PR #91)
  + dep-map block "Spaces export feature (docs/.../spaces.md)"
  ! repaired malformed Needs Triage table
```

The board is git-tracked — `git diff` / `git checkout` is the undo. The AI-disclaimer (`> *This was generated by AI during triage.*`) applies to **GitHub comments only**, never to this file.

## 8. PR section (opt-in)

Rendered **only when the caller asks for it** — `update-kanban` does; `to-issue-kanban` / `triage-kanban` do **not** (they leave any existing PR section untouched).

It lives **after the Dependency Map**, as two tables:

```markdown
## Open PRs

|   # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |

## Closed PRs

|   # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |
```

- **Branch→Base** — `headRefName→baseRefName`.
- **Linked Issue** — the issue(s) the PR closes. Prefer the GraphQL `closingIssuesReferences` field; fall back to parsing `Closes #N` / `Fixes #N` / `Resolves #N` from the PR body. `—` if none. (One-directional: the issue rows get **no** back-reference to their PR — Done-row Notes already carry the PR # per §3.)
- **Status** — Open table: `Open` / `Draft`. Closed table: ✅ **Merged** vs ❌ **Closed** (unmerged), from the PR `state`.

**Open PRs** stays small by nature (a PR closes or merges out of it quickly) — **blow it away and rebuild it every run** from `gh pr list --state open`.

**Closed PRs no longer full-rebuilds** — that was the unbounded-growth root cause an archive split would otherwise resurrect every run. Instead: diff `gh pr list --state closed` against the union of (live Closed PRs ∪ the archive file's Closed PRs) by PR number; append only genuinely new closed PRs to the live table; then apply the §9 rolling window.

## 7. Bootstrap skeleton

```markdown
# Issue Kanban

> Read-only snapshot — authoritative state lives on [GitHub Issues](<repo URL>).
> Update this file whenever an issue moves columns.

---

## Done

|   # | Title | Area | Notes |
| --: | ----- | ---- | ----- |

---

## Needs Triage

|   # | Title | Area | Depends On |
| --: | ----- | ---- | ---------- |

---

## Ready for Agent

Ordered by unblocked-first, then dependency chain.

|   # | Title | Area | Depends On |
| --: | ----- | ---- | ---------- |

---

## Ready for Human

|   # | Title | Area | Notes |
| --: | ----- | ---- | ----- |

---

## Dependency Map

\`\`\`
Critical path: (seeded on bootstrap; grows as to-issue-kanban runs)
\`\`\`

---

## Open PRs

|   # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |

## Closed PRs

|   # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |
```

> The PR tables are populated by `update-kanban` (§8); a bootstrap triggered by `to-issue-kanban` / `triage-kanban` leaves them empty until the first `/update-kanban` run.

## 9. Archive rolling window

The live board keeps only a rolling window of history; everything that ages out moves to `docs/archive/ISSUE_KANBAN-archive.md` — same table shapes as the live board (a Done table, a Closed PRs table), so rows move verbatim with no reformatting. GitHub Issues stays authoritative; the archive is just the other half of the read-only snapshot. Applied at the end of every Done-row write and every Closed-PR-row write, inside this shared helper — so `to-issue-kanban`, `triage-kanban`, and `update-kanban` all inherit it automatically with no per-caller logic.

- **Done window — last 3 Dependency Map groups with a done issue.** A "group" is one of the blank-line-delimited blocks in the Dependency Map (the unit §5 appends per `to-issue-kanban` run — e.g. "Tooltip system", "Brain Links nav + graph controls"). After inserting/updating a Done row, walk the Dependency Map bottom-up and take the last 3 groups that contain at least one `✅-Done` issue. For every Done row on the live board whose issue is not in one of those 3 groups (and is not an orphan attached to one — below), remove it from the live Done table and append it to the archive file's Done table. **Skip the append if that `#N` is already present in the archive — idempotent.**
- **Closed PRs window — the 4 highest PR numbers, flat (no grouping).** After inserting a Closed-PR row, keep only the 4 highest-numbered rows on the live board; move any others to the archive file's Closed PRs table the same append-if-absent way.
- **Orphan Done rows** — a Done issue with no corresponding Dependency Map node — inherit the group of the nearest **preceding** row in the live Done table's current order that does have a node. This is recomputed on every walk, not a fixed assignment: if the board is later reordered it re-resolves, but in practice rows are appended in encounter order so it stays stable in practice. An orphan travels with its inherited group — live while that group is in-window, archived in the same batch when the group ages out.

A newly-closed issue or newly-closed PR can therefore land on the live board and archive back out on the very next sync, if its group (or PR-number rank) has already aged out — see §2 and §8.

`update-kanban`'s delta computation checks the archive file for `#N` before backfilling a closed-completed issue that's absent from the live board (`update-kanban/SKILL.md` step 2) — an issue already in the archive is already accounted for, not a resurrection candidate.
