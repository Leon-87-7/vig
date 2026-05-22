---
adr: "0005"
title: Photo links must be verbatim-grounded; brand-name inference is forbidden
status: accepted
date: 2026-05-22
---

## Context

The initial `_PHOTO_PROMPT` instructed Gemini to "infer full URL from brand name (e.g. TrustMRR → https://trustmrr.com)". In practice this caused Gemini to hallucinate a URL for every company name visible in the screenshot — returning 21 links from a single image when only 1 real URL was present.

## Decision

1. **Prompt**: Gemini must only return URLs/domains that are literally rendered as text. Each link must include a `verbatim` field containing the surrounding phrase from the image that proves the domain is visible (e.g. `"TrustMRR.com — The database of verified startup revenues"`).
2. **Post-filter** (`_filter_grounded_links`): any link whose URL domain does not appear in the lowercased `verbatim` (or `summary` as a fallback) is dropped before the user sees it.
3. **UI chrome filter**: links whose `verbatim` matches `\bfollowed by\b` are also dropped — these appear in Instagram/TikTok follower indicators, not as promoted resources.

## Rationale

- **Model self-report is unreliable for inference**: Gemini is excellent at OCR but will also hallucinate plausible domains when invited to "infer". The verbatim contract shifts the burden from inference to transcription, which the model does accurately.
- **Defence in depth**: even if the prompt fails (model regresses, new model version), the post-filter provides a second layer that catches ungrounded URLs at the code level.
- **Surrounding phrase context**: requiring the surrounding phrase (not just the bare domain) in `verbatim` means the model includes enough context for the UI chrome check to fire (e.g. `"Followed by chase.h.ai"` instead of just `"chase.h.ai"`).

## Trade-offs

- Links that are only shown as brand logos (no text domain) will never be extracted, even if real. Acceptable — the feature is OCR-based, not vision-based product recognition.
- The `\bfollowed by\b` pattern is conservative; other chrome types (e.g. comment author handles) are not filtered unless they appear in a follower indicator. Can be extended incrementally.

## Consequences

- `gemini_photo._PHOTO_PROMPT` must not contain any "infer from brand name" instruction.
- `gemini_photo._filter_grounded_links` is the single validation gate — no Brave Search or other online lookup is done on photo-extracted links.
- `_UI_CHROME_PATTERNS` lives in `gemini_photo.py` and is tested in `tests/test_gemini_photo.py`.
