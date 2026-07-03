# vig — Feature ideation & task briefs

Canonical home for feature ideas, from one-line spark to grill-ready brief.

**How this file works**

1. **Dump** raw one-line ideas under `## Inbox` below — no structure needed.
2. Run **`/pre-grill`** — it grounds each one-liner in the real code, fattens it
   into a technical brief (Context · Wanted · Scope · Open questions), moves it
   into `## Briefs`, and clears it from the Inbox.
3. **Grill** the briefed tasks (`/grill-with-docs`, `/grill-with-search-docs`,
   or `/grilling`) to resolve the Open questions, then `/to-issue-kanban` or
   `/spec-to-kanban`.

Status markers on a brief: `✅ DONE` · `✅ ISSUED #NNN`. `/pre-grill` never
fattens a marked task. Once marked, `/pre-grill --mark-a`/`--archive` moves
its body to `docs/archive/TASK-archive.md`, leaving the title behind here.

---

## Inbox

_Raw one-line ideas go here. `/pre-grill` consumes them._

<!-- - e.g. the feed should have a saved-filters dropdown -->

---

## Briefs

## 1. Segmented tabs line breaks on mobile ✅ DONE

## 2. Tag creation modal not responsive ✅ DONE

## 3. Extracted-links table in the Brain page ✅ ISSUED TO GITHUB #238

## 4. Dashboard URL submission — a second ingest surface

> **Grill together with task 9.** Both add a new caller of the create-job +
> enqueue core: task 4 from the web surface, task 9 from the post-enrichment
> repo follow-up. Decide the shape of the one shared service so neither forks it.

Today URLs only enter through the Telegram webhook
(`src/telegram/webhook.py`). PRODUCT.md calls for the operator to drive the
pipeline from the dashboard too ("submitting URLs, triggering and re-running
jobs … without leaving the dashboard").

**Wanted:** let the operator submit a URL from the web UI and get the same job
the Telegram path produces — including the per-template behavior exposed by the
slash commands (`/method`, `/review`, `/technical`, `/narrative`, `/summary`,
and `/freestyle`).

**Backend**

- Add a write endpoint (e.g. `POST /api/jobs`, in `src/api/jobs.py`) that
  classifies the URL with `detect_pipeline()` (`src/utils/validators.py`),
  creates the job row, and enqueues the worker task.
- **Reuse, don't fork:** the create-job + enqueue core currently lives inside
  `webhook.py`'s handlers (the `content_type` + `template` + `_task_for(...)`
  path). Extract it into a shared function/service so the Telegram and web
  surfaces share one code path and can't drift.
- Templates come from `PROMPT_TEMPLATES` (`src/templates.py`); accept an optional
  `template` field. Reject `rejected`/unsupported URLs with the same semantics
  the bot uses.

**UI**

- Add a submit control to the Feed page (`web/app/(dashboard)/page.tsx`): a URL
  input plus a template selector mirroring the slash commands. Follow DESIGN.md
  tokens (signal orange on the submit action only). New job should surface in the
  Feed (prepend / refetch).

**Open questions** (resolve in grill)

- Is `/freestyle` (custom prompt) in scope for v1, or templates-only?
- Ownership: what `chat_id` does a web-submitted job carry, and how does that
  interact with the `OPERATOR_CHAT_ID` export gate (#202 / #208, see task 5)?
- All pipelines (short/long/article/repo/document) on day one, or videos first?
- Optimistic insert vs. wait-for-`job_id` before showing the row.

## 5. Reconcile the export-isolation PRs (#207, #208) before building on them ✅ DONE

## 6. Make the web app an installable PWA

Scope is the `web/` Next.js app (app router).

**Wanted:** the dashboard is installable and has an offline app shell.

- Add a web app manifest (name, maskable icons, `theme_color`/`background_color`
  from DESIGN.md `#0b0c0f` + signal, `display: standalone`) and wire it via
  `web/app/layout.tsx` metadata.
- Add a service worker for installability + offline shell: precache the static
  shell/assets, network-first for `/api/*` so live data isn't served stale.
- Provide the required icon set (incl. maskable).

**Open questions**

- Offline scope: installable shell only, or also cache last Feed/Brain payloads
  for offline read?
- Hand-rolled SW vs. a dependency (`next-pwa`/Workbox) — prefer the minimum that
  makes it installable.
- Are web push notifications in scope, or explicitly out for now?

## 7. Better navigation for the Brain "Links" table

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

## 8. Controls UI on the Brain search graph

`web/components/brain-graph.tsx` renders `react-force-graph-2d` from
`/api/brain/graph`, highlighting search matches in signal orange. There are no
user-facing controls today (no zoom, recenter, or filtering).

**Wanted:** an on-canvas controls overlay for navigating the graph.

- Zoom in/out, zoom-to-fit, and recenter via the ForceGraph ref methods
  (`zoom()`, `zoomToFit()`, `centerAt()` — source cached at the
  `react-force-graph-2d` opensrc path in CLAUDE.md).
- Consider a topic legend/filter (toggle topics on/off) and focus-on-match
  (center + zoom the matched node when a search runs).
- Ghost-style controls, signal orange only on the active control; honor
  `prefers-reduced-motion`; DESIGN.md tokens.

**Open questions**

- v1 scope: zoom/fit/recenter only, or also topic filtering and
  node-detail-on-click?
- Touch/mobile gestures alongside buttons?
- Is a fullscreen/expand mode wanted?

## 9. Offer extracted GitHub repos as a follow-up repo analysis

> **Grill together with task 4.** This is a third caller of the create-job +
> enqueue core (alongside the Telegram webhook and task 4's web surface). Settle
> the shared service shape so the repo follow-up reuses it instead of forking.

When a short-form video finishes, enrichment (`src/processors/enrichment.py`,
`enrich`) returns `tools_raw` — a list of `{name, type, url, description}` where
`type` can be `"repo"`. Today those repo URLs are surfaced in the result text
only; nothing offers to analyze them. The repo pipeline already exists end to
end: `detect_pipeline()` (`src/utils/validators.py`) classifies
`github.com/{org}/{repo}` as `"repo"`, and `_route_repo` /
`_enqueue_simple_job` (`src/telegram/webhook.py`) create + enqueue a `"repo"`
job processed by `enrich_repo` (`src/services/github.py`).

**Wanted:** after a short video is processed, if its enrichment yielded one or
more GitHub repos, the bot prompts the operator to pick which repo(s) to analyze
next, and enqueues a repo job for each chosen one.

**Backend**

- In the short pipeline (`src/processors/short_video.py`), after enrichment,
  collect candidate repo URLs from `tools_raw` and present them via the existing
  inline-keyboard machinery (`send_inline_keyboard` + `CallbackCtx` /
  `_handle_callback` / `answer_callback_query`, `src/telegram/sender.py` +
  `webhook.py`). Validate each candidate with `detect_pipeline()` /
  `normalize_repo_url` before offering it.
- On selection, **reuse, don't fork** the repo create+enqueue path that
  `_route_repo` already drives — route the chosen URL(s) through the same shared
  service task 4 extracts, not a parallel copy.
- The spawned repo job inherits the same `chat_id`; honor the existing
  recent-job cache (`database.find_recent_job_by_url`) so an already-analyzed
  repo isn't re-queued.

**Open questions** (resolve in grill)

- Multi-select on a Telegram inline keyboard is not native (one tap = one
  callback). Toggle-state checkboxes + a "Confirm" button (re-render the keyboard
  per tap), or one tap = enqueue that repo immediately and allow repeated taps?
- Which `tools_raw` entries qualify — only `type == "repo"`, or any entry whose
  `url` `detect_pipeline()` resolves to `"repo"` (Gemini sometimes labels a repo
  as `"library"`)?
- Cap on how many repo buttons to show when enrichment returns many; dedupe by
  normalized URL.
- Scope to the short pipeline only (as asked), or also offer this after long /
  article jobs that extract repos?
- Encoding selected repos in callback data given Telegram's 64-byte limit — index
  into a cached candidate list, or pack the URL?

## 10. Char-count truncation for the links-table description (ui/ux)

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

## 11. Tags should follow the URL, not the job (many-to-many)

Tags today attach to **jobs**: the `job_tags` join table
(`src/database.py:205`, `job_id ↔ tag_id`, issue #88 / S5) keyed off a single job,
with the `tags` vocabulary in the `tags` table (`src/database.py:171`, issue #87).
The links table (`src/brain.py`, `ingest_links` / the `links` table at
`src/database.py:151`) is already deduplicated by canonical `url` — one row per
unique URL — and the same URL can surface across many jobs. So a tag pinned to a
job can't express "this URL is ui/ux" once that URL recurs in other jobs.

**Wanted:** model tags as following the canonical URL (many-to-many URL ↔ tag),
independent of how many jobs a URL appears in.

**Data**

- A URL appears in many jobs and a job extracts many URLs (many-to-many);
  `links.url` is the stable key. Tagging at the URL level needs a `link_tags`
  (`url`/`link_id ↔ tag_id`) join rather than overloading `job_tags`.
- **Reuse, don't fork:** the `tags` vocabulary table and `TagPicker`
  (`web/components/TagPicker.tsx`) already exist — reuse the vocabulary; only the
  _attachment_ target changes from job to URL.

**Open questions** (resolve in grill)

- Does this **replace** job-level tagging (`job_tags`) or coexist with it? If both,
  what's the relationship when a job's tag and its URL's tag disagree?
- Key the join on `links.id` or on canonical `url`? (Dedup canonicalization rules
  here echo task 3's open question — same canonical form must be used.)
- Surface/edit URL tags where: the Brain Links table (new column / `TagPicker`
  inline), the existing controls page, or both?
- Migration: do existing `job_tags` rows get projected onto their URLs, or do URL
  tags start empty?

## 12. Repalette: new signal orange + dark plate tokens

The design tokens have a single source: `web/tailwind.config.ts` defines
`signal.DEFAULT: '#f6921e'` plus the cool plate ladder `canvas: '#0b0c0f'` →
`surface: '#14161a'` → `raised: '#1c1f25'` (`tailwind.config.ts:12-27`). The same
values are normative in `DESIGN.md`'s frontmatter, and the ~39 `web/` consumers
use Tailwind classes (`bg-signal`, `text-signal`, `bg-canvas`…), so they inherit
the change without edits. `DESIGN.md` also pins a derived signal ramp:
`signal-bright #ffa83d`, `signal-deep #b96a06`, `onsignal #16100a`.

**Wanted:** the signal color becomes `#FFBE0B` and "the dark color" becomes
`#2A2312`, applied at the token source so the whole console repalettes.

**UI / Design tokens**

- Update `web/tailwind.config.ts` and mirror into `DESIGN.md`'s frontmatter
  (normative per CLAUDE.md) — one change at the source, not per-component.
- DESIGN.md prose hardcodes the hexes in many places (the Signal Rule, button
  specs, plate-ladder descriptions); those references and any logo SVGs under
  `web/images/` / `web/public/images/` that bake in the orange need a sweep too.

**Open questions** (resolve in grill)

- "The dark color" is ambiguous — the plate ladder is three cool darks
  (`canvas`/`surface`/`raised`). Does `#2A2312` replace `canvas` (the page floor),
  the whole ladder (re-derive all three), or a specific plate?
- `#2A2312` is a **warm** near-black (yellow/red cast), which breaks DESIGN.md's
  stated "cool near-black chassis" identity. Intended pivot to a warm chassis, or
  should the cool ladder stay and only the signal change?
- `#FFBE0B` is brighter/yellower than `#f6921e` — does the derived ramp
  (`signal-bright`, `signal-deep`, `onsignal`) get recomputed around it? The
  "dark-on-orange ≥7:1" contrast (`onsignal #16100a`) and WCAG-AA bar must be
  re-verified against the new hue.
- Does `#FFBE0B` collide with the **pending-yellow** status hue? The Signal Rule
  forbids signal and pending-yellow trading places — a yellower signal narrows
  that gap.

## 13. Brand the /privacy and /terms pages

> **Grill together with task 14.** Both reuse the login page's
> background+logo treatment — a public home page makes it four consumers, so
> the "extract `<BrandBackground>` or duplicate once more" call must be made
> once, for both.

The two legal pages (`web/app/privacy/page.tsx`, `web/app/terms/page.tsx`, added
for OAuth verification, issue #203) are plain `prose prose-invert` text blocks on
bare `bg-canvas` — no background art, no logo, no plate. By contrast
`web/app/login/page.tsx` (the other unauthenticated page, exempted in
`web/middleware.ts`'s `PUBLIC_PATHS` alongside `/privacy`/`/terms`) renders the
`/backgrounds/layered-waves-log.svg` waves image with a fade mask + opacity/
saturation treatment, plus the `vig_logo_lockup.svg` lockup. The authenticated
dashboard instead uses per-route `PageBackground` (`web/components/page-background.tsx`)
webp images layered under a radial + linear gradient — a different pattern, built
for the sidebar-having dashboard shell, not a standalone page.

**Wanted:** `/privacy` and `/terms` look on-brand instead of like an unstyled
document — reuse the login page's background/brand treatment rather than
inventing a third pattern.

**UI**

- Reuse the `layered-waves-log.svg` background + fade-mask/opacity treatment
  from `login/page.tsx:56-68`. Since it would now back three pages, factor it
  into a shared piece (component or small snippet) rather than copy-pasting the
  `<img>` + className block a third time — reuse, don't fork.
- Reuse the `vig_logo_lockup.svg` brand mark the same way `login/page.tsx` does.
- The legal copy itself (long-form text) likely wants a `bg-surface`/`bg-raised`
  plate card wrapping the `prose prose-invert` block so it reads as a panel
  sitting on the dark-plate-ladder chassis, rather than text floating directly
  over the background image — consistent with DESIGN.md's plate-ladder identity.
- Keep the existing `max-w-2xl` reading width and `text-ink`/`text-muted` tokens.

**Open questions** (resolve in grill)

- Extract the background+logo block into a shared component (e.g.
  `<BrandBackground>`) now that three pages use it, or is duplicating it once
  more acceptable until a fourth page shows up?
- Does the legal text sit inside a `surface`/`raised` plate card, or directly on
  the background like the login page's logo/CTA do?
- Any navigation back to `/login` or the dashboard from these pages, or are they
  meant to be dead-end pages a cold visitor (e.g. a Google reviewer) lands on
  directly?
- Same logo treatment as login (full lockup), or a smaller/plainer mark since
  these are read-only legal pages, not a branded entry moment?

## 14. Public home page — fix Google OAuth branding verification rejection

> **Grill together with task 13.** Both reuse the login page's
> background+logo treatment — a public home page makes it four consumers, so
> the "extract `<BrandBackground>` or duplicate once more" call must be made
> once, for both.

Google rejected the OAuth app's branding verification (the consent-screen
review tracked in issue #203, epic #201): the submitted homepage must be
reachable without login and represent the app. Today there is no such page —
`/` is the authenticated Feed (`web/app/(dashboard)/page.tsx`), and
`web/middleware.ts` (`PUBLIC_PATHS = ["/login", "/logout", "/privacy",
"/terms"]`) 307s every logged-out visit to `/login`, which renders only the
`vig_logo_lockup.svg`, one tagline line, and the Telegram login widget
(`web/app/login/page.tsx:70-88`) — it does not explain what VIG does.

**Wanted:** a public, on-brand home page that renders without login, acts as
the face of the project (visuals + brand feel), and explains VIG's purpose —
satisfying Google's homepage requirements so branding verification passes.

**UI**

- **Reuse, don't fork:** the brand treatment already exists on
  `login/page.tsx:56-77` — `layered-waves-log.svg` with the fade-mask/opacity
  treatment plus the `vig_logo_lockup.svg` lockup. Task 13 already asks
  whether to extract this into a shared `<BrandBackground>`; a fourth consumer
  answers it — settle in the joint grill.
- New public route registered in `web/middleware.ts` `PUBLIC_PATHS` (or `/`
  itself goes public — see open question). If `/` changes meaning, the
  sidebar's Feed link and `isActive` special-case for `/`
  (`web/components/sidebar.tsx:27-34,180-184`) are the touchpoints.
- Content must cover Google's branding checklist: what the app does, app
  identity matching the consent screen, and a visible link to `/privacy` (and
  `/terms`) on the same domain (`web/app/privacy/page.tsx`,
  `web/app/terms/page.tsx` already exist and are public).
- DESIGN.md is normative: dark plate ladder, signal orange rationed to the
  single primary CTA (sign in / open console), JetBrains Mono for machine
  facts, WCAG-AA contrast, `prefers-reduced-motion` honored for any hero
  motion.

**Open questions** (resolve in grill)

- Where does the landing live: `/` becomes public (Feed moves to `/feed`, or
  `/` renders landing vs. Feed conditionally on the `vig_session` cookie), or
  a separate path (e.g. `/home`) with that URL submitted to Google as the
  homepage? The middleware matcher and sidebar `isActive('/')` both hinge on
  this.
- How much content is "the face of the project": logo + purpose paragraph +
  legal links + sign-in CTA only, or also a feature overview of the pipelines
  / dashboard screenshots?
- What does a logged-in operator see at the landing URL — auto-forward to the
  Feed, or the landing with an "open console" CTA?
- Does Google's sensitive-scope disclosure (how the app uses Google user
  data / Limited Use statement) need to appear on the homepage itself, or is
  the `/privacy` link sufficient for the branding review?
- Does `/login` itself also gain the purpose copy, or does it stay minimal
  once the landing page exists upstream of it?

## 15. Sidebar links to Terms & Privacy (one row, between GitHub and Sign out)

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

## 16. Link pipeline — bare URLs get a native Telegram preview + a Brain Links row

`detect_pipeline` (`src/utils/validators.py:50`) only recognizes short/long/article/repo/document
(`Pipeline = Literal[...]`, `validators.py:8`) — anything else is `"rejected"`, and `_route_url`
(`src/telegram/webhook.py:1348`) sends every rejected URL straight to `_reject_url`
(`webhook.py:1274`): a canned "Unsupported URL" reply, no job, no persistence. Meanwhile the
`links` table (`src/database.py:151`) and `ingest_links` (`src/brain.py:282`) already do exactly
"capture a URL, dedupe by canonical URL, store title/topic" — but today only get fed from
enrichment output, 5 callers all in `src/processors/article.py` and `src/processors/prd.py`,
never from a raw user-pasted link.

**Wanted:** sending a bare URL that isn't a video/article/repo/document gets a native Telegram
link-preview card in reply and a row in the Brain Links table on the dashboard — capture only, no
enrichment job.

**Backend**

- Extend `Pipeline` (`validators.py:8`) with a new value (e.g. `"link"`), or repurpose part of the
  current `"rejected"` tail of `detect_pipeline` (`validators.py:73-100`) — decide which URLs move
  from rejected to accepted (see Open questions).
- New branch in `_route_url` (`webhook.py:1348`) beside `_route_document_url`/`_route_article`/
  `_route_repo` that calls `ingest_links` (`src/brain.py:282`) with a single-item list, then
  replies via `send_message` (`src/telegram/sender.py:101`) with the raw URL as the message text —
  no caller currently sets `disable_web_page_preview`, so Telegram's default native preview card is
  the off-the-shelf behavior here; no custom preview rendering needed.
- `ingest_links` requires `topic` and `source_job_id` (used to look up the source job's URL for the
  Obsidian `.md`, `_get_source_job_info`, `brain.py:423`) — a bare link has neither. Resolve before
  wiring the call (see Open questions).

**UI**

- No new component: `LinksTable` (`web/app/(dashboard)/brain/page.tsx`) and `GET /api/brain/links`
  (`src/api/brain.py`) already render the `links` table as-is. Confirm whatever `topic`/`title`
  Backend resolves for link-only rows doesn't break that table's existing display assumptions.

**Open questions** (resolve in grill)

- Scope: every URL `detect_pipeline` currently rejects, or a narrower class (exclude bare domains,
  search-result URLs, non-http schemes)?
- What populates `ingest_links`'s `topic` and `source_job_id` for a link with no enrichment job —
  empty/placeholder topic, a lightweight job row created just to anchor `source_job_id`, or does
  `ingest_links`/`_build_obsidian_md` get adapted to tolerate a missing source job?
- Precedence: if a pasted URL also matches an allowlisted article domain, does full article
  enrichment still win, or does "just save + preview" only apply when nothing else claims the URL?
- Spam/dedup: does this need the same recent-submission guard other pipelines get
  (`find_recent_job_by_url`), scoped to `links.url` instead of `jobs`?

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

## 18. Job details page — previous/next navigation buttons

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

## 19. Delete button for jobs — DB + Telegram message, with confirm/"don't show again", swipe-to-delete on mobile

> Touches the same job-card real estate as task 7's dense-table thinking and task 11's per-URL
> tagging — no shared decision, just adjacent surface area.

Jobs render as cards in two places: `JobCard` (`web/components/job-card.tsx:22-51`, Feed's list
view) and `PreviewCard` (`web/components/feed/preview-card.tsx:53-119`, Feed's grid view via
`PreviewGrid`, `web/components/feed/preview-grid.tsx`), plus the full job details page
(`web/app/(dashboard)/jobs/[id]/page.tsx`). Both card components already carry a
`pointer-events-auto` overlay island for `JobCardTags` (`job-card.tsx:45-47`,
`preview-card.tsx:109-114`) sitting above a full-card `<Link>` overlay (`job-card.tsx:30`,
`preview-card.tsx:75-79`) — the established pattern for "an interactive control on a
whole-card-is-a-link card."

There is **no DELETE endpoint for jobs today** (`src/api/jobs.py` only has
`DELETE /{job_id}/tags/{tag_id}`, line 342-354). The `jobs` table
(`src/database.py:35-92`) has `chat_id` (line 37), `message_id` (line 38, the operator's original
Telegram message) and `bot_message_id` (line 74, the bot's reply) — both are plain `INTEGER`
columns with no Telegram-side deletion ever issued against them. Five child tables cascade on job
delete already (`ON DELETE CASCADE`): `job_thumbnails` (line 99), `job_annotations` (line 220),
`job_tags` (line 227), `space_urls` (line 248), `document_outputs` (line 268) — a `DELETE FROM
jobs WHERE id = ?` is enough on the DB side. `src/telegram/sender.py` has no `deleteMessage` call;
every Bot API call goes through `_post_and_parse` (`sender.py:70-98`), the same helper
`send_message` (`sender.py:101`) uses — a `delete_message(chat_id, message_id)` following that
pattern is the natural way to add it. Auth/ownership for a job lookup already exists via
`get_owned_job` (`src/api/deps.py:7`).

**Wanted:** a delete action reachable from every job instance (Feed row, Feed grid card, job
details page) that removes the job from the DB and deletes its message(s) from the Telegram chat,
gated by a confirm-with-warning that can be dismissed permanently via a "don't show again"
checkbox. Desktop gets a delete control; mobile gets a swipe-left-to-delete gesture instead/in
addition.

**Backend**

- Add `DELETE /api/jobs/{job_id}` to `src/api/jobs.py`, reusing `get_owned_job`
  (`src/api/deps.py:7`) for ownership, then `DELETE FROM jobs WHERE id = ?` (cascades cover the
  five child tables above).
- Add `delete_message(chat_id, message_id)` to `src/telegram/sender.py` following the
  `_post_and_parse` pattern (`sender.py:70-98`, same shape as `send_message`, `sender.py:101`),
  calling it for both `message_id` and `bot_message_id` when present. Telegram's `deleteMessage`
  can fail (message too old, already deleted, etc.) — decide whether that's swallowed (DB delete
  still succeeds) or surfaced.
- **"Don't show again" persistence:** `src/database.py` already has a generic per-chat
  `get_user_setting`/`set_user_setting` (`database.py:1232-1249`, used today for the Brain links
  view and recovery-notification toggle) — reuse that instead of introducing browser
  `localStorage` (grep confirms **no** `localStorage` usage anywhere in `web/` today, so there's no
  existing client-side preference pattern to fork either way).

**UI**

- Desktop: a delete control in the same `pointer-events-auto` overlay slot `JobCardTags` occupies
  on `JobCard`/`PreviewCard`, plus one on the job details page's `JobActionsBar`
  (`page.tsx:223-235`).
- Confirm dialog: the repo's only existing confirm pattern is a bare `window.confirm()`
  (`web/components/sidebar.tsx:290-291`, Google disconnect) — no "don't show again" checkbox
  support in that primitive, so this needs a real dialog (candidate: extend
  `web/components/ExportModal.tsx:38-80`'s focus-trap/Escape pattern rather than forking a new
  one).
- Mobile swipe-left: **no gesture library is installed** (`web/package.json` has no
  framer-motion/react-use-gesture/similar) — this is native touch-event handling (`touchstart`/
  `touchmove`/`touchend`) or a new dependency, not a drop-in.

**Open questions** (resolve in grill)

- Swipe-left reveals what — an inline delete button (still confirmed), or does the swipe itself
  trigger the confirm dialog directly?
- Does "don't show again" skip the dialog for all future job deletes for that chat permanently, or
  is it resettable somewhere (a controls/settings toggle)?
- If `delete_message` fails against Telegram (message already gone, >48h old, etc.), does the DB
  delete proceed anyway, or does the whole operation fail and roll back?
- Any distinction between deleting from the details page (single job, full-page context) vs. a
  card in a list (row disappears from an in-memory list) — does the Feed need an optimistic
  removal + undo, or is a hard confirm-then-gone sufficient?

## 20. Feed — a Docs tab that redirects to the Doc Parser page

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
