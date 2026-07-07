"""Concern: the §9 Closed-PR rolling window.

Rule (kanban-sync.md §9): keep only the **N highest-numbered** Closed-PR rows
live (default 4, flat — no grouping); everything else ages out to the archive.

Computes sets only; archive_move.py does the writing + cross-file dedup.

Output (‑‑json): {"keep": [...], "archive": [...]} — each a list of
{"number": int, "line": int} in file order.

CLI:
    python pr_window.py <board.md> [--json] [--window N]
"""
from __future__ import annotations
import argparse
import json

import kanban_md as km


def compute(lines: list[str], window: int = 4) -> dict:
    table = km.find_table(lines, "## Closed PRs")
    rows = [{"number": km.row_number(lines[i], "pull"), "line": i} for i in table.data_idx]
    rows = [r for r in rows if r["number"] is not None]
    keep_nums = {r["number"] for r in sorted(rows, key=lambda r: r["number"], reverse=True)[:window]}
    keep = [r for r in rows if r["number"] in keep_nums]
    archive = [r for r in rows if r["number"] not in keep_nums]
    return {"keep": keep, "archive": archive}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("board")
    ap.add_argument("--window", type=int, default=4)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    lines = km.load(args.board)
    res = compute(lines, args.window)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return
    print(f"keep live   ({len(res['keep']):>3}): "
          f"{sorted((r['number'] for r in res['keep']), reverse=True)}")
    print(f"archive out ({len(res['archive']):>3}): "
          f"{sorted((r['number'] for r in res['archive']), reverse=True)}")


if __name__ == "__main__":
    main()
