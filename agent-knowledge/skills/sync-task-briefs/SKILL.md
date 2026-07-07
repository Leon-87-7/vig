---
name: sync-task-briefs
description: Internal helper for /update-kanban only. When /update-kanban reconciles GitHub issue state, use this skill to append a DONE marker to docs/TASK.md issued briefs whose linked issues are closed-completed, then archive finished bodies through /pre-grill --mark-a.
---

# Sync Task Briefs

Bridge `/update-kanban` and `/pre-grill` cleanup. This is an internal helper
triggered by `/update-kanban`, not a standalone user-facing workflow. GitHub
Issues is the authoritative completion signal; `docs/TASK.md` is the planning
surface; and `/pre-grill --mark-a` owns the body move to
`docs/archive/TASK-archive.md`.

## Inputs

Prefer the already-fetched issue list from `/update-kanban`:

```powershell
gh issue list --state all --limit 500 --json number,title,state,stateReason,labels
```

If no issue list is available in context, fetch it yourself with the same
command. Treat only `state == "CLOSED"` with `stateReason == "COMPLETED"` as a
completion signal. Skip `NOT_PLANNED`, `wontfix`, missing, transferred, and
unknown issues.

## Preview

Read `docs/TASK.md` and scan only `## N. ...` headers under `## Briefs`.

Candidate headers are task briefs that:
- contain an issued marker such as `✅ ISSUED #238`, `✅ ISSUED TO GITHUB #238`,
  or `issued #292-#295`; or
- already contain `✅ DONE` and still have a body below the header.

For issued markers:
- Extract every linked issue number from the header.
- Expand simple ranges like `#292-#295` and `#292–#295`.
- Mark the task complete only when every linked issue number is
  closed-completed on GitHub.
- Leave the task alone if any linked issue is still open, missing, not planned,
  or unknown.

Print a short preview before writing:

```text
TASK.md sync:
  ~ task 7 -> DONE (issues #306 closed-completed), archive body
  ~ task 10 -> DONE (issues #305 closed-completed), archive body
  - task 15 skipped (issue #308 still open)
```

If invoked from `/update-kanban`, fold this preview into the same confirmation
gate as the board delta. If there is no board delta but this skill has
candidate changes, ask for confirmation before writing. If there are no
candidate changes, report `TASK.md already in sync`.

## Apply

Apply only after the user confirmed the preview, or after `/update-kanban`
passes along an already-confirmed apply decision.

For each confirmed task:
1. Preserve the issued marker and append completion before archiving:
   - Convert `## N. Title ✅ ISSUED #NNN` to
     `## N. Title ✅ ISSUED #NNN - ✅DONE`.
   - Convert `## N. Title ✅ ISSUED TO GITHUB #NNN` to
     `## N. Title ✅ ISSUED TO GITHUB #NNN - ✅DONE`.
   - For ranges or multi-issue markers, keep the marker exactly as written and
     append ` - ✅DONE` after it.
   - If the header already contains `✅DONE` or `✅ DONE`, do not add another
     done marker.
   - Preserve the existing title text and issued wording.
2. Invoke `/pre-grill --mark-a` with the selected task numbers:

```text
/pre-grill --mark-a "task 7" "task 10"
```

`/pre-grill --mark-a` moves each body verbatim to
`docs/archive/TASK-archive.md` and leaves the bare completed header behind in
`docs/TASK.md`. Do not manually duplicate that archive logic.

If a task is already `✅ DONE` but still has a body, skip the header rewrite and
still pass it to `/pre-grill --mark-a` so the body is archived.

## Reporting

After applying, report:
- tasks marked done and archived;
- tasks already done but archived now;
- tasks skipped and why;
- whether `docs/TASK.md` and `docs/archive/TASK-archive.md` changed.

Run `git diff --check -- docs/TASK.md docs/archive/TASK-archive.md` after the
write. If `/update-kanban` also changed `ISSUE_KANBAN.md`, include these paths
in the same final diff/validation summary rather than reporting a separate
workflow.
