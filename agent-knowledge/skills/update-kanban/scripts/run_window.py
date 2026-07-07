"""Thin orchestrator — composition only, no logic of its own.

Runs both §9 windows and applies the archive move in one call. Every rule lives
in the concern modules (done_window / pr_window / archive_move); this file only
wires them together for convenience.

    # preview (default)
    python run_window.py

    # apply
    python run_window.py --apply

Paths default to the vig repo layout; override with --live / --archive.
"""
from __future__ import annotations
import argparse
import os
import sys

# resolve repo root two levels up from scripts/ -> update-kanban/ -> skills/...
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import archive_move  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", default="ISSUE_KANBAN.md")
    ap.add_argument("--archive", default="docs/archive/ISSUE_KANBAN-archive.md")
    ap.add_argument("--done-window", type=int, default=3)
    ap.add_argument("--pr-window", type=int, default=4)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    argv = ["archive_move.py", "--live", args.live, "--archive", args.archive,
            "--done-window", str(args.done_window), "--pr-window", str(args.pr_window)]
    if args.apply:
        argv.append("--apply")
    sys.argv = argv
    archive_move.main()


if __name__ == "__main__":
    main()
