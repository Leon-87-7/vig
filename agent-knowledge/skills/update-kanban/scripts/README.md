# update-kanban scripts — §9 rolling-window mechanics

Deterministic helpers for the tedious, error-prone half of `/update-kanban`:
enforcing the `kanban-sync.md` §9 rolling windows on `ISSUE_KANBAN.md` and its
archive. Each script owns **one concern** and composes with the others; none of
them talk to GitHub.

## What is (and isn't) here

**In scope** — pure file math that's identical every run:

| Script | Concern |
| ------ | ------- |
| `kanban_md.py` | Shared data model: locate tables, read row numbers, serialize. No policy. |
| `depmap_groups.py` | Parse the Dependency Map into ordered groups + their `✅-Done` issues. |
| `done_window.py` | §9 Done rule → keep/archive sets (last-3 done-groups + orphan inheritance). |
| `pr_window.py` | §9 Closed-PR rule → keep/archive sets (N highest, default 4). |
| `archive_move.py` | Append-if-absent, cross-file `#N` dedup, write both files. `--dry-run` default. |
| `run_window.py` | Thin orchestrator — composition only, no logic. |

**Out of scope, by design** — anything that needs GitHub state or judgement:

- the **issue delta** (column moves, new issues, wontfix removals, closed→Done)
  — the `/update-kanban` agent computes this from `gh issue list`;
- **TASK.md** brief marking — owned by the `sync-task-briefs` skill.

The scripts only run *after* those steps have written their rows; they then age
out whatever now falls outside the window.

## Usage

```bash
# preview (default — writes nothing)
python3 agent-knowledge/skills/update-kanban/scripts/run_window.py

# apply
python3 agent-knowledge/skills/update-kanban/scripts/run_window.py --apply

# inspect one concern in isolation
python3 agent-knowledge/skills/update-kanban/scripts/done_window.py ISSUE_KANBAN.md --json
python3 agent-knowledge/skills/update-kanban/scripts/pr_window.py   ISSUE_KANBAN.md
```

Every step is idempotent: on an already-windowed board the archive sets are
empty and nothing is written. Window sizes are overridable
(`--done-window`, `--pr-window`) but default to the §9 values (3 / 4).

## Known simplification

`depmap_groups.py` collects **every** `#N` on a line, so a `PR #316` reference
or an `also #84` cross-ref inside an in-window group counts that number as
"in the group." In practice this is harmless: keep/archive decisions are keyed
by *issue* number, and a PR-ref or an already-archived cross-ref issue almost
never collides with a **live Done row's** issue number. If a spurious keep ever
shows up, it will be an issue that already aged out and has no live row to keep.
Refining would mean stripping `PR #` / `also #` patterns before matching —
deliberately skipped to keep the parse dumb and predictable.

## Validation

`run_window.py` was checked to reproduce a hand-computed §9 pass **byte-for-byte**
(50 Done rows + 15 new Closed-PR rows aged out, `#117` de-duplicated across
live/archive). Re-run that check after any change: point the scripts at a
pre-window board copy with `--live/--archive` and `diff` the applied output
against the expected result.
