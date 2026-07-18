def job_tag(job_id: str) -> str:
    return f"job_{job_id[-4:]}:"


def job_dashboard_url(job_id: str) -> str | None:
    """Absolute dashboard link for a job, or None if DASHBOARD_URL isn't configured."""
    from src.config import settings
    if not settings.DASHBOARD_URL:
        return None
    return f"{settings.DASHBOARD_URL.rstrip('/')}/jobs/{job_id}"


async def dashboard_button_row(job_id: str, chat_id: int) -> list[list[dict]]:
    """Inline-keyboard row that logs chat_id straight into the job's dashboard page,
    or [] if unconfigured or the handoff mint fails.

    Skips the Telegram Login Widget on purpose: the widget can't complete inside
    Telegram's own in-app browser (opening it there prompts a confusing full
    Telegram login), so the link carries a single-use handoff token instead —
    same mechanism as the Mini App -> Google connect handoff (src/api/auth.py).
    Best-effort like the rest of this module's buttons: a Redis/DB hiccup should
    drop the button, not the whole completion message.
    """
    from src.config import settings
    if not settings.DASHBOARD_URL:
        return []

    from src import database
    from src.auth import session as session_store
    from src.utils.logger import get_logger

    try:
        user = await database.get_user(chat_id)
        if user is None:
            return []

        session_id = await session_store.mint(
            {
                "id": chat_id,
                "first_name": user.get("first_name"),
                "username": user.get("username"),
                "photo_url": user.get("photo_url"),
            }
        )
        token = await session_store.mint_handoff(session_id, ttl=7 * 24 * 3600)
    except Exception:
        get_logger(__name__).warning("dashboard_button.handoff_mint_failed", job_id=job_id, exc_info=True)
        return []

    base = settings.DASHBOARD_URL.rstrip("/")
    url = f"{base}/api/auth/handoff?token={token}&job_id={job_id}"
    return [[{"text": "🔗 Open in Dashboard", "url": url}]]
