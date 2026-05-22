# vig — Video Intelligence Gateway

**vig** is a Python (FastAPI + SQLite + Redis) Telegram bot that replaces a 60-node n8n workflow: it accepts short-video links (Instagram Reels, YouTube Shorts, TikTok) and long-video links (YouTube), enriches them through Gemini Vision/Text pipelines, stores outputs in Google Drive and Sheets, and builds a semantic link graph ("Second Brain") that surfaces related content on demand.

For architecture and API design see [`docs/seed/PRD.md`](docs/seed/PRD.md).
For contributor and agent instructions see [`CLAUDE.md`](CLAUDE.md).
