# Issue Kanban

> Read-only snapshot — authoritative state lives on [GitHub Issues](https://github.com/Leon-87-7/vig/issues).\
> Update this file whenever an issue moves columns.

---

## Done

|                                                   # | Title                                                                                                      | Area                     | Notes                                                                                     |
| --------------------------------------------------: | ---------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| [#211](https://github.com/Leon-87-7/vig/issues/211) | Vision-harvested short titles                                                                              | Short Video              | Merged; PR #215; closed on GH                                                             |
| [#212](https://github.com/Leon-87-7/vig/issues/212) | Remove key_phrases end-to-end                                                                             | Short Video / Enrichment | Merged; PR #215; closed on GH                                                             |
| [#213](https://github.com/Leon-87-7/vig/issues/213) | Links Found detail section (clickable)                                                                     | Web / Jobs               | Merged; PR #215; closed on GH                                                             |
| [#217](https://github.com/Leon-87-7/vig/issues/217) | feat(api): document upload REST endpoints + telegram_delivery column                                       | API                      | Merged; PR #227; closed on GH                                                             |
| [#218](https://github.com/Leon-87-7/vig/issues/218) | feat(web): Doc Parser page shell + sidebar entry                                                           | Web                      | Merged; PR #227; closed on GH                                                             |
| [#219](https://github.com/Leon-87-7/vig/issues/219) | feat(processor): Gemini structured summary + enriched GCS storage                                          | Processor                | Merged; PR #227; closed on GH                                                             |
| [#220](https://github.com/Leon-87-7/vig/issues/220) | feat(api): SSE endpoint for document job status                                                            | API                      | Merged; PR #227; closed on GH                                                             |
| [#221](https://github.com/Leon-87-7/vig/issues/221) | feat(api): on-demand clean + freestyle document endpoints                                                  | API                      | Merged; PR #227; closed on GH                                                             |
| [#222](https://github.com/Leon-87-7/vig/issues/222) | feat(web): upload zone — URL input + file dropzone                                                         | Web                      | Merged; PR #227; closed on GH                                                             |
| [#223](https://github.com/Leon-87-7/vig/issues/223) | feat(web): document job list + SSE real-time updates                                                       | Web                      | Merged; PR #227; closed on GH                                                             |
| [#224](https://github.com/Leon-87-7/vig/issues/224) | feat(web): three-state Telegram toggle component                                                           | Web / API                | Merged; PR #227; closed on GH                                                             |
| [#225](https://github.com/Leon-87-7/vig/issues/225) | feat(web): Doc Parser detail page with output cards                                                        | Web                      | Merged; PR #227; closed on GH                                                             |
| [#226](https://github.com/Leon-87-7/vig/issues/226) | feat(web): freestyle modal with random + saved prompts                                                     | Web                      | Merged; PR #227; closed on GH                                                             |
| [#231](https://github.com/Leon-87-7/vig/issues/231) | Latent: 'retroactive' storable as a persistent telegram_delivery state                                     | DB / Document            | Merged; PR #232; closed on GH                                                             |
| [#228](https://github.com/Leon-87-7/vig/issues/228) | Refactor: extract parsed.py trust-boundary PDF intake into a deep module (post-#227)                       | Refactor / Document      | Merged; PR #229; closed on GH                                                             |
| [#240](https://github.com/Leon-87-7/vig/issues/240) | Doc detail page: move Telegram toggle next to Clean + add download/copy buttons to output cards            | Web / Doc Parser         | Merged; PR #242; closed on GH                                                             |
| [#238](https://github.com/Leon-87-7/vig/issues/238) | Extracted-links table on the Brain page (deduplicated, paginated)                                          | Web / Brain              | Merged; PR #239; closed on GH                                                             |

---

## Needs Triage

|                                                   # | Title                                                                                       | Area             | Depends On |
| --------------------------------------------------: | ------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| [#201](https://github.com/Leon-87-7/vig/issues/201) | epic(multi-tenancy): per-user export isolation                                              | Multi-tenancy    | —          |
| [#202](https://github.com/Leon-87-7/vig/issues/202) | feat(config): operator-only export gate (per-user isolation, the #201 'now' fix)            | Multi-tenancy    | —          |
| [#203](https://github.com/Leon-87-7/vig/issues/203) | chore(ops): Google Cloud OAuth app — production publishing + sensitive-scope verification   | Ops / Google Cloud | —        |
| [#204](https://github.com/Leon-87-7/vig/issues/204) | feat(oauth): per-user 'Connect Google' (web) — encrypted token store → exports to /vig      | OAuth / Export   | #202, #203 |
| [#205](https://github.com/Leon-87-7/vig/issues/205) | feat(telegram): Mini App 'Connect Google' surface — initData identity, shared OAuth backend | OAuth / Telegram | #204       |
| [#206](https://github.com/Leon-87-7/vig/issues/206) | feat(oauth): connection lifecycle — invalid_grant handling, /disconnect, notify-once        | OAuth / Export   | #204       |
| [#234](https://github.com/Leon-87-7/vig/issues/234) | Replace raw logout API response with dedicated logout page                                   | Web / Auth       | —          |

---

## Ready for Agent

Ordered by unblocked-first, then dependency chain.

|                                                   # | Title                                                                | Area                     | Depends On       |
| --------------------------------------------------: | -------------------------------------------------------------------- | ------------------------ | ---------------- |
| [#251](https://github.com/Leon-87-7/vig/issues/251) | Brain Links table: richer navigation + persisted per-tenant view     | Web / Brain              | —                |
| [#252](https://github.com/Leon-87-7/vig/issues/252) | Brain graph on-canvas controls overlay (zoom/fit/recenter + filter)  | Web / Brain              | —                |
| [#243](https://github.com/Leon-87-7/vig/issues/243) | Tooltip primitive + first adoption (foundation)                      | Web / Tooltips           | —                |
| [#244](https://github.com/Leon-87-7/vig/issues/244) | Migrate explanatory title= tooltips to Tooltip primitive             | Web / Tooltips           | #243             |
| [#245](https://github.com/Leon-87-7/vig/issues/245) | Migrate overflow-reveal title= tooltips (mono variant)               | Web / Tooltips           | #243             |
| [#246](https://github.com/Leon-87-7/vig/issues/246) | Add tooltips to icon-only controls                                   | Web / Tooltips           | #243             |
| [#247](https://github.com/Leon-87-7/vig/issues/247) | Add tooltips to metric labels in stats-overview                      | Web / Tooltips           | #243             |

---

## Ready for Human

|   # | Title | Area | Notes |
| --: | ----- | ---- | ----- |

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
#243 Tooltip primitive + first adoption (foundation, root) — Ready for Agent
├── #244 migrate explanatory title= ◄── #243 — Ready for Agent
├── #245 migrate overflow-reveal title= (mono) ◄── #243 — Ready for Agent
├── #246 add tooltips to icon-only controls ◄── #243 — Ready for Agent
└── #247 add tooltips to metric labels (stats-overview) ◄── #243 — Ready for Agent
Critical path: #243 → {#244, #245, #246, #247} (all parallel once #243 lands)

Brain Links nav + graph controls (grill 2026-06-29 — tasks #7/#8 from docs/TASK.md)
#238 Extracted-links table on the Brain page ✅-Done (PR #239) — foundation the nav builds on
#251 Links table — server-side sort params + per-tenant user_settings view + jump-to-page/page-size — Ready for Agent (independent; LinksTable already shipped via #238)
#252 Brain graph on-canvas controls — zoom/fit/recenter + focus-on-match + topic legend/filter (desktop-only) — Ready for Agent (independent)
Critical path: #251 and #252 are independent — no dependency between them

Per-user export isolation (epic #201; ADR-0030 + ADR-0022; CONTEXT.md `Operator`)
#202 operator-only export gate (the "now" fix — root, unblocked) ◄── also gates #158 (open: opt-in Document Analysis export hook)
└── #204 per-user "Connect Google" (web): encrypted token store → /vig ◄── also #203
    ├── #205 Telegram Mini App surface (initData → shared OAuth backend)
    └── #206 connection lifecycle (invalid_grant / /disconnect / notify-once)
#203 Google Cloud OAuth app: prod publish + sensitive-scope verification (HITL/external — gates #204 for production)
Critical path: #202 → #204 → {#205, #206}; #203 (external review) gates #204 production readiness
```

---

## Open PRs

| # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |
| [#208](https://github.com/Leon-87-7/vig/pull/208) | feat(config): operator-only export gate — per-user isolation (#202) | feat/operator-export-gate→main | #202 | Open |
| [#207](https://github.com/Leon-87-7/vig/pull/207) | docs(multi-tenancy): export-isolation design — ADR-0027, Operator term, issue breakdown | docs/multi-tenancy-export-isolation→main | — | Open |

## Closed PRs

| # | Title | Branch→Base | Linked Issue | Status |
| --: | ----- | ----------- | ------------ | ------ |
| [#250](https://github.com/Leon-87-7/vig/pull/250) | feat(skills): /pre-grill + TASK.md ideation workflow | feat/pre-grill-skill→main | — | ✅ Merged |
| [#249](https://github.com/Leon-87-7/vig/pull/249) | feat(skills): /pre-grill — fatten one-line ideas into grill-ready briefs | feat/pre-grill-skill→main | — | ✅ Merged |
| [#248](https://github.com/Leon-87-7/vig/pull/248) | Add Tooltip component (Radix) and integrate across UI | codex/resolve-issues-#243-to-#247→main | — | ✅ Merged |
| [#242](https://github.com/Leon-87-7/vig/pull/242) | feat(doc-parser): relocate Telegram toggle + copy/download on output cards (#240) | 240-doc-detail-page-move-telegram-toggle-next-to-clean-add-downloadcopy-buttons-to-output-cards→main | #240 | ✅ Merged |
