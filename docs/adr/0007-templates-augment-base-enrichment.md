---
adr: "0007"
title: Templates augment base enrichment JSON rather than replace it
status: accepted
date: 2026-05-22
---

## Context

The template system allows Gemini enrichment to be run in different modes — method extraction, technical summary, review analysis, etc. Two shapes were possible for the output:

1. **Replace**: each template produces its own free-form output (step lists, review tables, narrative structure). The existing structured fields (category, topic, objective, action_points, tools, market_data) are absent for non-summary templates.
2. **Augment**: the base structured fields always run. Templates append additional JSON fields on top.

## Decision

Templates augment the base enrichment JSON. The base fields (category, topic, objective, action_points, tools, market_data) are always present regardless of template. Each non-summary template appends a `template_analysis` object with template-specific extras.

The `summary` template is the "no extras" baseline — it is a label for the existing enrichment behaviour with no additions.

## Rationale

- **Brain ingestion depends on the `tools` field.** Every enrichment call feeds `tools[].url` into the semantic link graph (`brain.ingest_links`). Dropping the base fields for templated jobs breaks the Brain for those videos.
- **Sheets columns are stable.** `ai_category`, `ai_topic`, `ai_action_points`, `ai_tools` are logged to Google Sheets for every job. Nulling them for half the jobs would corrupt the sheet.
- **Templates add value through specificity, not by replacing structure.** A method template is more useful when it adds steps *on top of* the tool list — a user reading the output wants both.

## Consequences

- `_build_prompt` in `enrichment.py` is extended with template-specific `extra_instructions` appended after the base prompt but before the transcript.
- `enrich()` pops `template_analysis` from the parsed JSON before constructing the base `Enrichment` dataclass. The base fields are unchanged.
- `_build_enrichment_message` appends a rendered template section when `template_analysis` is non-null.
- Adding a new template in the future requires only a new `PromptTemplate` entry — no schema or pipeline changes.
