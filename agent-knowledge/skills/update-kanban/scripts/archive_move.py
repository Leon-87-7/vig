"""Concern: the archive-file mechanics for the §9 windows.

Given the keep/archive sets from done_window.py + pr_window.py, this script
owns the file mutation and nothing else:

  * remove aged-out rows from the live board;
  * append them to the matching archive table **only if that #N is absent**
    (idempotent — a row already archived is not duplicated);
  * cross-file dedup — if a row the window would keep live is *already* in the
    archive (a pre-existing duplicate, e.g. a re-added backfill), drop the live
    copy so no #N appears in both files;
  * write live + archive, or preview with --dry-run (the default).

CLI:
    python archive_move.py --live ISSUE_KANBAN.md --archive docs/archive/ISSUE_KANBAN-archive.md [--apply]

Out of scope (by design): the GitHub-issue delta and TASK.md marking. Those are
the agent's and sync-task-briefs' concerns, not deterministic file math.
"""
from __future__ import annotations
import argparse

import kanban_md as km
import done_window
import pr_window


def _archive_numbers(lines: list[str], section: str, kind: str) -> set[int]:
    tbl = km.find_table(lines, section)
    return {n for n in tbl.numbers(lines, kind) if n is not None}


def plan(live: list[str], arch: list[str], done_win: int, pr_win: int) -> dict:
    done = done_window.compute(live, done_win)
    pr = pr_window.compute(live, pr_win)
    arch_done = _archive_numbers(arch, "## Done", "issues")
    arch_pr = _archive_numbers(arch, "## Closed PRs", "pull")

    # rows to append to archive (verbatim), append-if-absent
    done_append = [live[r["line"]] for r in done["archive"]
                   if r["number"] is None or r["number"] not in arch_done]
    pr_append = [live[r["line"]] for r in pr["archive"] if r["number"] not in arch_pr]

    # live rows to remove: everything aged out ...
    remove = {r["line"] for r in done["archive"]} | {r["line"] for r in pr["archive"]}
    # ... plus cross-file dedup: kept-live rows whose #N is already archived
    dedup_done = [r for r in done["keep"] if r["number"] in arch_done]
    dedup_pr = [r for r in pr["keep"] if r["number"] in arch_pr]
    remove |= {r["line"] for r in dedup_done} | {r["line"] for r in dedup_pr}

    return {
        "done": done, "pr": pr,
        "done_append": done_append, "pr_append": pr_append,
        "remove": remove,
        "dedup": [r["number"] for r in dedup_done + dedup_pr],
        "already_archived_done": sorted(r["number"] for r in done["archive"]
                                        if r["number"] in arch_done),
        "already_archived_pr": sorted(r["number"] for r in pr["archive"]
                                      if r["number"] in arch_pr),
    }


def apply(live: list[str], arch: list[str], p: dict) -> tuple[list[str], list[str]]:
    new_live = [l for i, l in enumerate(live) if i not in p["remove"]]
    # append Done rows after the last archive Done data row
    d = km.find_table(arch, "## Done")
    at = km.last_data_index(d)
    arch2 = arch[:at + 1] + p["done_append"] + arch[at + 1:]
    # re-locate Closed PRs on the mutated list, then append PR rows
    c = km.find_table(arch2, "## Closed PRs")
    at2 = km.last_data_index(c)
    arch2 = arch2[:at2 + 1] + p["pr_append"] + arch2[at2 + 1:]
    return new_live, arch2


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", required=True)
    ap.add_argument("--archive", required=True)
    ap.add_argument("--done-window", type=int, default=3)
    ap.add_argument("--pr-window", type=int, default=4)
    ap.add_argument("--apply", action="store_true", help="write files (default: dry-run)")
    args = ap.parse_args()

    live = km.load(args.live)
    arch = km.load(args.archive)
    p = plan(live, arch, args.done_window, args.pr_window)

    dn = lambda rows: sorted(x for x in (r["number"] for r in rows) if x)  # noqa: E731
    print("DONE  keep live :", dn(p["done"]["keep"]))
    print("DONE  ->archive :", len(p["done"]["archive"]),
          "| new rows appended:", len(p["done_append"]),
          "| already in archive:", p["already_archived_done"])
    print("PRS   keep live :", sorted((r["number"] for r in p["pr"]["keep"]), reverse=True))
    print("PRS   ->archive :", len(p["pr"]["archive"]),
          "| new rows appended:", len(p["pr_append"]),
          "| already in archive:", len(p["already_archived_pr"]))
    if p["dedup"]:
        print("cross-file dedup (dropped live dup, kept archive):", p["dedup"])

    if not args.apply:
        print("\n[DRY RUN] no files written. Re-run with --apply")
        return

    new_live, new_arch = apply(live, arch, p)
    km.dump(args.live, new_live)
    km.dump(args.archive, new_arch)
    print("\n[APPLIED] live + archive written.")


if __name__ == "__main__":
    main()
