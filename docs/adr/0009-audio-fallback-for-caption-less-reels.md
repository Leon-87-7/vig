---
adr: "0009"
title: Transcript service returns audio bytes as fallback for caption-less Reels
status: accepted
date: 2026-05-24
---

## Context

~80% of Instagram Reels have no auto-generated captions. The transcript service's `/transcript` endpoint uses `yt-dlp` subtitle extraction (`skip_download: True`) and returns `{"error": {"type": "no_transcript"}}` when no VTT files are found. This causes the template path in `short_video.py` to bail entirely for most Reels.

The template path needs spoken-word content to run the enrichment prompt meaningfully — frame-based Vision analysis alone cannot substitute.

## Decision

When caption extraction yields no VTT files, the transcript service downloads audio-only via yt-dlp, encodes it as base64, and returns:

```json
{"audio_b64": "...", "mime_type": "audio/mp4", "fallback": "audio"}
```

The worker detects `fallback: "audio"` and, instead of the text transcript → enrichment path, makes a single Gemini `generate_content` call with the inline audio bytes + the enrichment/template prompt. Gemini transcribes and analyzes in one shot (audio enrichment).

The transcript service does **not** call Gemini itself and does not receive Gemini API keys.

Error taxonomy:
- `no_transcript` — caption extraction found no VTT files (pre-audio-fallback)
- `transcription_failed` — audio download or Gemini audio-enrichment call failed

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Local ASR (faster-whisper) | Host machine cannot accommodate even +150MB RAM for `base.en` model |
| Send Reel URL directly to Gemini | Instagram URLs require session cookie auth; Gemini cannot authenticate |
| Separate Gemini transcription call then enrichment | Adds a third `generate_content` call; budget is two calls (Vision + Enrichment) |
| Keep bailing on no-transcript | 80% of template Reel jobs silently fail — unacceptable |
| Transcript service calls Gemini itself | Duplicates enrichment logic; requires Gemini keys in transcript container |

## Consequences

- Transcript service contract gains a new response shape. Callers must check for `fallback: "audio"` before treating the response as text.
- Worker gains an audio enrichment branch in the template path. The two-Gemini-call budget is preserved.
- Audio files for 90-second Reels are ~2–5MB — within Gemini's 20MB inline base64 limit, so File API upload is not needed.
- `jobs.transcript` stays empty for caption-less Reels processed via audio enrichment. `key_phrases` step is skipped.
- `_build_prompt` in `enrichment.py` gains a sibling that frames the prompt for audio input rather than text transcript.
