def job_tag(job_id: str) -> str:
    return f"job_{job_id[-4:]}:"


def job_dashboard_url(job_id: str) -> str | None:
    """Absolute dashboard link for a job, or None if DASHBOARD_URL isn't configured."""
    from src.config import settings
    if not settings.DASHBOARD_URL:
        return None
    return f"{settings.DASHBOARD_URL.rstrip('/')}/jobs/{job_id}"


def dashboard_button_row(job_id: str) -> list[list[dict]]:
    """Inline-keyboard row linking to the job's dashboard page, or [] if unconfigured."""
    url = job_dashboard_url(job_id)
    if not url:
        return []
    return [[{"text": "🔗 Open in Dashboard", "url": url}]]
