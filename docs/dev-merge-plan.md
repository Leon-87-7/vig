# dev → main Merge Plan

Merge order for the 26 commits on `dev` (as of 2026-06-03, commit `535c2bf`).
Each PR must be merged before the next — later slices depend on web scaffolding
established by earlier ones.

---

## PR 1 — S1 auth hardening + cleanup

**Branch:** `pr/auth-s1-fixes`

| Hash | Message |
|---|---|
| `7c0b739` | fix(auth): add package-lock fallback to web Dockerfile and fix test issues |
| `d61c059` | fix(auth): gate session cookie secure flag on SESSION_COOKIE_SECURE setting |
| `5c7dd92` | fix(web): cast window through unknown for onTelegramAuth assignment |
| `d3d094d` | fix(web): replace invalid COPY shell redirect with RUN mkdir for public/ |
| `d30f7b7` | fix(web): pass NEXT_PUBLIC_TELEGRAM_BOT_USERNAME as build arg |
| `5247a76` | fix(web): bake API_INTERNAL_URL + correct bot username at build time |
| `02719ae` | docs(kanban): close #84, promote #85/#86/#87 to ready-for-agent |
| `5e7d498` | fix(worktrees): remove obsolete subproject worktrees |
| `43fd76f` | chore: ignore .claude/worktrees/ and web/.next/ build artifacts |
| `86afaec` | feat(svg): add copy-svgrepo-com.svg; create next-env.d.ts |
| `73079f9` | fix(test): plug send_message/send_document/edit_message_text mock gap (#82) |

---

## PR 2 — Web S2/S3/S4: Feed, Job detail, Tags CRUD

**Branch:** `pr/web-s2-s3-s4`
**Depends on:** PR 1

| Hash | Message |
|---|---|
| `0e6106f` | feat(web): S2/S3/S4 — feed page, job detail, and tags CRUD |
| `07301f5` | Add TypeScript configuration file for web project |

---

## PR 3 — Web S10: Controls (Allowed/Ignored domains)

**Branch:** `pr/web-controls-s10`
**Depends on:** PR 2

| Hash | Message |
|---|---|
| `2856de5` | feat(controls): add Allowed Domains and Ignored Domains tabs (#91) |

---

## PR 4 — User-defined templates

**Branch:** `pr/templates`
**Depends on:** PR 2

| Hash | Message |
|---|---|
| `4faa56d` | feat(templates): user-defined templates CRUD, -name webhook branch, /templates |
| `93ad9f0` | fix(templates): scope templates to chat_id — prevent cross-tenant IDOR |

---

## PR 5 — Web S11: Brain semantic-search page

**Branch:** `pr/brain-search-s11`
**Depends on:** PR 2

| Hash | Message |
|---|---|
| `4e25ae7` | feat(web): S11 — brain semantic-search page (#92) |

---

## PR 6 — Web S5/S6: Job annotations + Spaces CRUD

**Branch:** `pr/spaces-s5-s6`
**Depends on:** PR 2

| Hash | Message |
|---|---|
| `dac2f3d` | feat(db): S5 — job_annotations + job_tags schema and DB helpers (#88) |
| `1bd879b` | feat(web): S6 — spaces CRUD + URLs tab (#89) |
| `1808331` | feat(web): job detail — copy-all, icon copy buttons, readable timestamps |
| `894c43c` | fix(spaces): scope list_space_urls by chat_id + verify job ownership |
| `85d6566` | build(web): add @milkdown/crepe; fix Set-spread build error in controls |
| `ef94e2e` | test(spaces): tenant isolation + add_space_url IDOR + list_space_urls regression |

---

## PR 7 — ADR-0020: Guaranteed transcript on every short job

**Branch:** `pr/adr-0020-transcript`
**Depends on:** none (backend only, can merge any time after PR 1)

| Hash | Message |
|---|---|
| `3c62f9d` | docs: update domain context and add ADR-0020 |
| `dbdcd40` | feat(short-pipeline): guaranteed transcript on every short job |
| `535c2bf` | chore(kanban): move #101 #102 #103 to Done |

---

## Merge order summary

```
main
 └── PR 1 (auth + cleanup)
      └── PR 2 (S2/S3/S4 — feed, job detail, tags)
           ├── PR 3 (S10 — controls)
           ├── PR 4 (templates)
           ├── PR 5 (S11 — brain search)
           └── PR 6 (S5/S6 — annotations + spaces)

PR 7 (ADR-0020) — independent, merge whenever ready
```

PRs 3, 4, 5, 6 can be opened in parallel after PR 2 merges; they are independent
of each other and only share the PR 2 base.
