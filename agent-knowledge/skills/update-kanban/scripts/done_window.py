"""Concern: the §9 Done rolling window.

Rule (kanban-sync.md §9): keep only Done rows whose issue lives in one of the
**last 3 Dependency Map groups that contain a ✅-Done issue**. Everything else
ages out to the archive. Orphan Done rows (no dep-map node) inherit the
in/out-of-window status of the nearest preceding Done row that has a node.

This script computes the sets only — it does not touch files. archive_move.py
does the writing; the cross-file dedup of rows already present in the archive
also lives there.

Output (‑‑json): {"keep": [...], "archive": [...], "orphans": {n: "keep|archive"}}
`keep`/`archive` are lists of {"number": int|null, "line": int} in file order.

CLI:
    python done_window.py <board.md> [--json] [--window N]
"""
from __future__ import annotations
import argparse
import json

import kanban_md as km
from depmap_groups import parse_groups


def compute(lines: list[str], window: int = 3) -> dict:
    groups = parse_groups(lines)
    done_groups = [g for g in groups if g["done"]]
    in_window = done_groups[-window:] if window else done_groups
    in_window_numbers: set[int] = set()
    for g in in_window:
        in_window_numbers |= set(g["issues"])
    node_numbers: set[int] = set()
    for g in groups:
        node_numbers |= set(g["issues"])

    table = km.find_table(lines, "## Done")
    keep, archive, orphans = [], [], {}
    last_status = None  # 'keep' | 'archive' from the nearest preceding node-row
    for idx in table.data_idx:
        n = km.row_number(lines[idx], "issues")
        has_node = n is not None and n in node_numbers
        if has_node:
            status = "keep" if n in in_window_numbers else "archive"
            last_status = status
        else:
            # orphan: inherit nearest preceding node-row; default keep if none yet
            status = last_status or "keep"
            orphans[n if n is not None else f"row@{idx}"] = status
        (keep if status == "keep" else archive).append({"number": n, "line": idx})
    return {"keep": keep, "archive": archive, "orphans": orphans,
            "in_window_groups": [g["index"] for g in in_window]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("board")
    ap.add_argument("--window", type=int, default=3)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    lines = km.load(args.board)
    res = compute(lines, args.window)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return
    kn = [r["number"] for r in res["keep"]]
    an = [r["number"] for r in res["archive"]]
    print(f"in-window dep-map groups: {res['in_window_groups']}")
    print(f"keep live   ({len(kn):>3}): {sorted(x for x in kn if x)}")
    print(f"archive out ({len(an):>3}): {sorted(x for x in an if x)}")
    if res["orphans"]:
        print(f"orphans (inherited): {res['orphans']}")


if __name__ == "__main__":
    main()
