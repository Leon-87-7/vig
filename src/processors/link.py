"""Link pipeline processor — direct-add URLs into the Second Brain."""

from __future__ import annotations

from src import brain, database
from src.utils.og_image import extract_essential_og, flatten_essential_og
from src.utils.public_html import fetch_public_html


async def run(job: dict) -> None:
    """Fetch the page, collect Essential OG collection, and ingest one Brain link."""
    job_id = job["id"]
    url = job["url"]
    await database.update_job_status(job_id, "processing")

    result = await fetch_public_html(url)
    tags = extract_essential_og(result.html, result.final_url) if result else {}
    topic = flatten_essential_og(tags)

    title = tags.get("og:title")
    if title:
        async with database.connection() as conn:
            await conn.execute(
                "UPDATE jobs SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (title, job_id),
            )
            await conn.commit()

    # Link pipeline ingest is the job's purpose, not an article-style fire-and-forget
    # side effect — only mark done once it has landed.
    await brain.ingest_links(
        [{"url": url, "title": title, "og_image_url": tags.get("og:image")}],
        topic,
        job_id,
    )
    await database.update_job_status(job_id, "done")
