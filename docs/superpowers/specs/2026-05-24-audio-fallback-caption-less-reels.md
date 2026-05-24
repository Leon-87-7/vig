# Audio Fallback for Caption-less Reels — Design Spec

**Date:** 2026-05-24
**ADR:** [0009 — Transcript service returns audio bytes as fallback](../../adr/0009-audio-fallback-for-caption-less-reels.md)
**Scope:** Template path only. Plain URL jobs are unaffected.

---

## Problem

~80% of Instagram Reels have no auto-generated captions. The `/transcript` endpoint returns `{"error": {"type": "no_transcript"}}` in those cases, causing `short_video.py` to bail with "No transcript available — template analysis skipped." The template path is effectively broken for most Reels.

---

## Solution Overview

When caption extraction yields no VTT files, the transcript service downloads audio-only via yt-dlp and returns the audio as inline base64. The worker detects this response shape and replaces the text-transcript → enrichment call with a single Gemini `generate_content` call that sends the audio bytes + the template/enrichment prompt together. Gemini transcribes and analyzes in one shot.

Two-Gemini-call budget is preserved: **Vision (frames) + Audio-Enrichment** — same as the current working caption path.

---

## Architecture

### Current flow (caption-based, working)

```
short_video.run (template job)
  → frames.fetch_frames(url)                    # sidecar HTTP
  → gemini.call_gemini_vision(frames)            # Gemini call 1
  → transcript_svc.fetch_transcript(url)         # sidecar HTTP → VTT text
  → extract_key_phrases(transcript)
  → enrichment.enrich(job)                       # Gemini call 2 (text prompt)
```

### New flow (audio fallback, caption-less)

```
short_video.run (template job, no captions)
  → frames.fetch_frames(url)                    # sidecar HTTP
  → gemini.call_gemini_vision(frames)            # Gemini call 1 (unchanged)
  → transcript_svc.fetch_transcript(url)         # sidecar HTTP → audio_b64
  → enrichment.enrich_audio(job, audio_b64)      # Gemini call 2 (audio prompt)
```

The transcript service stays a "media fetcher." The worker stays the "Gemini caller." No Gemini keys in the transcript container.

---

## 1. Transcript Service (`transcript_server.py`)

### `/transcript` endpoint — new fallback branch

Current behavior when no VTT files found:
```python
return jsonify([{"error": {"type": "no_transcript", "message": "No captions available for this video"}}])
```

New behavior: attempt audio download, return base64 on success, new error type on failure.

```python
# After vtt_files check fails:
try:
    audio_b64, mime_type = _download_audio_b64(url, tmp_dir)
    return jsonify([{"audio_b64": audio_b64, "mime_type": mime_type, "fallback": "audio"}])
except Exception as e:
    return jsonify([{"error": {"type": "transcription_failed", "message": str(e)}}])
```

### New helper `_download_audio_b64(url, tmp_dir) -> tuple[str, str]`

```python
def _download_audio_b64(url: str, tmp_dir: str) -> tuple[str, str]:
    """Download audio-only via yt-dlp, return (base64_string, mime_type)."""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": os.path.join(tmp_dir, "audio.%(ext)s"),
        # Instagram cookies already available via INSTAGRAM_COOKIES env
    }
    if INSTAGRAM_COOKIES and os.path.exists(INSTAGRAM_COOKIES):
        ydl_opts["cookiefile"] = INSTAGRAM_COOKIES

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    candidates = [f for f in os.listdir(tmp_dir) if f.startswith("audio.")]
    if not candidates:
        raise RuntimeError("yt-dlp produced no audio file")

    audio_path = os.path.join(tmp_dir, candidates[0])
    ext = os.path.splitext(candidates[0])[1].lstrip(".")
    mime_type = {"m4a": "audio/mp4", "webm": "audio/webm", "mp3": "audio/mpeg"}.get(ext, "audio/mp4")

    with open(audio_path, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode("utf-8")

    return audio_b64, mime_type
```

**Notes:**
- Audio files for 90-second Reels are ~2–5MB — within Gemini's 20MB inline base64 limit.
- `tmp_dir` is the same temp directory already used by the VTT extraction path; cleanup is handled by the existing `finally: shutil.rmtree(tmp_dir)`.
- No new env vars needed — Instagram cookies are already passed in.

### Error taxonomy (after this change)

| `error.type` | Meaning |
|---|---|
| `no_transcript` | Captions unavailable AND audio download failed |
| `transcription_failed` | Audio download or processing failed after attempted fallback |

> **Note:** `no_transcript` is now only returned for YouTube videos that fail `YouTubeTranscriptApi` — the non-YouTube path always attempts audio download before giving up.

---

## 2. Transcript Service Client (`src/services/transcript.py`)

`fetch_transcript` currently returns `data[0]` from the JSON array. No change needed — it already returns the raw dict. The caller inspects the dict.

The `fetch_transcript` function signature and return type are unchanged. The new dict shape flows through transparently.

---

## 3. Short Video Processor (`src/processors/short_video.py`)

### Template path — new routing logic

Replace the current transcript block:

```python
# CURRENT
try:
    transcript_resp = await transcript_svc.fetch_transcript(url)
    short_transcript = transcript_resp.get("text", "")
except Exception:
    short_transcript = ""

if not short_transcript:
    await send_message(chat_id, f"{tag}\nNo transcript available — template analysis skipped.")
    return
```

With:

```python
# NEW
try:
    transcript_resp = await transcript_svc.fetch_transcript(url)
except Exception:
    await send_message(chat_id, f"{tag}\nNo transcript available — template analysis skipped.")
    return

if transcript_resp.get("fallback") == "audio":
    # Caption-less path: audio bytes → Gemini audio-enrichment
    audio_b64 = transcript_resp.get("audio_b64", "")
    mime_type = transcript_resp.get("mime_type", "audio/mp4")
    if not audio_b64:
        await send_message(chat_id, f"{tag}\nNo transcript available — template analysis skipped.")
        return
    try:
        template_analysis = await enrichment_proc.enrich_audio(job, audio_b64, mime_type)
    except enrichment_proc.EnrichmentUnavailableError:
        await send_message(chat_id, f"{tag}\n⚠️ Template analysis failed — Gemini unavailable.")
        return
    if template_analysis:
        section = enrichment_proc._format_template_analysis(template, template_analysis)
        await send_message(chat_id, f"{tag}{section}")
    return

# Caption-based path (unchanged below)
short_transcript = transcript_resp.get("text", "")
if not short_transcript:
    await send_message(chat_id, f"{tag}\nNo transcript available — template analysis skipped.")
    return

key_phrases = extract_key_phrases(short_transcript, max_phrases=8)
await database.update_job_status(
    job_id, "done",
    transcript=short_transcript,
    key_phrases=json.dumps(key_phrases),
)
enriched_job = await database.get_job(job_id)
if not enriched_job:
    return

try:
    enrichment_result, template_analysis = await enrichment_proc.enrich(enriched_job)
except enrichment_proc.EnrichmentUnavailableError:
    await send_message(chat_id, f"{tag}\n⚠️ Template analysis failed — Gemini unavailable.")
    return

if template_analysis:
    section = enrichment_proc._format_template_analysis(template, template_analysis)
    await send_message(chat_id, f"{tag}{section}")
    await database.update_job_status(
        job_id, "done",
        template_analysis=json.dumps(template_analysis),
    )
```

**Notes:**
- `jobs.transcript` and `jobs.key_phrases` are NOT written in the audio path — the transcript is never extracted as text.
- `template_analysis` from `enrich_audio` has the same shape as from `enrich`, so `_format_template_analysis` is reused unchanged.
- The audio path does NOT store `template_analysis` to DB (no enrichment base fields to store alongside it). This is acceptable for the template-path scope.

---

## 4. Enrichment Processor (`src/processors/enrichment.py`)

### New function `enrich_audio`

```python
async def enrich_audio(job: dict, audio_b64: str, mime_type: str) -> dict | None:
    """
    Single Gemini call: inline audio + enrichment/template prompt → template_analysis dict.
    Raises EnrichmentUnavailableError if both keys fail.
    Returns template_analysis dict or None if not produced.
    """
    template = job.get("template") or "summary"
    title = job.get("title", "") or "Untitled"
    prompt = _build_audio_prompt(title, template)

    for key in [settings.GEMINI_FREE_API_KEY, settings.GEMINI_PAID_API_KEY]:
        if not key:
            continue
        try:
            raw = await asyncio.to_thread(
                _call_gemini_audio_sync, audio_b64, mime_type, prompt, key
            )
            data = _extract_json(raw)
            log.info("enrichment_audio_ok", template=template)
            return data.get("template_analysis")
        except Exception:
            log.warning("enrichment_audio_key_failed")

    raise EnrichmentUnavailableError("Both Gemini keys failed for audio enrichment")
```

### New helper `_build_audio_prompt`

```python
def _build_audio_prompt(title: str, template: str) -> str:
    extra = PROMPT_TEMPLATES.get(template, PROMPT_TEMPLATES["summary"]).extra_instructions
    return f"""Analyze the audio content of this video titled: "{title}".

Listen to the spoken content and extract the template-specific analysis.

Return ONLY a valid JSON object — no markdown fences, no commentary:

{{
  "template_analysis": <template-specific object per the instructions below>
}}

{extra}"""
```

### New sync helper `_call_gemini_audio_sync`

```python
def _call_gemini_audio_sync(audio_b64: str, mime_type: str, prompt: str, api_key: str) -> str:
    import base64
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    parts = [
        types.Part.from_bytes(data=base64.b64decode(audio_b64), mime_type=mime_type),
        prompt,
    ]
    response = client.models.generate_content(model="gemini-2.5-flash", contents=parts)
    return response.text or ""
```

**Notes:**
- Uses `gemini-2.5-flash` (same as existing vision call).
- Free→paid fallback pattern matches all other Gemini calls in this codebase.
- `_extract_json` and `EnrichmentUnavailableError` are reused from the existing enrichment module.

---

## 5. Files Touched

| File | Change |
|---|---|
| `transcript_server.py` | Add `_download_audio_b64`; new fallback branch in `/transcript` when no VTT found |
| `src/services/transcript.py` | No change — `fetch_transcript` already returns raw dict |
| `src/processors/short_video.py` | Audio routing branch in template path |
| `src/processors/enrichment.py` | Add `enrich_audio`, `_build_audio_prompt`, `_call_gemini_audio_sync` |
| `docker-compose.yml` | No change — transcript service needs no new env vars |

---

## 6. Invariants

1. **Two-call budget preserved.** Vision call + Audio-Enrichment call = 2 `generate_content` calls, same as the caption path.
2. **Transcript service has no Gemini keys.** All Gemini calls remain in the worker/processor layer.
3. **Audio file stays in the transcript container.** The base64 payload is returned over HTTP; no file is written to the worker container's disk.
4. **Caption path is unchanged.** No existing behaviour is modified for videos that have captions.
5. **`jobs.transcript` stays empty for audio-path jobs.** Only `template_analysis` is the output.

---

## 7. Error Handling

| Failure point | Behaviour |
|---|---|
| yt-dlp audio download fails in transcript service | Returns `{"error": {"type": "transcription_failed"}}` |
| `fetch_transcript` HTTP call throws | `short_video.py` catches exception → sends "No transcript available" |
| `audio_b64` missing from response | Falls through to "No transcript available" |
| Both Gemini keys fail in `enrich_audio` | Raises `EnrichmentUnavailableError` → sends "⚠️ Template analysis failed — Gemini unavailable." |
| Gemini returns unparseable JSON | `_extract_json` raises → caught by `except Exception` in `enrich_audio` → key fallback, then `EnrichmentUnavailableError` |

---

## 8. Out of Scope

- Long video pipeline — not affected.
- Plain URL (non-template) short video jobs — `fetch_transcript` is never called for these.
- Storing the transcript text — audio path deliberately skips this.
- `key_phrases` extraction — audio path skips this; it was only a hint to the text enrichment prompt and is not meaningful without transcript text.
- Multilingual support — `base.en` vs multilingual model question is moot since Gemini handles language detection natively.
