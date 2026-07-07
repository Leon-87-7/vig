"""Concern: parse the Dependency Map into ordered groups.

A "group" is one of the blank-line-delimited blocks inside the fenced code
block under `## Dependency Map` (the unit kanban-sync.md §5 appends per
to-issue-kanban run). This script knows nothing about the §9 window — it only
turns the free-text dep-map into structured groups so done_window.py can apply
the rule.

Output (‑‑json): a list of groups in file order, each:
    {"index": i, "issues": [ints...], "done": [ints...], "head": "first line"}
where `done` are issue numbers on lines carrying a ✅-Done marker.

CLI:
    python depmap_groups.py <board.md> [--json]
"""
from __future__ import annotations
import argparse
import json
import re

DONE_RE = re.compile(r"✅[\s-]?done", re.IGNORECASE)
NUM_RE = re.compile(r"#(\d+)")


def _fence_lines(lines: list[str]) -> list[str]:
    start = next(i for i, l in enumerate(lines) if l.strip() == "## Dependency Map")
    # first ``` after the header opens the block; the next ``` closes it
    open_i = next(i for i in range(start, len(lines)) if lines[i].strip().startswith("```"))
    close_i = next(i for i in range(open_i + 1, len(lines)) if lines[i].strip().startswith("```"))
    return lines[open_i + 1:close_i]


def parse_groups(lines: list[str]) -> list[dict]:
    body = _fence_lines(lines)
    groups: list[dict] = []
    cur: list[str] = []

    def flush():
        if not any(s.strip() for s in cur):
            return
        issues, done = [], []
        head = ""
        for s in cur:
            if not head and s.strip():
                head = s.strip()
            nums = [int(n) for n in NUM_RE.findall(s)]
            issues += nums
            if DONE_RE.search(s):
                done += nums
        groups.append({
            "index": len(groups),
            "issues": sorted(set(issues)),
            "done": sorted(set(done)),
            "head": head,
        })

    for line in body:
        if line.strip() == "":
            flush()
            cur = []
        else:
            cur.append(line)
    flush()
    for g in cur:  # noqa: B007 - keep linter calm; final flush handled above
        pass
    return groups


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("board")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    with open(args.board, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    groups = parse_groups(lines)
    if args.json:
        print(json.dumps(groups, ensure_ascii=False, indent=2))
        return
    for g in groups:
        mark = "✅" if g["done"] else "  "
        print(f"{mark} group {g['index']:>3}  done={g['done'] or '-'}  {g['head'][:70]}")


if __name__ == "__main__":
    main()
