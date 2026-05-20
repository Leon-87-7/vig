# Feature: Photo Link Extraction

## Summary

When a user uploads a photo (e.g. a screenshot of a Reel or TikTok), the bot uses Gemini Vision to extract any URLs / domain names visible in the image and replies with the same links-found message format used by the short video pipeline.

For batch uploads the user opens a 5-minute collection window with `/photoBatch-start`, sends any number of photos, then either sends `/photoBatch-end` or lets the timer expire — all collected images are sent to Gemini in one call.

## Decisions (from grill session)

| Question | Decision |
|---|---|
| Where are the links? | Visually embedded in the image (Gemini OCR/Vision) |
| Pipeline depth | Inline — no DB job, no queue, no Drive — but Brain ingest fire-and-forget |
| No links found (single) | `"🔍 No links found in this image.\nThat is what I did see:\n{summary}"` |
| No links found (batch) | `"🔍 No links found in this image."` (no summary) |
| Acknowledgment | Send `"🔍 Scanning image for links..."` before Gemini call |
| Caption context | If the photo has a Telegram caption, pass it to Gemini as additional context |
| Batch: photo sent during open window | Always queued into batch — no individual processing |
| Batch: `/photoBatch-start` during active window | Reset: discard collected photos, restart window, notify user |
| Batch: `/photoBatch-end` with no active window | Send `"No active batch — use /photoBatch-start first."` |
| Batch: `/photoBatch-end` with 0 photos | Send `"🔍 No links found in this image."` |
| Batch start notification | `"📸 Batch mode started! The bus leaves at {HH:MM:SS} UTC."` |

## Output format (links found)

Reuse `_build_links_message()` from `short_video.py`, promoted to `src/utils/markdown.py`:

```
🔗 Links Found:
• TrustMRR — Database of verified startup revenues
  🔗 https://trustmrr.com

---

🔗 Quick Links:
https://trustmrr.com
```

## Single photo sequence

```
User sends photo
      │
      ▼
webhook detects message.photo
      │
      ▼
asyncio.create_task(_handle_single_photo)  ← returns {"ok": True} immediately
      │
      ▼
download_photo(file_id)
      │
      ▼
send "🔍 Scanning image for links..."
      │
      ▼
call_gemini_photo_links([image], caption)
      │
      ├─ links found ──► send build_links_message(links)
      │                  fire-and-forget brain.ingest_links(links)
      │
      └─ no links ─────► send "🔍 No links found in this image.
                               That is what I did see:
                               {summary}"
```

## Batch photo sequence

```
User sends /photoBatch-start
      │
      ▼
Redis: SET photo_batch_active:{chat_id} EX 300
Redis: DEL photo_batch_files:{chat_id}
asyncio.create_task(_batch_auto_close)   ← sleeps 300s then fires
send "📸 Batch mode started! The bus leaves at {HH:MM:SS} UTC."
      │
      ▼
User sends photo(s)
      │
      ▼
webhook: batch active? → RPUSH photo_batch_files:{chat_id} {file_id}
      │
      ▼
User sends /photoBatch-end  (or 300s elapses)
      │
      ▼
_process_batch(chat_id)
      ├─ LRANGE photo_batch_files → file_ids
      ├─ DEL both Redis keys
      ├─ download all photos
      ├─ send "📸 Processing {n} image(s)..."
      ├─ call_gemini_photo_links([img1, img2, ...], caption=None)
      │
      ├─ links found ──► send build_links_message(links)
      │                  fire-and-forget brain.ingest_links(links)
      │
      └─ no links / 0 photos ──► send "🔍 No links found in this image."
```

## Files to change

### 1. `src/utils/markdown.py`
- Add `build_links_message(links: list[dict]) -> str`
- Move logic from `short_video._build_links_message` here so photo and video share it

### 2. `src/processors/short_video.py`
- Remove private `_build_links_message`
- Import and use `build_links_message` from `src.utils.markdown`

### 3. `src/services/gemini.py`
- Add `_PHOTO_PROMPT` — multi-image variant: extracts links + summary, no `main_frame_index`
- Add `call_gemini_photo_links(images: list[dict], free_key, paid_key, caption=None) -> dict`
  - `images` is `[{"bytes": bytes, "mime_type": str}, ...]`
  - Returns `{"summary": str, "links": [{"url", "label", "description"}]}`
  - Same free→paid key fallback as `call_gemini_vision`

### 4. `src/telegram/sender.py`
- Add `download_photo(file_id: str) -> tuple[bytes, str]`
  - Calls `getFile` API → gets `file_path`
  - Downloads raw bytes from `https://api.telegram.org/file/bot{token}/{file_path}`
  - Returns `(bytes, mime_type)` — inferred from extension (`.jpg` → `image/jpeg`, `.png` → `image/png`, default `image/jpeg`)

### 5. `src/telegram/webhook.py`
- Add Redis batch helpers using `queue._client()`:
  - `_is_batch_active(chat_id)`, `_add_to_batch(chat_id, file_id)`,
    `_get_batch_files(chat_id)`, `_clear_batch(chat_id)`
- Add `_handle_single_photo(chat_id, file_id, caption)` coroutine
- Add `_process_batch(chat_id)` coroutine
- Add `_batch_auto_close(chat_id)` coroutine (`asyncio.sleep(300)` guard)
- Handle `/photoBatch-start` and `/photoBatch-end` commands in the text branch
- Before the `if not chat_id or not text` early-return, route photo messages:
  - batch active → `_add_to_batch`
  - otherwise → `asyncio.create_task(_handle_single_photo(...))`

## Redis keys

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `photo_batch_active:{chat_id}` | string `"1"` | 300s | Signals an open batch window |
| `photo_batch_files:{chat_id}` | list of file_ids | 300s | Accumulated photo file_ids |

## Not in scope

- No DB job / job_id tag in replies
- No Drive upload
- No Sheets logging
- No Brave Search enrichment on extracted links (Gemini already infers/validates them)
