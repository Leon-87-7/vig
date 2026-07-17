def job_tag(job_id: str) -> str:
    return f"job_{job_id[-4:]}:"


def job_dashboard_url(job_id: str) -> str:
    from src.config import settings
    return f"{settings.DASHBOARD_URL}/jobs/{job_id}"
