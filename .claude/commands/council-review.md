---
description: Council code review — 5 read-only reviewers in parallel, one synthesis, optional follow-up plan
---

Run a council code review of `$ARGUMENTS` (default: the current branch's diff vs `main`).

Dispatch these **5 subagents in parallel, in a single message**. Every agent is
**read-only**: it may Read/Grep/Glob and run its review skill, but MUST NOT Edit,
Write, or run any command that mutates the repo. State this in each prompt.

Each agent returns: findings only — `file:line`, severity, what's wrong, suggested fix.
No agent applies fixes.

1. **ponytail** — `subagent_type: general-purpose`. Invoke the `ponytail:ponytail-review`
   skill on the target. Hunt over-engineering only: what to delete/simplify.
2. **correctness** — `subagent_type: general-purpose`. Run the `/code-review` command
   (`~/.claude/commands/code-review.md`) on the target: bugs, security, perf, architecture.
3. **interfaces** — `subagent_type: general-purpose`. Invoke the
   `make-interfaces-feel-better` skill on any UI changed in the target.
4. **react** — `subagent_type: general-purpose`. Invoke the `react-component-review`
   skill on changed `.tsx`/`.jsx` components in the target.
5. **python** — `subagent_type: general-purpose`. Invoke the `python-backend-review`
   skill on changed `.py` files in the target.

If the target has no UI / no React changes, agents 3 and 4 report "nothing to review" —
still dispatch them. Same for agent 5 if the target has no Python changes.

After all 5 return, synthesize ONE report, de-duplicating overlapping findings
and noting where reviewers disagree. Do not edit anything yourself — this command
only reviews (the optional planner step below is the one exception, and it only
writes a plan document, never source).

## Output format

- Open with one summary line, colored-circle emoji + count per severity, always
  all four even if zero: `🔴 <n> · 🟠 <n> · 🟡 <n> · ⚪ <n>`.
- Group findings under headings with the emoji inline: `## 🔴 Blocker`, `## 🟠 Major`,
  `## 🟡 Minor`, `## ⚪ Nit` (omit empty groups from the body, but still count them
  in the summary line above).
- One bullet per finding, prose, no tables: `` `file:line` `` — one-line description
  — suggested fix — `(reviewer)` attribution.
- Merge duplicates into a single bullet listing every reviewer that raised it; call
  out disagreements explicitly (e.g. "ponytail says delete, react says keep").
- End with a one-line **Suggested order** of what to fix first.

## Optional: write an implementation plan for the findings

`<review-target>` = the current git branch name (always — regardless of what
`$ARGUMENTS` names as the review target, since that's what round-tracking below
keys off).

If the synthesis has at least one finding (any severity), determine which round
this is for `<review-target>` by checking, in order:

1. Does `docs/superpowers/council/<review-target>-council-fixes.md` exist?
   **No** → this is **round 1**.
2. Does `docs/superpowers/council/<review-target>-council-fixes-round2.md` exist?
   **No** → this is **round 2** (the intended final round).
3. Otherwise → this is **round 3+**.

**Round 1 or round 2:** ask the user whether they want an implementation plan
written for these findings. If yes, dispatch ONE more agent
(`subagent_type: general-purpose`, after synthesis — not parallel with the 5
reviewers) that invokes the `superpowers:writing-plans` skill to turn the
synthesized findings into a task-by-task implementation plan (Global Constraints,
one Task per finding or logical group of related findings, checkbox steps, a test
step, a commit step — see `docs/superpowers/council/` for prior examples of this
format). This agent MAY write — it is the only step in this command permitted to.

Save to:
- Round 1: `docs/superpowers/council/<review-target>-council-fixes.md`
- Round 2: `docs/superpowers/council/<review-target>-council-fixes-round2.md` —
  open this file with a one-line **Context** callout linking back to the round 1
  file, and a note that this is the intended final auto-generated round.

Deliberately **not** `docs/superpowers/plans/` — these are review artifacts for
agent handoff, not plans authored ahead of implementation. Report the saved path
back to the user.

**Round 3+:** do not offer to write a plan. End the synthesis with: *"This is
round 3+ for this branch — per policy, remaining findings should go through PR
review (open a PR, run `/greploop` or `/check-pr`), not another generated plan."*
