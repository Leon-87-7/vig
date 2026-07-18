"""Shared data model for the kanban board + archive markdown files.

Single concern: read/locate/serialize the tables and rows. No §9 policy lives
here — that belongs to done_window.py / pr_window.py. This module only knows
how the markdown is shaped:

  ## <Section>
  |  # | Title | ... |          <- header row
  | --: | ----- | ... |          <- separator row
  | [#N](.../issues/N) | ... |    <- data rows (may be orphan `| — | ...`)

Repo URL host is hard-coded to the vig repo; adjust REPO if reused elsewhere.
"""
from __future__ import annotations
import re
from dataclasses import dataclass

REPO = "github.com/Leon-87-7/ownix"


def load(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        return fh.read().split("\n")


def dump(path: str, lines: list[str]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def row_number(line: str, kind: str) -> int | None:
    """Issue/PR number a data row points at. `kind` is 'issues' or 'pull'.

    Returns None for orphan rows (a `| — |` row with no link) so callers can
    apply the §9 orphan-inheritance rule.
    """
    m = re.search(rf"{re.escape(REPO)}/{kind}/(\d+)\)", line)
    return int(m.group(1)) if m else None


@dataclass
class Table:
    """One markdown table located inside a board/archive file."""

    section: str            # e.g. "## Done"
    header_idx: int         # line index of the section header
    first_data: int         # line index of the first data row (or where one would go)
    data_idx: list[int]     # line indices of data rows, in file order

    def numbers(self, lines: list[str], kind: str) -> list[int | None]:
        return [row_number(lines[i], kind) for i in self.data_idx]


def _is_sep(line: str) -> bool:
    s = line.strip()
    return bool(s) and set(s) <= set("|-: ")


def find_table(lines: list[str], section: str) -> Table:
    """Locate a table by its section header (e.g. '## Done', '## Closed PRs').

    The two `|`-lines immediately after the header are the column header and
    separator; every subsequent `|`-line until the next '## ' / '---' / EOF is
    a data row.
    """
    start = next(i for i, l in enumerate(lines) if l.strip() == section)
    i = start + 1
    seen_header = seen_sep = False
    data: list[int] = []
    first_data = None
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith("## ") or s == "---":
            break
        if s.startswith("|"):
            if not seen_header:
                seen_header = True
            elif not seen_sep and _is_sep(lines[i]):
                seen_sep = True
                first_data = i + 1
            else:
                data.append(i)
        i += 1
    if first_data is None:
        first_data = i
    return Table(section, start, first_data, data)


def last_data_index(table: Table) -> int:
    """File index to insert-after when appending rows to this table."""
    return table.data_idx[-1] if table.data_idx else table.first_data - 1
