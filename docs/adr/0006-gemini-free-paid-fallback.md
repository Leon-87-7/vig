---
adr: "0006"
title: Gemini key fallback is free→paid, never Anthropic
status: accepted
date: 2026-05-20
---

## Context

The enrichment and photo pipelines call Gemini. Two API keys are available: a free-tier key and a paid-tier key. An early n8n version of the workflow also used Anthropic Claude as a fallback enrichment model.

## Decision

Fallback order for all Gemini calls: `GEMINI_FREE_API_KEY` → `GEMINI_PAID_API_KEY`. Anthropic is not in the fallback chain.

## Rationale

- **Anthropic was an n8n patch**: the Anthropic fallback was added to the n8n workflow because Gemini rate limits were hit in production. It was never part of the intended architecture.
- **Model consistency**: mixing Gemini and Claude output in the same pipeline produces inconsistent structured JSON (different field names, different formatting habits). Using a single model family avoids this.
- **Cost control**: the paid Gemini key is a sufficient backstop. Adding Anthropic adds a second billing relationship without clear benefit.

## Consequences

- `ANTHROPIC_API_KEY` is not in `Settings` and should not be added.
- If both Gemini keys fail, the pipeline raises `RuntimeError` and the user gets a Telegram error message with a retry button.
