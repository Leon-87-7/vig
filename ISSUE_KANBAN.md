# Issue Kanban

> Read-only snapshot — authoritative state lives on [GitHub Issues](https://github.com/Leon-87-7/vig/issues).\
> Update this file whenever an issue moves columns.

---

## Done

|                                                   # | Title                                                                                                      | Area                     | Notes                                                                                     |
| --------------------------------------------------: | ---------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| [#238](https://github.com/Leon-87-7/vig/issues/238) | Extracted-links table on the Brain page (deduplicated, paginated)                                          | Web / Brain              | Merged; PR #239; closed on GH                                                             |
| [#202](https://github.com/Leon-87-7/vig/issues/202) | feat(config): operator-only export gate (per-user isolation, the #201 'now' fix)                           | Multi-tenancy            | Merged; PR #208; closed on GH                                                             |
| [#234](https://github.com/Leon-87-7/vig/issues/234) | Replace raw logout API response with dedicated logout page                                                 | Web / Auth               | Merged; PR #235; closed on GH                                                             |
| [#243](https://github.com/Leon-87-7/vig/issues/243) | Tooltip primitive + first adoption (foundation)                                                            | Web / Tooltips           | Merged; PR #248; closed on GH                                                             |
| [#244](https://github.com/Leon-87-7/vig/issues/244) | Migrate explanatory title= tooltips to Tooltip primitive                                                   | Web / Tooltips           | Merged; PR #248; closed on GH                                                             |
| [#245](https://github.com/Leon-87-7/vig/issues/245) | Migrate overflow-reveal title= tooltips (mono variant)                                                     | Web / Tooltips           | Merged; PR #248; closed on GH                                                             |
| [#246](https://github.com/Leon-87-7/vig/issues/246) | Add tooltips to icon-only controls                                                                         | Web / Tooltips           | Merged; PR #248; closed on GH                                                             |
| [#247](https://github.com/Leon-87-7/vig/issues/247) | Add tooltips to metric labels in stats-overview                                                            | Web / Tooltips           | Merged; PR #248; closed on GH                                                             |
| [#251](https://github.com/Leon-87-7/vig/issues/251) | Brain Links table: richer navigation + persisted per-tenant view                                           | Web / Brain              | Merged; PR #257; closed on GH                                                             |
| [#252](https://github.com/Leon-87-7/vig/issues/252) | Brain graph on-canvas controls overlay (zoom/fit/recenter + topic filter)                                  | Web / Brain              | Merged; PR #260; closed on GH                                                             |
| [#254](https://github.com/Leon-87-7/vig/issues/254) | feat(db): users email + status columns, awaiting_email state, cutover (invite gate)                        | DB / Access              | Merged; PR #262; closed on GH                                                             |
| [#292](https://github.com/Leon-87-7/vig/issues/292) | feat(web): session-user context — InviteGate exposes identity, sidebar shows avatar + name                 | Web / Account            | Merged; PR #296; closed on GH                                                             |
| [#293](https://github.com/Leon-87-7/vig/issues/293) | feat(web): shared Google-status provider + Feed panel becomes disconnected-only nudge                      | Web / Account            | Merged; PR #296; closed on GH                                                             |
| [#294](https://github.com/Leon-87-7/vig/issues/294) | feat(web): one-time OAuth-return banner on the Feed (?google=connected\|denied)                            | Web / Account            | Merged; PR #296; closed on GH                                                             |
| [#295](https://github.com/Leon-87-7/vig/issues/295) | feat(web): sidebar Google-connection state — brand-blue token, confirm-disconnect, rail glow               | Web / Account            | Merged; PR #296; closed on GH                                                             |

---

## Needs Triage

|                                                   # | Title                                                                                       | Area             | Depends On |
| --------------------------------------------------: | ------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| [#201](https://github.com/Leon-87-7/vig/issues/201) | epic(multi-tenancy): per-user export isolation                                              | Multi-tenancy    | —          |
| [#204](https://github.com/Leon-87-7/vig/issues/204) | feat(oauth): per-user 'Connect Google' (web) — encrypted token store → exports to /vig      | OAuth / Export   | #202, #203 |
| [#205](https://github.com/Leon-87-7/vig/issues/205) | feat(telegram): Mini App 'Connect Google' surface — initData identity, shared OAuth backend | OAuth / Telegram | #204       |
| [#206](https://github.com/Leon-87-7/vig/issues/206) | feat(oauth): connection lifecycle — invalid_grant handling, /disconnect, notify-once        | OAuth / Export   | #204       |
| [#253](https://github.com/Leon-87-7/vig/issues/253) | epic(access): invite-only gate + one-time email onboarding                                  | Access           | —          |
| [#255](https://github.com/Leon-87-7/vig/issues/255) | feat(telegram): first-contact email capture + pending gate + one-tap approve                | Telegram / Access | #254      |
| [#256](https://github.com/Leon-87-7/vig/issues/256) | feat(web): dashboard email modal + /api/* status gate + pending screen                      | Web / Access     | #254       |
| [#276](https://github.com/Leon-87-7/vig/issues/276) | perf(config): move export_blocked's sqlite3 read off the event loop                         | Config           | —          |
| [#277](https://github.com/Leon-87-7/vig/issues/277) | refactor(gemini): delete GeminiClient passthrough shim                                      | Gemini           | —          |
| [#278](https://github.com/Leon-87-7/vig/issues/278) | fix(web): clean up CopyButton's reset timer on unmount (jobs detail)                        | Web              | —          |
| [#279](https://github.com/Leon-87-7/vig/issues/279) | fix(web): surface space-delete failures instead of silently swallowing them                 | Web              | —          |
| [#280](https://github.com/Leon-87-7/vig/issues/280) | fix(web): align Connect Google button with the shared button-signal spec                    | Web              | —          |
| [#281](https://github.com/Leon-87-7/vig/issues/281) | feat(web): add loading skeleton and empty state to Doc Parser page                          | Web              | —          |
| [#283](https://github.com/Leon-87-7/vig/issues/283) | fix(webhook): configurable ADMIN_CONTACT_NAME replaces hardcoded 'Leon' in invite copy       | Access           | —          |
| [#284](https://github.com/Leon-87-7/vig/issues/284) | fix(web): drop decorative signal-orange accents (logout glow, doc-parser Sparkles)           | Web              | —          |
| [#285](https://github.com/Leon-87-7/vig/issues/285) | fix(jina): explicit 30s httpx timeout on fetch_markdown                                      | Jina             | —          |
| [#286](https://github.com/Leon-87-7/vig/issues/286) | chore(jobs): delete unused _DETAIL_FIELDS tuple                                              | API              | —          |
| [#287](https://github.com/Leon-87-7/vig/issues/287) | fix(validators): raise explicit ValueError in normalize_repo_url instead of unguarded IndexError | Validators   | —          |
| [#288](https://github.com/Leon-87-7/vig/issues/288) | fix(web): drop banned uppercase-tracked eyebrow labels per DESIGN.md                          | Web              | —          |
| [#289](https://github.com/Leon-87-7/vig/issues/289) | perf(web): hoist SegmentedTabs/FilterBar tab definitions to stable references                 | Web              | —          |
| [#290](https://github.com/Leon-87-7/vig/issues/290) | fix: retain strong references to fire-and-forget asyncio tasks (prevent mid-run GC)           | Backend          | —          |
| [#291](https://github.com/Leon-87-7/vig/issues/291) | docs: document context-blob and brain-endpoint ownership-scoping decisions                    | Brain            | —          |

---

## Ready for Agent

Ordered by unblocked-first, then dependency chain.

|                                                   # | Title                                                                                            | Area                     | Depends On       |
| --------------------------------------------------: | ------------------------------------------------------------------------------------------------ | ------------------------ | ---------------- |
| [#259](https://github.com/Leon-87-7/vig/issues/259) | Security: nodeLabel is an XSS sink in Brain graph (external titles)                               | Web / Brain              | —                |
| [#267](https://github.com/Leon-87-7/vig/issues/267) | fix(config): fail fast on empty TELEGRAM_WEBHOOK_SECRET/TELEGRAM_BOT_TOKEN                        | Config                   | —                |
| [#268](https://github.com/Leon-87-7/vig/issues/268) | chore: delete scripts/backfill_brain.py — crashes on removed GOOGLE_SHEETS_ID_SHORT/LONG          | —                        | —                |
| [#269](https://github.com/Leon-87-7/vig/issues/269) | fix(gemini): bound genai.Client requests to a 90s timeout                                         | Gemini                   | —                |
| [#270](https://github.com/Leon-87-7/vig/issues/270) | fix(web): replace invalid Tailwind class names (WCAG contrast fix + dead classes)                 | Web                      | —                |
| [#271](https://github.com/Leon-87-7/vig/issues/271) | fix(web): guard TelegramToggle against overlapping requests and unmount timer leak                | Web                      | —                |
| [#272](https://github.com/Leon-87-7/vig/issues/272) | fix(web): guard doc-parser detail load() against stale-response races                             | Web                      | —                |
| [#273](https://github.com/Leon-87-7/vig/issues/273) | feat(web): add app-level error boundary styled to the design system                               | Web                      | —                |

---

## Ready for Human

|                                                   # | Title                                                                                     | Area               | Notes                                                  |
| --------------------------------------------------: | ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------ |
| [#203](https://github.com/Leon-87-7/vig/issues/203) | chore(ops): Google Cloud OAuth app — production publishing + sensitive-scope verification | Ops / Google Cloud | External Google review; gates #204 production          |
| [#266](https://github.com/Leon-87-7/vig/issues/266) | chore(ops): deliver Google OAuth credentials to the server .env                           | Ops                | HITL; server .env values; follows #203 OAuth client    |

---

## Dependency Map

```
#1 Scaffold ✅-Done
├── #2 Short pipeline ✅-Done
│   └── #8 Short brain backfill ✅-Done
├── #3 Long Phase 1 ✅-Done
│   ├── #4 Long Phase 2 ✅-Done
│   └── #9 Long brain backfill ✅-Done
└── #5 Second Brain ✅-Done
    ├── #8 ✅-Done
    ├── #9 ✅-Done
    ├── #11 Photo link extraction ✅-Done
    │   ├── #21 GitHub service + cache ✅-Done
    │   │   └── #22 Photo pipeline wiring (repo enrichment) ✅-Done
    ├── #6 Mini-PRD auto ✅-Done
    │   └── #7 Mini-PRD intent ✅-Done
    │       └── #13 Enrichment retry button ✅-Done
    └── (feeds #4 via URL-resolution)

#10 BotFather ✅-Done
#15 Transcript sidecar TikTok/Instagram ✅-Done
#16 Template system parent ✅-Done
    ├── #17 Template data layer ✅-Done
    └── #18 Template handler layer ✅-Done
        └── #32 Audio fallback for caption-less Reels (ADR-0009) ✅-Done

#23 GeminiClient core ✅-Done
└── #26 GeminiClient migrate remaining callers ✅-Done

#24 PRD skeleton unification ✅-Done

#25 Webhook callback dispatch table ✅-Done
└── #27 Webhook slash dispatch table ✅-Done

#37 Slimming sweep — dedup ID gen / links formatter / EMBEDDING_DIM ✅-Done (slimming-doc #3/#4/#5)
#38 Unify template-matching tables ✅-Done
#39 Collapse Gemini service triplet → ADR-0011 ✅-Done (PR #49)

#33 Promise-gap extraction ✅-Done
└── #34 Promise-gap Telegram render ✅-Done (needs #33)

#35 Orphaned-job reaper (ADR-0010) ✅-Done
#36 Photo UI-chrome filter (ADR-0005) ✅-Done (PR #48)
└── #46 _filter_grounded_links UI-chrome dup ✅-Done (closed as dup of #36)

— fix: phantom status filter (find_recent_job_by_url) ✅-Done (no issue; committed directly)

#41 add set_prd_slot_status ✅-Done
#42 move links DDL into database.py ✅-Done
#43 PRAGMA user_version migrations ✅-Done (best after #42)
#47 short_video ignored_domains missing in tests ✅-Done (PR #50)

#51 jobs.freestyle_prompt column ✅-Done
└── #52 enrichment freestyle substitution ✅-Done
    └── #53 template picker keyboard (ADR-0012) ✅-Done
        └── #54 /freestyle slash command ✅-Done

— /find UX (GitHub enrichment, full URL path, score floor) ✅-Done
— plain-text command shortcut (first word → _SLASH_TABLE) ✅-Done

Article URL feature (postgrill: docs/features/postgrill/article-url-feature.md)
#59 Sheets consolidation (ADR-0013) ─────────┐
                                             │
#60 Jina + markdown_cache + /download_md ────┼──► #62 Article pipeline end-to-end ✅-Done
                                             │
#61 Article allowlist CRUD ──────────────────┘
(all four closed)

Repo URL feature (postgrill: docs/features/postgrill/repo-url-feature.md + ADR-0014)
#66 URL routing + stub ✅-Done
└── #67 bundle + cache + README preprocessing + /force ✅-Done (PR #80)
    └── #68 Gemini analysis + summary ✅-Done ──┬── #69 document delivery ✅-Done
                                          ├── #70 Sheets persistence ✅-Done ──┐
                                          ├── #71 brain ingest ✅-Done         │
                                          ├── #72 edge cases ✅-Done           │
                                          └── #73 freestyle re-run ✅-Done ◄───┘
                                                (also depends on #70)

#118 feat(github+repo): topics field, v2 cache key, _prioritize_tree helper ✅-Done (PR #120)
#119 feat(repo): improve _build_repo_prompt ✅-Done (PR #120)

webhook.py split (ADR-0015) — ✗ WONTFIX 2026-06-07 (#75–#79 closed not-planned; superseded by #130 CC-reduction on single-file webhook.py)

Web dashboard feature (postgrill: docs/features/postgrill/web-plan.md + ADR-0016..0019)
#81 ignored_domains per-chat migration (tenancy drift) ✅-Done
└── (45edd0d; prerequisite for /controls Ignored tab)

Web dashboard slices (WEB-PRD: docs/seed/WEB-PRD.md)
Critical path: #83 → #84 → {#85, #86, #87} → #88/#89 → #93 → #95

#83 S0 — API package split + FK enforcement ✅-Done
└── #84 S1 — Auth spine [HITL] ✅-Done
    ├── #85 S2 — Feed ✅-Done
    │   └── #89 S6 — Spaces CRUD + URLs tab ✅-Done ◄── also #84
    │       └── #93 S7 — Context blobs ✅-Done ◄── also #88
    │           └── #95 S8 — Space export ✅-Done ◄── also #87, #88
    ├── #86 S3 — Job detail ✅-Done
    │   └── #88 S5 — Job annotation ✅-Done ◄── also #87
    ├── #87 S4 — Controls Tags tab ✅-Done
    ├── #90 S9 — User templates ✅-Done ◄── also #83
    ├── #91 S10 — Controls Allowed/Ignored ✅-Done ◄── also #81
    ├── #92 S11 — Brain search page ✅-Done ◄── also #83
    └── #94 S12 — Deploy [HITL] ✅-Done

#96 Templates IDOR fix (tenant-scope templates table) ✅-Done (commit 93ad9f0)

#82 test(long_video) under-mocked send_message → coroutine in editMessageText — ✅-Done (closed COMPLETED on GH; superseded earlier ✗ WONTFIX 2026-06-07; still carries wontfix label)

Web complexity reduction (fallow health — CRAP scores; all independent, no blockers)
#129 refactor(fetch-utils) — flatten mapFetchState + shared fetchJson<T> ✅-Done (PR #134)
#121 refactor(feed) — useFeedData + useFuseSearch + polling hook ✅-Done (PR #134)        (CRAP 506 → ~30)
#122 refactor(spaces/detail) — 4 hooks + UrlsTab + ContextTab split ✅-Done (PR #134)     (CRAP 420 → ~60)
#123 refactor(job/detail) — useJobDetail + useJobAnnotation + useJobTags ✅-Done (PR #134) (CRAP 272 → ~40)
#124 refactor(controls) — useTagList + useDomainList ✅-Done (PR #134)                     (CRAP 110 → ~30)
#125 refactor(spaces/list) — useSpaceList + useCreateSpace ✅-Done (PR #134)               (CRAP 110 → ~30)
#126 refactor(export-modal) — useGdocExport + flatten handleGdoc ✅-Done (PR #134)         (CRAP 110 → ~25)
#127 refactor(prompts) — useTemplateList + slim UserTemplateRow ✅-Done (PR #134)          (CRAP 72 → ~25)
#128 refactor(brain) — useSemanticSearch ✅-Done (PR #134)                                 (CRAP 72 → ~25)
Note: #129 synergizes with #121–#128 (fetchJson<T> replaces repeated fetch boilerplate)

ADR-0020: Guaranteed transcript on every short job (docs/adr/0020-always-transcript-short-pipeline.md)
#32 Audio fallback for caption-less Reels ✅-Done ◄── pre-existing foundation
└── #101 transcribe_audio + enrich_audio returns transcript text ✅-Done (dbdcd40)
    └── #102 guaranteed transcript acquisition on all short jobs ✅-Done ◄── also #32
        └── #103 transcript Drive upload + Telegram document delivery tail ✅-Done
Critical path: #101 → #102 → #103 (all ✅-Done)

Short pipeline transcript series (PR #113)
#97 caption-based job always produces a transcript ✅-Done
#98 caption-less plain job transcribes via Gemini ✅-Done
#99 caption-less template job persists transcript from fused enrich_audio ✅-Done
#100 explicit transcript-failure taxonomy ✅-Done

Photo batch feature (ADR-0024: docs/adr/0024-photo-batch-media-group-debounce.md)
#136 Remove Quick Links section from build_enriched_links_message (independent) ✅-Done
#137 media_group_id debounce — replace /photoBatch-start /photoBatch-end (independent) ✅-Done
Critical path: #136 and #137 are parallel — no dependency between them

pyscn health refactors (.pyscn report 2026-06-07 — Health 47/100; Duplication 0, Complexity 45)
All independent — no blockers, all AFK, behavior-preserving (existing suite stays green).
#130 refactor(webhook) — extract _route_url + _handle_user_template_shortcut + chat-state helper (CC 32 → <12) ✅-Done
     (replaces the parked #75–#79 webhook split; works on current single-file webhook.py)
#132 refactor(database) — _execute/_execute_rowcount/_fetch_one/_fetch_all; collapse clone Group 38 (13 clones) ✅-Done
#131 refactor(short_video) — extract _acquire_transcript; flatten run() (CC 27, depth 6) ✅-Done
#133 refactor(brain) — extract _select_refresh_batch + _refresh_one_link; flatten refresh_stale_links (CC 24) ✅-Done

Feed tab redesign + server-resolved thumbnails (ADR-0025 — grill session 2026-06-13)
Phase 1 (frontend + thin backend resolver, no migration):
#142 content-type tabs replace feed filter bar ✅-Done (PR #149)
#143 server-resolved thumbnail_url on /api/jobs ✅-Done (PR #149)
└── #144 preview-card grid for typed feed tabs ✅-Done (PR #149) ◄── #142, #143
    ├── #146 persist short best frame as job thumbnail (Phase 2) ✅-Done (PR #149)
    └── #147 scrape article og:image as job thumbnail (Phase 2) ✅-Done (PR #149)
        └── #148 one-shot og:image backfill script ✅-Done (PR #149)
#145 brand-icon badges in All-tab feed rows ✅-Done (PR #149) ◄── #142
Critical path: #142/#143 → #144 → #146/#147 → #148 (all ✅-Done)

Document pipeline (ADR-0023: docs/adr/0023-liteparse-document-pipeline.md + docs/roadmap.md)
#150 GCS content-addressed storage seam (root) ✅-Done (PR #182)
├── #151 Telegram file upload ingestion ✅-Done (PR #182)
├── #152 Direct document URL routing ✅-Done (PR #182)
└── #153 vig-document liteparse sidecar ✅-Done (PR #182)
    └── #154 parse cache + automatic Gemini enrichment ◄── also #151, #152 ✅-Done (PR #182)
        ├── #155 plain text + enrichment Telegram delivery ✅-Done (PR #182)
        │   ├── #156 on-demand Markdown rendering ✅-Done (PR #200) ◄── also #154
        │   └── #157 Freestyle re-runs from cached parse ✅-Done (PR #200) ◄── also #154
        └── #158 opt-in Document Analysis export hook ✅-Done (PR #200)
Critical path: #150 → {#151, #152, #153} → #154 → #155 → {#156, #157}; #158 can follow #154 in parallel
(#150–#158 ✅-Done; #150–#155 via PR #182, #156/#157/#158 via PR #200)

Short-thumbnail backfill (docs/backfill_agreed_plan.md — ADR-0025 Phase-2 follow-up)
#159 core script (happy path) ✅-Done (PR #149)
├── #161 frame-selection strategies (rerun-vision, fallbacks) ✅-Done
└── #162 --overwrite-existing clobber-safety flag ✅-Done
#160 ADR-0025 follow-up note (independent — doc only) ✅-Done
Critical path: #159 → {#161, #162}; #160 parallel (all ✅-Done)

Feed/detail bug fixes (docs/bugs/2026-06-15-*.md)
#164 short-pipeline detail pages populate (independent) ✅-Done (PR #172)
#165 feed fetch-race guard (independent) ✅-Done (PR #173)
└── #166 tab-scoped Overview stat cards ◄── #165 ✅-Done (PR #173)
Critical path: #165 → #166; #164 parallel (all ✅-Done)

Dashboard recovery panel (ADR-0026)
#167 recovery summary + panel shell ✅-Done (PR #174)
├── #168 retry stale pending jobs ✅-Done
├── #169 retry failed jobs + tenant-scoped stale reaping ✅-Done
│   └── #171 Controls opt-out for recovery Telegram notifications ✅-Done
└── #170 clear failed jobs as cancelled ✅-Done
Critical path: #167 → {#168, #169, #170}; #171 follows #169 (all ✅-Done)

Feed freshness + keep-warm (PR #178)
#175 client-side feed filtering (preload + instant filters) ✅-Done
#176 keep-warm ping — eliminate API cold-start spike ✅-Done
#177 silent background freshness (focus-refetch + backstop poll) ✅-Done
Critical path: #175, #176, #177 are independent — no dependency between them (all ✅-Done)

UI/UX makeover (source: docs/todo-notes.md — impeccable shape briefs 2026-06-20)
#185 mobile inline stats row (T/D/P/E) — independent ✅-Done (PR #193)
#186 wrap content-type tabs — independent ✅-Done (PR #193)
#187 collapse recovery + status filters on mobile — independent ✅-Done (PR #193)
#188 scroll-to-top button — independent ✅-Done (PR #193)
#189 add icon column to spaces table — independent (root) ✅-Done (PR #193)
├── #190 redesign space cards with icon + color wash + inline delete ✅-Done (PR #193)
└── #191 icon picker on space create/edit ✅-Done (PR #193)
#192 enlarge mobile back-link on job detail — independent ✅-Done (PR #193)
Critical path: #189 → {#190, #191}; all others independent (all ✅-Done)

Brain graph map (grill 2026-06-21 — ADR-0027, ADR-0028; CONTEXT.md Brain graph)
— ✗ WONTFIX 2026-06-25: implementation set shelved after the plan (PR #199 merged). #194–#198 closed not-planned.
#194 graph endpoint + desktop 2D render (root) — ✗ WONTFIX
#196 graph search highlight ◄── #194 — ✗ WONTFIX
#197 mobile ego-network view — ✗ WONTFIX 2026-06-21
#198 repo-node metadata refresh (stars/pushed_at) ◄── #194 — ✗ WONTFIX
#195 normalized-URL dedup (independent) — ✗ WONTFIX

Short titles + Links Found (grill 2026-06-23)
#211 vision-harvested short titles (independent) — title field on existing vision pass, no 2nd Gemini call ✅-Done (PR #215)
#212 remove key_phrases end-to-end (independent) — template enrichment untouched ✅-Done (PR #215)
└── #213 Links Found detail section (clickable) ◄── #212 (takes over the detail-section slot key_phrases vacates) ✅-Done (PR #215)
Critical path: #211 parallel; #212 → #213 (all ✅-Done)

Doc Parser dashboard page (ADR-0029: docs/adr/0029-doc-parser-dashboard-page.md) — all ✅-Done (PR #227; #231 via PR #232; #228 via PR #229; #240 via PR #242)
#217 upload API + telegram_delivery column (root) ✅-Done
├── #219 Gemini structured summary + enriched GCS storage ✅-Done
│   └── #221 on-demand clean + freestyle endpoints ✅-Done
│       └── #225 detail page + output cards ◄── also #223, #224 ✅-Done
│           └── #226 freestyle modal with random + saved prompts ✅-Done
├── #220 SSE endpoint for document job status ✅-Done
│   └── #223 job list + SSE real-time updates ◄── also #218 ✅-Done
├── #222 upload zone — URL input + file dropzone ◄── also #218 ✅-Done
└── #224 three-state Telegram toggle component ✅-Done
#218 page shell + sidebar entry (root, independent of #217) ✅-Done
Critical path: #217 → #219 → #221 → #225 → #226 (all ✅-Done)

Tooltip system (spec: docs/superpowers/specs/2026-06-28-tooltips-design.md) — Radix Tooltip primitive, replace all native title= + extend coverage
#243 Tooltip primitive + first adoption (foundation, root) ✅-Done (PR #248)
├── #244 migrate explanatory title= ◄── #243 ✅-Done (PR #248)
├── #245 migrate overflow-reveal title= (mono) ◄── #243 ✅-Done (PR #248)
├── #246 add tooltips to icon-only controls ◄── #243 ✅-Done (PR #248)
└── #247 add tooltips to metric labels (stats-overview) ◄── #243 ✅-Done (PR #248)
Critical path: #243 → {#244, #245, #246, #247} (all ✅-Done)

Brain Links nav + graph controls (grill 2026-06-29 — tasks #7/#8 from docs/TASK.md)
#238 Extracted-links table on the Brain page ✅-Done (PR #239) — foundation the nav builds on
#251 Links table — server-side sort params + per-tenant user_settings view + jump-to-page/page-size ✅-Done (PR #257)
#252 Brain graph on-canvas controls — zoom/fit/recenter + focus-on-match + topic legend/filter (desktop-only) ✅-Done (PR #260)
Critical path: #251 and #252 are independent — no dependency between them

Per-user export isolation (epic #201; ADR-0030 + ADR-0022; CONTEXT.md `Operator`)
#202 operator-only export gate (the "now" fix — root, unblocked) ✅-Done (PR #208) ◄── also gates #158
└── #204 per-user "Connect Google" (web): encrypted token store → /vig ◄── also #203
    ├── #205 Telegram Mini App surface (initData → shared OAuth backend)
    └── #206 connection lifecycle (invalid_grant / /disconnect / notify-once)
#203 Google Cloud OAuth app: prod publish + sensitive-scope verification (HITL/external — gates #204 for production)
Critical path: #202 → #204 → {#205, #206}; #203 (external review) gates #204 production readiness

Council fixes chunk 2 — event loop + shim deletion + React race/cleanup batch (docs/superpowers/council/sub-plans/main-council-fixes-chunk2-backend-and-react.md)
#276 export_blocked async (event-loop fix)
#277 delete GeminiClient passthrough shim
#278 CopyButton reset-timer cleanup (jobs detail)
#279 space-delete failure surfacing
#280 Connect Google button-signal spec alignment
#281 Doc Parser loading skeleton + empty state
Critical path: #276, #277, #278, #279, #280, #281 are all independent — no dependency between them

Council fixes chunk 3 — admin-contact copy, decorative-signal removal, timeouts, dead code (docs/superpowers/council/sub-plans/main-council-fixes-chunk3-copy-and-hygiene.md)
#283 configurable ADMIN_CONTACT_NAME replaces hardcoded 'Leon' (webhook + invite-gate)
#284 drop decorative signal-orange accents (logout glow, doc-parser Sparkles)
#285 Jina fetch_markdown — explicit 30s httpx timeout
#286 delete unused _DETAIL_FIELDS tuple
#287 normalize_repo_url — explicit ValueError guard instead of unguarded IndexError
Critical path: #283, #284, #285, #286, #287 are all independent — no dependency between them
(Task 21/APScheduler→asyncio sleep-loop skipped per user decision — kept APScheduler, no issue filed)

Council fixes chunk 4 — eyebrow sweep, tabs hoisting, background-task tracking, scoping docs (docs/superpowers/council/sub-plans/main-council-fixes-chunk4-design-and-tasks.md)
#288 drop banned uppercase-tracked eyebrow labels per DESIGN.md
#289 hoist SegmentedTabs/FilterBar tab definitions to stable references
#290 retain strong references to fire-and-forget asyncio tasks
#291 document context-blob + brain-endpoint ownership-scoping decisions (confirmed: single shared graph, not per-user — future marketing point for Brain page + public home page, docs/TASK.md §14)
Critical path: #288, #289, #290, #291 are all independent — no dependency between them
(Task 27/HKDF key derivation skipped per user decision — not an active vulnerability, no issue filed)

Account affordance — Google connection + Telegram identity (grill 2026-07-02 — task #17 from docs/TASK.md; CONTEXT.md `Account affordance`)
#292 session-user context + sidebar identity row (root) ✅-Done ──┐
                                                                 ├──► #295 sidebar Google-connection state ✅-Done
#293 Google-status provider + Feed disconnected-only nudge ✅-Done ┘
#294 OAuth-return one-time banner (independent) ✅-Done
Critical path: {#292, #293} → #295; #294 parallel (all ✅-Done via PR #296)
```

---

## Open PRs

| # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |

## Closed PRs

| # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |
| [#264](https://github.com/Leon-87-7/vig/pull/264) | Per-user Google OAuth exports + encrypted token store and Telegram Mini App support | codex/resolve-issues-#204,-#205,-and-#206→main | — | ✅ Merged |
| [#263](https://github.com/Leon-87-7/vig/pull/263) | Invite gate: council-review fixes (rounds 1-2) + council-review tooling updates | invite-gate-255-256→main | — | ✅ Merged |
| [#262](https://github.com/Leon-87-7/vig/pull/262) | feat(db): add invite gate user status | feat/invite-gate-db→main | — | ✅ Merged |
| [#261](https://github.com/Leon-87-7/vig/pull/261) | [codex] fix brain graph tooltip escaping | codex/fix-brain-graph-tooltip-xss→main | — | ✅ Merged |
