"""Read-only Restricted mode preview endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response

from src import database
from src.api import jobs as jobs_api
from src.config import settings

PREVIEW_COOKIE_NAME = "ownix_preview"
PREVIEW_LIMIT = 50
TAB_LIMIT = 20

preview_router = APIRouter(prefix="/api/preview", tags=["preview"])


def _require_preview(request: Request) -> None:
    if request.cookies.get(PREVIEW_COOKIE_NAME) != "1":
        raise HTTPException(status_code=401, detail="Restricted preview required")
    if settings.OPERATOR_CHAT_ID is None:
        raise HTTPException(status_code=503, detail="Preview operator is not configured")


def _preview_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "private, max-age=30"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"


async def _preview_ids() -> list[str]:
    operator = settings.OPERATOR_CHAT_ID
    if operator is None:
        return []
    async with database.connection() as conn:
        cur = await conn.execute(
            """
            SELECT id, content_type, created_at,
                   CASE WHEN created_at >= datetime('now', '-12 hours') THEN 0 ELSE 1 END AS age_bucket
            FROM jobs
            WHERE chat_id = ? AND status != 'cancelled'
            ORDER BY age_bucket ASC, created_at DESC, id DESC
            LIMIT 300
            """,
            (operator,),
        )
        rows = [dict(row) for row in await cur.fetchall()]
    selected: list[str] = []
    counts: dict[str, int] = {}
    for row in rows:
        ct = row.get("content_type") or "unknown"
        if counts.get(ct, 0) >= TAB_LIMIT:
            continue
        selected.append(row["id"])
        counts[ct] = counts.get(ct, 0) + 1
        if len(selected) >= PREVIEW_LIMIT:
            break
    return selected


async def _preview_rows() -> list[dict]:
    ids = await _preview_ids()
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    async with database.connection() as conn:
        cur = await conn.execute(
            f"""
            SELECT id, title, content_type, status, url, created_at, og_image_url, telegram_delivery
            FROM jobs
            WHERE id IN ({placeholders})
            ORDER BY created_at DESC, id DESC
            """,
            ids,
        )
        rows = [dict(row) for row in await cur.fetchall()]
    short_ids = [r["id"] for r in rows if r["content_type"] == "short" and jobs_api._is_persistable_short_platform(r["url"])]
    stored_ids = await database.get_thumbnail_job_ids(short_ids)
    for item in rows:
        item["thumbnail_url"], item["thumbnail_kind"] = await jobs_api._resolve_thumbnail(item, stored_ids)
    return rows


@preview_router.get("/jobs")
async def list_preview_jobs(
    request: Request,
    response: Response,
    content_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=1000),
) -> dict:
    _require_preview(request)
    _preview_headers(response)
    rows = await _preview_rows()
    if content_type is not None:
        rows = [row for row in rows if row.get("content_type") == content_type]
    if status is not None:
        rows = [row for row in rows if row.get("status") == status]
    total = len(rows)
    offset = (page - 1) * limit
    return {"items": rows[offset : offset + limit], "total": total, "page": page, "limit": limit}


@preview_router.get("/jobs/stats")
async def get_preview_stats(
    request: Request,
    response: Response,
    content_type: str | None = Query(default=None),
) -> dict:
    _require_preview(request)
    _preview_headers(response)
    rows = await _preview_rows()
    by_content_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for row in rows:
        by_content_type[row["content_type"]] = by_content_type.get(row["content_type"], 0) + 1
        if content_type is None or row["content_type"] == content_type:
            by_status[row["status"]] = by_status.get(row["status"], 0) + 1
    return {"total": sum(by_status.values()), "by_status": by_status, "by_content_type": by_content_type}


PRIVATE_DETAIL_FIELDS = {"drive_url", "sheets_row_id"}
TRANSCRIPT_CAP = 1200


@preview_router.get("/jobs/{job_id}")
async def get_preview_job(job_id: str, request: Request, response: Response) -> dict:
    _require_preview(request)
    _preview_headers(response)
    ids = set(await _preview_ids())
    if job_id not in ids:
        raise HTTPException(status_code=404, detail="Preview job not found")
    async with database.connection() as conn:
        cur = await conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Preview job not found")
    job = dict(row)
    fields = jobs_api._detail_fields_for(job.get("content_type", ""))
    payload = {k: job.get(k) for k in fields if k not in PRIVATE_DETAIL_FIELDS}
    payload["drive_url"] = None
    if isinstance(payload.get("transcript"), str) and len(payload["transcript"]) > TRANSCRIPT_CAP:
        payload["transcript"] = payload["transcript"][:TRANSCRIPT_CAP].rstrip() + "…"
    return payload
