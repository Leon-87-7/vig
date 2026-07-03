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

## 7. Better navigation for the Brain "Links" table ✅ ISSUED TO GITHUB #306

`LinksTable` in `web/app/(dashboard)/brain/page.tsx` paginates 25 rows with
Previous/Next only, backed by `GET /api/brain/links` (limit/offset + optional
`q`; response already includes `total`).

**Wanted:** richer navigation than prev/next.

- Page indicator / jump-to-page (using the `total` already returned), a
  selectable page size, and column sorting (Appearances, Last seen).
- Keep DESIGN.md tokens, a sticky header, keyboard operability, and preserve the
  active `q` filter across navigation.

**Open questions**

- Sort server-side (extend the endpoint) or client-side within the current page?
- Mirror the Feed's URL-state pattern (`?type=`) so page/sort are shareable?

**Resolved decisions** (grilled 2026-07-03)

- **Sort/page-size/pager questions were already moot:** `LinksTable` (`web/app/(dashboard)/brain/page.tsx:134-376`)
  already implements everything this brief asked for — server-side sort via `GET /api/brain/links?sort=&order=`
  (`src/api/brain.py:41-48` → `src/brain.py:515-545`), a page-size selector (25/50/100), page indicator +
  jump-to-page, sticky header, and the `q` filter persists across pagination — all backed by a per-chat
  persisted view (`GET`/`PUT /api/brain/links/view`, `brain.py:51-65`). No further work needed on desktop.
- **Re-scoped to the real gap: mobile responsiveness.** Below `sm`, add a `TableCard` stacked-card layout
  (reusing `JobCard`'s visual idiom — `rounded-lg border border-line bg-surface px-4 py-3`) replacing the
  current horizontal-scroll `<table>`. `sm:` and up keeps the existing table unchanged.
- **Entangled with task 10:** `TableCard`'s description line follows task 10's truncation spec (see below).

## 10. Char-count truncation for the links-table description (ui/ux) ✅ ISSUED TO GITHUB #305

In the Brain "Links" table (`web/app/(dashboard)/brain/page.tsx`, `LinksTable`),
each row's URL cell renders the URL string with CSS `truncate` (width-based, so
truncation length floats with container width) plus a secondary `title · topic`
line at `page.tsx:336`. The data comes from `GET /api/brain/links`
(`src/api/brain.py`); rows expose `url`, `title`, `topic` (`LinkRow`, `page.tsx:13`).

**Wanted:** the link's description text truncates at a fixed **40 characters on
mobile, 60 on desktop**.

**UI**

- The cell already uses `font-mono`, so a `ch`-unit cap maps cleanly to character
  count — native approach is `max-w-[40ch] md:max-w-[60ch]` alongside the existing
  `truncate`, rather than slicing strings in JS. Confirm against DESIGN.md tokens;
  keep the full value reachable (e.g. `title` attribute / accessible name) so the
  truncation is presentational only (WCAG-AA).
- Tailwind's default `md:` breakpoint is the mobile/desktop split unless the repo
  uses a different convention.

**Open questions** (resolve in grill)

- Which text is "the description" — the URL string itself (line 330/334), the
  `title · topic` secondary line (line 336), or both? They truncate differently.
- 40/60 **characters** vs. CSS `ch` (advance width of `0`): with `font-mono` these
  are near-identical, but is exact character count required (forcing JS slicing) or
  is `ch` good enough?
- Does the truncated value still need to be fully visible on hover/focus or via the
  row expanding, or is the existing `target=_blank` link enough?

**Resolved decisions** (grilled 2026-07-03)

- **Which text:** the cap applies only to the `title · topic` secondary line (`page.tsx:340`) — not the URL
  itself, which keeps its existing width-based `truncate` and stays reachable via its external-link
  affordance. `title · topic` has no such affordance today, so it needed a real solution (below).
- **Mechanism:** CSS `ch`-based truncation — `max-w-[40ch] md:max-w-[60ch]` alongside the existing
  `truncate` class, not JS string slicing. The row is already `font-mono`, so `ch` (one glyph's advance
  width) is visually exact, not an approximation.
- **Full-text access:** two layers — a native `title="..."` attribute for desktop hover (free, zero JS),
  plus a real expand toggle: wrap the truncated span in a `<button aria-expanded>` that toggles the
  `max-w` cap on click/tap, identical behavior at both breakpoints (not hover-only on desktop and
  tap-only on mobile as two divergent implementations — one shared toggle, `title` layered on top as a
  bonus).
- **Scope:** applies both to the desktop table row (`page.tsx:340`) and task 7's new mobile `TableCard`.

## 15. Sidebar links to Terms & Privacy (one row, between GitHub and Sign out) ✅ ISSUED TO GITHUB #307, #308

The sidebar drawer's footer (`web/components/sidebar.tsx:413-436`) stacks a
GitHub external link (with `GithubIcon`, `sidebar.tsx:414-423`) above the
Sign out form/button (`sidebar.tsx:424-435`, currently text-only, no icon).
The legal pages exist at `/privacy` and `/terms` and are public
(`web/middleware.ts` `PUBLIC_PATHS`), but nothing in the app links to them —
the only reference in `web/` is the middleware constant. The collapsed rail's
footer (`sidebar.tsx:322-352`) shows only GitHub + the expand chevron.

**Wanted:** Terms and Privacy links in the sidebar footer, two buttons
sharing one row, placed between the GitHub link and Sign out, with icon(s).

**UI**

- Insert one row containing two `next/link` entries (`/terms`, `/privacy`) in
  the expanded drawer footer between the GitHub anchor and the sign-out form.
  Internal routes — no `target="_blank"`/`rel` (that's GitHub-only).
- Match the existing footer row idiom: `text-muted`, `hover:bg-raised
hover:text-ink`, `transition-ui`, and the drawer's tabbability pattern
  (`tabIndex={open ? undefined : -1}`).
- Icons come from lucide-react, the icon source for all nav items
  (`sidebar.tsx:7-18`; simple-icons is the GitHub-only exception). Sized
  `h-[18px] w-[18px]` like the rest.
- Real links with accessible names; keyboard operable per the drawer's
  existing focus management. DESIGN.md: no signal orange here — footer rows
  are muted utility.

**Open questions** (resolve in grill)

- "Add an icon to this btn" — which button: each of the two new Terms/Privacy
  buttons, or the Sign out button (currently the only footer row without an
  icon)?
- Do Terms/Privacy also get icon-only entries in the collapsed rail footer
  (with tooltips, like GitHub), or expanded drawer only?
- Row layout: two equal half-width buttons (`grid-cols-2`), or a compact
  inline pair (`Terms · Privacy`) since two half-width rows break the
  footer's full-width-row pattern?
- Icon choice — lucide has no canonical legal glyphs; `ScrollText` for terms
  and `Shield`/`FileText` for privacy, or one shared glyph?

**Resolved decisions** (grilled 2026-07-03)

- **Icons:** `Handshake` (Terms), `ShieldUser` (Privacy) — confirmed present in the installed
  `lucide-react@^1.21.0`.
- **Sign out also gains an icon** (originally out of scope, pulled in during the grill since we were
  already in this file): `LogOut`, placed *after* the "Sign Out" label (reversed from the icon-then-label
  convention every other row uses), colored `text-status-error` (`#f87171`, `tailwind.config.ts:37` —
  reusing the existing red token, same one `ErrorBanner` and the disconnect-failure message already use,
  not a new arbitrary red) and static, not hover-gated.
- **Placement:** expanded drawer only, between GitHub and Sign out. No collapsed-rail entries — unlike
  GitHub, which appears in both states; Terms/Privacy are low-frequency legal links, not a "check this
  out" affordance.
- **Row layout:** `grid-cols-1 sm:grid-cols-2` — stacked full-width rows on mobile, side-by-side one row
  on desktop.

**Bonus — Google-connect row redesign** (`sidebar.tsx:498-545`, from task 17, pulled into this same grill
session since it's adjacent footer real estate): the always-visible "Connected to Google" text + text
Disconnect button (which wraps awkwardly in the 224px drawer) is replaced with a compact one-liner —
`[avatar] Name  [Google glyph] · [Unplug icon]`. The Google glyph communicates connection state via
**shape**, not color alone (filled = connected, outline + muted = disconnected — satisfies WCAG 1.4.1,
since the collapsed rail's existing color-only + tooltip pattern doesn't). The `Unplug` icon replaces the
text Disconnect button (muted, red on hover; same `window.confirm()` flow as before, unchanged). The full
"Connected to Google" text moves into a tooltip on the glyph — hover on desktop; tappable on mobile,
which needs new plumbing since the existing `Tooltip` component (`web/components/ui/tooltip.tsx`, wraps
`@radix-ui/react-tooltip`) is hover/focus-only by design and doesn't open on touch — either a
controlled-`open` state driven by a tap handler, or swapping this one instance to Radix `Popover`.
A visual prototype comparing 4 layout options was reviewed live in this session; option D (shape-coded
glyph + tooltip + Unplug icon) was selected.

## 17. Persistent account/status affordance — Google connection state + Telegram identity ✅ DONE — issued #292–#295, merged PR #296

The Feed page (`web/app/(dashboard)/page.tsx:167-176`) renders a "Connect Google" panel
unconditionally — hardcoded `<h2>Connect Google</h2>` plus an `/api/google/connect` link — with no
fetch of `GET /api/google/status` (`src/api/google_oauth.py:96`, returns `{"connected": bool}`)
anywhere in `web/`. The OAuth callback (`google_oauth_callback`, `google_oauth.py:60`) redirects to
`/?google=connected` or `/?google=denied` on completion, but nothing in `web/` reads that
`?google=` param, so a successful connect silently lands back on a page that still says "Connect
Google." Session identity (`first_name`, `username`, `photo_url`) is already available via
`GET /api/auth/me` (`src/api/auth.py:138`) and is already fetched once by `InviteGate`
(`web/components/invite-gate.tsx:164`) for approval-gating — but it stays in that component's local
state (its `InviteUser` type doesn't even include `photo_url`) and nothing downstream, including
`web/components/sidebar.tsx`, surfaces it.

**Wanted:** a persistent affordance showing who's signed in (Telegram avatar/name) and whether
Google export is connected, with connect/disconnect actions, and a one-time success/denied message
on OAuth return instead of a page that looks stuck.

**Backend**

- None needed — `GET /api/google/status`, `POST /api/google/disconnect`
  (`google_oauth.py:96,102`) and `GET /api/auth/me` (`auth.py:138`) already cover status,
  disconnect, and identity.

**UI**

- Feed panel (`page.tsx:167-176`): fetch `/api/google/status` on mount; when `connected: true`,
  swap the "Connect Google" CTA for a connected state + a disconnect action
  (`POST /api/google/disconnect`).
- Read `?google=connected`/`?google=denied` via `useSearchParams` (already imported, `page.tsx:7`),
  show a one-time toast/banner, then strip the param with `router.replace` so a refresh doesn't
  re-trigger it.
- Identity affordance: reuse the `/api/auth/me` fetch `InviteGate` already performs instead of
  adding a second one — lift it into context `InviteGate` provides to children, or a sibling hook
  both consume (reuse, don't fork). Render name + `photo_url` in `sidebar.tsx`'s footer (same
  drawer area as the GitHub/Sign out rows, `sidebar.tsx:413-436`), matching that area's muted
  footer-row idiom per DESIGN.md.

**Resolved decisions** (grilled 2026-07-02 — terms captured in CONTEXT.md: Session identity,
Google connection, Account affordance)

- **Placement:** sidebar footer is the persistent home (identity + Google state, visible
  everywhere). The Feed's "Connect Google" panel becomes a **disconnected-only nudge** — renders
  only while disconnected, disappears once connected. Not a second source of truth.
- **Identity plumbing:** `InviteGate` exposes the user it already fetches via a session-user
  context + `useSessionUser()` hook (its `InviteUser` type gains `photo_url`, already in the API
  response). No second `/api/auth/me` fetch.
- **Google status state:** one shared provider in the dashboard layout —
  `{ connected, disconnect, refresh }` — consumed by both the sidebar and the Feed nudge, so
  connect/disconnect updates every surface instantly.
- **Footer layout:** expanded drawer = one row, avatar + first_name/username, with a simple-icons
  Google mark next to the name; "Connected to Google" in **Google brand blue `#4285F4`** (new
  deliberate off-system token — not signal orange, not the status ramp) and a muted Disconnect
  action. Collapsed rail = avatar only, static brand-blue glow when connected, tooltip carries
  name + connection state.
- **Disconnect UX:** `window.confirm` first (repo precedent: space delete), then POST with a
  'Disconnecting…' disabled state and a visible failure message on error.
- **OAuth return:** handled on the Feed page — `useSearchParams` reads `?google=connected|denied`,
  renders a one-time **inline banner** (no toast system exists), strips the param with
  `router.replace`. No task-14 dependency: if `/` stops meaning Feed, the backend redirect
  constant moves then (one line).

## 18. Job details page — previous/next navigation buttons ✅ ISSUED TO GITHUB #309

The job details page (`web/app/(dashboard)/jobs/[id]/page.tsx:237`, `JobDetailPage`) fetches a
single job by id via `useJobDetail` (`web/lib/hooks/useJobDetail.ts:31-34` → `GET /api/jobs/{job_id}`,
`src/api/jobs.py:421-427`). There is no concept of a job's neighbors anywhere today. The only
ordered job listing is `GET /api/jobs` (`src/api/jobs.py:213-278`): paginated, scoped to the
caller's `chat_id`, `ORDER BY created_at DESC`, optionally filtered by `content_type`/`status`. No
prev/next pager UI exists elsewhere in `web/` to reuse (`SegmentedTabs`,
`web/components/filter-bar.tsx:37-113`, is a tab switcher, not a pager).

**Wanted:** from the job details page, step to the adjacent job (by whatever ordering makes sense)
without going back to the Feed.

**Backend**

- No endpoint returns "the job before/after this one." Either the client derives neighbors from an
  already-fetched `GET /api/jobs` page (works only if the Feed's list is still in memory/cache when
  navigating in), or a new lookup is added (e.g. `GET /api/jobs/{job_id}/adjacent` using the same
  `chat_id` + `created_at` ordering as the list endpoint) that works from a cold page load /
  direct link too.

**UI**

- `JobHeader` (`web/app/(dashboard)/jobs/[id]/page.tsx:187-221`) already carries the "Back to feed"
  link (`page.tsx:193-198`) and the badge row (`page.tsx:201-204`) — the natural slot for
  prev/next controls.

**Open questions** (resolve in grill)

- What defines "adjacent" — global `created_at` order across all the operator's jobs, or scoped to
  whatever filter (content_type/status/search) was active on the Feed when the operator navigated
  in? The two give different answers and the backend doesn't distinguish them today.
  If filter-scoped, does navigating to a job by direct link (no Feed context) fall back to the
  unfiltered order, or show no prev/next at all?
- Cold load (direct link / refresh) vs. arriving from the Feed: is a dedicated `/adjacent` endpoint
  required, or is "only works when you came from the Feed" acceptable for v1?
- Keyboard shortcuts (e.g. `←`/`→`) in addition to buttons?

**Resolved decisions** (grilled 2026-07-03)

- **"Adjacent" definition:** `created_at` order, scoped by the Feed's active `content_type` **and**
  `status` filters (both are cheap equality `WHERE` clauses). The search query `q` is deliberately
  excluded — re-deriving the `LIKE`-based match server-side just to compute two neighbor IDs is real
  extra cost for a much more volatile scope than a stable tab+status combo.
- **Cold load / direct link** (no Feed context to inherit): falls back to unscoped — same as the "All"
  tab with no status filter. `/adjacent` always answers something rather than showing no prev/next.
- **New endpoint:** `GET /api/jobs/{job_id}/adjacent`, reusing the same `content_type`/`status` query
  param shape `GET /api/jobs` already accepts (`src/api/jobs.py:216-217`) — no new param naming.
- **Keyboard shortcuts:** `←`/`→` bound in addition to the buttons, disabled while focus is inside an
  editable field (the annotation textarea from `useJobAnnotation`).

## 20. Feed — a Docs tab that redirects to the Doc Parser page ✅ ISSUED TO GITHUB #310

The Feed's tab row is `SegmentedTabs` (`web/components/filter-bar.tsx:37-113`) driven by
`CONTENT_TYPE_FILTERS` (`web/app/(dashboard)/page.tsx:29-35`: All/Short/Long/Article/Repo) and
gated by `CONTENT_TYPES` (`page.tsx:27`: `{short, long, article, repo}` — **`document` is
deliberately excluded**). Every existing tab calls `onTabChange`, which sets Feed's own
`content_type` filter state and re-queries `GET /api/jobs?content_type=...` in place
(`page.tsx` `FeedPageContent`) — no tab today navigates away from the Feed.

`document` is a real pipeline value (`Pipeline` literal, `src/utils/validators.py:8`, PDF URLs
detected at `validators.py:116-117`) with its own dedicated page: Doc Parser
(`web/app/(dashboard)/doc-parser/page.tsx:72-194`, fetches `content_type=document` jobs
independently) is already a top-level sidebar destination
(`web/components/sidebar.tsx:31`, `{ href: '/doc-parser', label: 'Doc Parser', icon: FileCode2 }`),
separate from the Feed in the sidebar's active-route detection.

**Wanted:** a "Docs" entry in the Feed's tab row that takes the operator to `/doc-parser`, rather
than filtering `document` jobs into the Feed itself.

**UI**

- This is not a filter tab — `SegmentedTabs` (`filter-bar.tsx:37-113`) has every tab call
  `onChange`/`onTabChange` to mutate in-page state; a "Docs" entry needs to `router.push`/navigate
  instead. That's a new interaction mode for `SegmentedTabs`, not just a new entry in
  `CONTENT_TYPE_FILTERS` — the component has no "this tab is a link" concept today.
- Reuse, don't fork: Doc Parser already exists end-to-end (`doc-parser/page.tsx`) — this task is
  purely "make it reachable from the Feed's tab row," not building document display again.

**Open questions** (resolve in grill)

- Does `SegmentedTabs` gain a `href` field per tab (renders that entry as a link styled like the
  others, bypassing `onChange`), or does the Feed special-case `value === 'document'` in its own
  `onTabChange` handler to `router.push('/doc-parser')` instead of setting filter state?
- Visual treatment: does "Docs" sit inside the same segmented control (implying it's a peer
  filter, which it functionally isn't), or as a visually distinct tab-styled link at the end of
  the row (e.g. after a `dividerBefore`, a pattern `FilterTab` already supports,
  `filter-bar.tsx:15`)?
- Is the sidebar's existing "Doc Parser" nav item redundant once this exists, or do both stay (two
  paths to the same page)?

**Resolved decisions** (grilled 2026-07-03)

- **Real navigation, not a fake filter:** `FilterTab` (`filter-bar.tsx:9-16`) gains an optional `href`
  field; `SegmentedTabs` renders that entry as an actual `next/link` styled like the other tabs, instead
  of a `router.push` bolted onto `onTabChange`. Gives native link behavior (cmd/ctrl-click, right-click →
  open in new tab) for free, and it's a reusable addition to the shared component (also used by the
  Brain page's `BRAIN_TABS`, `brain/page.tsx:40-43`).
- **Visual treatment:** `dividerBefore: true` (the existing mechanism built for "fence off a
  differently-behaved option," `filter-bar.tsx:15`) separates Docs from the real filter tabs. It never
  renders in the "active" signal-orange state, since its value never matches Feed's `content_type`
  filter state — that's a free, correct signal that it goes elsewhere.
- **Icon:** reuse `FileCode2` — the exact icon the sidebar's "Doc Parser" nav item already uses
  (`sidebar.tsx:31`) — for recognizability, visually tying the tab to the same destination. (`SegmentedTabs`
  gains an icon slot alongside the new `href` field, since it only rendered label + count/badge before,
  `filter-bar.tsx:95-106`.)
- **Sidebar nav item stays** — both paths coexist. The sidebar entry is the persistent, page-independent
  path; the Feed tab is a contextual shortcut for someone already browsing jobs. Same dual-presence
  precedent as GitHub (collapsed rail + expanded drawer).
