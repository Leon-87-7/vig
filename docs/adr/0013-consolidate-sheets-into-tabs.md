---
adr: "0013"
title: Consolidate three Google Spreadsheet IDs into one workbook with named tabs
status: accepted
date: 2026-05-28
---

## Context

Until now vig wrote to three separate Google Spreadsheets, identified by
three environment variables read in `src/services/sheets.py`:

- `GOOGLE_SHEETS_ID_SHORT` — short-video enrichment rows
- `GOOGLE_SHEETS_ID_LONG`  — long-video transcript + enrichment rows
- `GOOGLE_SHEETS_ID_PRD`   — mini-PRD generation rows

Each `append_*_row` function in `sheets.py` called the same `_append_sync`
helper with a different spreadsheet ID and a hardcoded `range="A1"` — which
in Sheets v4 silently resolves to the first tab of whatever workbook is
referenced. The split was a path-of-least-resistance artifact from the
original n8n migration; nothing about the data model required separate
workbooks.

The article URL feature ([postgrill spec](../features/postgrill/article-url-feature.md))
adds a fourth content domain (`Article Analysis`). At the same time the
operator (sole user today) had already manually consolidated everything into
a single Google Sheet with four explicit tabs:

```
[ YouTube Transcript Index ] [ Short Video Analysis ] [ Article Analysis ] [ mini PRD ]
```

The code's three-ID model is now out of sync with the physical sheet.

## Decision

Replace the three `GOOGLE_SHEETS_ID_*` environment variables with a single
`GOOGLE_SHEETS_ID`. `_append_sync` gains a `tab_name` parameter and routes
writes via tab-qualified A1 notation:

```python
def _append_sync(tab_name: str, values: list) -> None:
    service = _build_service()
    service.spreadsheets().values().append(
        spreadsheetId=settings.GOOGLE_SHEETS_ID,
        range=f"{tab_name}!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [values]},
    ).execute()
```

The four `append_*_row` helpers pass their fixed tab name:

| Helper                | Tab name                  |
| --------------------- | ------------------------- |
| `append_long_row`     | `YouTube Transcript Index`|
| `append_short_row`    | `Short Video Analysis`    |
| `append_article_row`  | `Article Analysis`        |
| `append_prd_row`      | `mini PRD`                |

(The tab `Article Analysis` is the corrected spelling — the pre-existing
sheet had the typo `Artical Analysis`, fixed in the same migration.)

## Rationale

- **One physical workbook is the source of truth.** The operator already
  consolidated; the code is the laggard. Continuing with three IDs forces
  the operator to remember which env var maps to which tab, and any new
  domain (Article) requires inventing a new env var for what is really a
  new tab.
- **Tab-named ranges are a documented, stable v4 API contract.**
  `range="<tab>!A1"` is exactly how the Sheets API expects targeted writes.
  No workaround is needed.
- **Smaller blast radius for permissions and quota.** A single spreadsheet
  ID means one Drive ACL to manage and one document against the per-document
  Sheets API quota — both of which were spread thin across three IDs before.
- **Eliminates a config footgun.** With three IDs it was possible to point
  two env vars at the same spreadsheet by mistake (both writing into tab 1)
  with no error. After the change, the spreadsheet ID is a single value;
  cross-tab routing is enforced in code, not configuration.

The alternative considered was *keeping three env vars* and treating the
consolidation as an operator-side organizational choice (i.e., letting all
three env vars resolve to the same spreadsheet ID). That was rejected because
each `append_*_row` would still write to "tab 1" via `range="A1"` — meaning
all four data domains would land in whichever tab happens to be first,
clobbering each other. The physical consolidation only works if the code
addresses tabs by name.

## Trade-offs

- **One-time migration cost.** Every existing deployment must replace three
  env vars with one and confirm the four tab names match exactly. Tab names
  with spaces require the `"<name>!A1"` quoting (which the Sheets API
  handles transparently) — they do not need escaping in code beyond the
  format string.
- **Tab renames become breaking changes.** Renaming `Article Analysis` to
  `Articles` on the operator side will silently 404 the next write. Tab
  names are now a code constant, not free-form metadata. Documented here
  so future operators know.
- **Single-spreadsheet sharing.** Granting read access to one domain (e.g.
  "show me the PRD log") now grants read access to all four tabs unless
  the operator uses per-tab protections. Acceptable for a single-operator
  deployment; flagged here in case the bot ever gets multi-tenant.

## Consequences

- `src/config.py`: `GOOGLE_SHEETS_ID_SHORT` / `_LONG` / `_PRD` removed;
  `GOOGLE_SHEETS_ID` added.
- `src/services/sheets.py`: `_append_sync(tab_name, values)` signature
  change; all four `append_*_row` helpers updated; new
  `append_article_row(job, *, domain)` added.
- `.env.example` / `docs/seed/TECHSTACK.md` updated to reflect the single
  env var.
- The pre-existing `Artical Analysis` tab is renamed to `Article Analysis`
  before the code lands (operator-side action, captured in the migration
  checklist in the article-url-feature spec).
