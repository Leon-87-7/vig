## 1. Segmented tabs line breaks on mobile ✅ DONE

The new content-type segmented control (`web/components/feed/filter-bar.tsx`,
`SegmentedTabs`) overflows awkwardly on small screens,making a horizontal scroll.

**Wanted:** on small screens, render the tabs as separate tab buttons (stacked
or wrapped individual buttons) instead of one continuous segmented line.
with out the motion on hover. (just as it was pre-`SegmentedTabs`).

## 2. Tag creation modal not responsive ✅ DONE

The create-tag modal (`web/components/TagPicker.tsx`, `CreateTagModal`) and the `TagForm`, `web\app\(dashboard)\controls\page.tsx` don't adapt to small screens — the Name/Meaning row and the 9-column color grid don't
fit well on narrow viewports.

**Wanted:** make the create-tag form responsive (stack fields, reflow the color
grid) for small screens.

## 3. Extracted-links table in the Brain page ✅ ISSUED TO GITHUB #238

Surface every link discovered by the enrichment pipelines as a deduplicated
table in the dashboard.

**Data**

- Aggregate the links extracted across **all** pipeline runs (not a single run)
  into a deduplicated set keyed by canonical URL — one row per unique URL.
- Refresh the aggregation on a schedule of **every 6 hours** (reuse the existing
  APScheduler setup; add a job rather than a new scheduler). The table reads the
  last computed snapshot; it is not recomputed on each page load.
- Each row exposes at least: canonical URL, first-seen timestamp, and the count
  of pipeline runs / source videos it appeared in.

**API**

- Add a read endpoint (e.g. `GET /api/links`) returning the deduplicated rows,
  ordered most-recent-first, with pagination.

**UI**

- Add a **"Links"** tab to the Brain page (`web/app/(dashboard)/brain/...`)
  alongside the existing tabs.
- Render the rows in a table; URLs are clickable (open in a new tab,
  `rel="noopener"`). Follow DESIGN.md tokens.

**Open questions** (confirm before building)

- Canonicalization rules for dedupe — strip query params / tracking params, or
  exact-match only?
- Where are extracted links currently persisted (which table/column), or does
  this need a new store?

## 5. Reconcile the export-isolation PRs (#207, #208) before building on them ✅ DONE

> **Grill together with task 4.** The export gate's `chat_id` ownership model
> determines what a web-submitted job carries — decide both at once.

Both PRs are open against `main` and belong to epic #201 (per-user export
isolation):

- **#207** — docs-only: ADR-0027 (two-phase credential model) + `CONTEXT.md`
  `Operator` term + slices #201 into #202–#206 on the Kanban.
- **#208** — the "now" fix (closes #202): `settings.OPERATOR_CHAT_ID` +
  `export_blocked(chat_id)` gating every Drive/Sheets call site.

**Wanted:** confirm whether either PR needs updates before we merge and build on
them.

- Verify ADR-0027 still matches the intended approach and that #208 actually
  gates **every** Drive/Sheets export call site (cross-check against the
  acceptance list in the PR body).
- Decide merge order, and whether #208 should land **before** task 4 — web
  submissions need a `chat_id`, which is exactly what the gate keys on.
- Sweep any outstanding CodeRabbit / Greptile review comments on both PRs.

**Open questions**

- Does the (intentionally ungated) brain-rebuild aggregate collide with anything
  task 4 introduces?
- Anything in #207's later slices (#204–#206, OAuth) that task 4 should not
  pre-empt?
