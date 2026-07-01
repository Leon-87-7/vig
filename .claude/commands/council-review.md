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

Output format:

- Group findings under `## Blocker`, `## Major`, `## Minor`, `## Nit` headings (omit empty groups).
- One bullet per finding: `` `file:line` `` — one-line description — suggested fix — `(reviewer)` attribution.
- Merge duplicates into a single bullet listing every reviewer that raised it; call out disagreements explicitly (e.g. "ponytail says delete, react says keep").
- End with a one-line **Suggested order** of what to fix first.

## Optional: write an implementation plan for the findings

If the synthesis has at least one finding (any severity), ask the user whether
they want an implementation plan written for these findings. If yes, dispatch
ONE more agent (`subagent_type: general-purpose`, after synthesis — not parallel
with the 5 reviewers) that invokes the `superpowers:writing-plans` skill to turn
the synthesized findings into a task-by-task implementation plan, in the same
format as `docs/superpowers/plans/2026-07-01-invite-gate-council-fixes.md`
(Global Constraints, one Task per finding or logical group of related findings,
checkbox steps, a test step, a commit step). This agent MAY write — it is the
only step in this command permitted to.

Save the plan to `docs/superpowers/council/<review-target>-council-fixes-<YYYY-MM-DD>.md`
(e.g. `docs/superpowers/council/invite-gate-255-256-council-fixes-2026-07-01.md`) — deliberately
**not** `docs/superpowers/plans/`, since this doc is a review artifact for agent
handoff, not a plan authored ahead of implementation. Report the saved path back
to the user.
