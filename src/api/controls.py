"""HTTP endpoints for user Controls (tags CRUD — issue #87)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from src import database
from src.utils.logger import get_logger

log = get_logger(__name__)

controls_router = APIRouter(prefix="/api/controls", tags=["controls"])


class TagIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    meaning: str = Field(default="", max_length=500)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")


@controls_router.get("/tags")
async def list_tags(request: Request) -> list[dict]:
    chat_id: int = request.state.user["id"]
    return await database.list_tags(chat_id)


@controls_router.post("/tags", status_code=201)
async def create_tag(body: TagIn, request: Request) -> dict:
    chat_id: int = request.state.user["id"]
    try:
        return await database.create_tag(
            chat_id=chat_id, name=body.name.strip(), meaning=body.meaning, color=body.color
        )
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=409, detail="Tag name already exists")
        raise


@controls_router.put("/tags/{tag_id}")
async def update_tag(tag_id: str, body: TagIn, request: Request) -> dict:
    chat_id: int = request.state.user["id"]
    ok = await database.update_tag(
        chat_id=chat_id, tag_id=tag_id, name=body.name.strip(), meaning=body.meaning, color=body.color
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"id": tag_id, "name": body.name, "meaning": body.meaning, "color": body.color}


@controls_router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: str, request: Request) -> None:
    chat_id: int = request.state.user["id"]
    ok = await database.delete_tag(chat_id=chat_id, tag_id=tag_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tag not found")
