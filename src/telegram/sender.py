"""Direct Telegram Bot API calls via httpx — no wrapper library (PRD §D1)."""

from __future__ import annotations

from typing import Any

import httpx

from src.config import settings
from src.utils.logger import get_logger

log = get_logger(__name__)


_API_BASE = "https://api.telegram.org"
_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=15.0)
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _endpoint(method: str) -> str:
    return f"{_API_BASE}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"


def _raise_for_status(
    response: httpx.Response,
    *,
    method: str,
    chat_id: int | None = None,
    parse_mode: str | None = None,
) -> None:
    """Like ``response.raise_for_status()`` but first logs Telegram's error body.

    Telegram puts the real reason for a 4xx in the JSON body — e.g.
    ``"description": "Bad Request: can't parse entities: ..."``. The bare
    ``raise_for_status()`` raised before that body was ever read, so failures
    only logged a useless ``400 Bad Request``. Capture and log it here, then
    raise exactly as before so callers' behaviour is unchanged.
    """
    if response.status_code < 400:
        return
    try:
        detail: Any = response.json()
    except Exception:
        detail = response.text
    log.error(
        "telegram_http_error",
        method=method,
        chat_id=chat_id,
        status=response.status_code,
        parse_mode=parse_mode,
        response=detail,
    )
    response.raise_for_status()


async def send_message(
    chat_id: int,
    text: str,
    *,
    reply_to_message_id: int | None = None,
    parse_mode: str | None = None,
) -> dict[str, Any]:
    """Send a plain Telegram message. Returns the parsed `result` field on success."""
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
    if reply_to_message_id is not None:
        payload["reply_to_message_id"] = reply_to_message_id
    if parse_mode is not None:
        payload["parse_mode"] = parse_mode

    response = await _http().post(_endpoint("sendMessage"), json=payload)
    _raise_for_status(response, method="sendMessage", chat_id=chat_id, parse_mode=parse_mode)
    body = response.json()
    if not body.get("ok"):
        log.error("telegram_send_failed", chat_id=chat_id, response=body)
        raise RuntimeError(f"Telegram sendMessage failed: {body!r}")
    log.info("telegram_message_sent", chat_id=chat_id)
    return body.get("result", {})


async def send_photo(
    chat_id: int,
    photo_bytes: bytes,
    *,
    caption: str | None = None,
) -> dict[str, Any]:
    """Send a photo via multipart/form-data."""
    data: dict[str, Any] = {"chat_id": str(chat_id)}
    if caption:
        data["caption"] = caption
    files = {"photo": ("photo.jpg", photo_bytes, "image/jpeg")}
    response = await _http().post(_endpoint("sendPhoto"), data=data, files=files)
    _raise_for_status(response, method="sendPhoto", chat_id=chat_id)
    body = response.json()
    if not body.get("ok"):
        log.error("telegram_photo_failed", chat_id=chat_id, response=body)
        raise RuntimeError(f"Telegram sendPhoto failed: {body!r}")
    log.info("telegram_photo_sent", chat_id=chat_id)
    return body.get("result", {})


async def send_document(
    chat_id: int,
    file_bytes: bytes,
    filename: str,
    *,
    caption: str | None = None,
) -> dict[str, Any]:
    """Send a document via multipart/form-data."""
    data: dict[str, Any] = {"chat_id": str(chat_id)}
    if caption:
        data["caption"] = caption
    files = {"document": (filename, file_bytes, "text/markdown")}
    response = await _http().post(_endpoint("sendDocument"), data=data, files=files)
    _raise_for_status(response, method="sendDocument", chat_id=chat_id)
    body = response.json()
    if not body.get("ok"):
        log.error("telegram_document_failed", chat_id=chat_id, response=body)
        raise RuntimeError(f"Telegram sendDocument failed: {body!r}")
    log.info("telegram_document_sent", chat_id=chat_id, filename=filename)
    return body.get("result", {})


async def send_inline_keyboard(
    chat_id: int,
    text: str,
    buttons: list[list[dict]],
) -> dict[str, Any]:
    """Send a message with an inline keyboard. buttons is the inline_keyboard array."""
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": {"inline_keyboard": buttons},
    }
    response = await _http().post(_endpoint("sendMessage"), json=payload)
    _raise_for_status(response, method="sendMessage", chat_id=chat_id)
    body = response.json()
    if not body.get("ok"):
        log.error("telegram_keyboard_failed", chat_id=chat_id, response=body)
        raise RuntimeError(f"Telegram sendMessage (keyboard) failed: {body!r}")
    log.info("telegram_keyboard_sent", chat_id=chat_id)
    return body.get("result", {})


async def send_force_reply(
    chat_id: int,
    text: str,
    *,
    input_field_placeholder: str = "Your project direction...",
) -> dict[str, Any]:
    """Send a message that forces the user's next reply to address the bot."""
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": {
            "force_reply": True,
            "input_field_placeholder": input_field_placeholder,
        },
    }
    response = await _http().post(_endpoint("sendMessage"), json=payload)
    _raise_for_status(response, method="sendMessage", chat_id=chat_id)
    body = response.json()
    if not body.get("ok"):
        log.error("telegram_force_reply_failed", chat_id=chat_id, response=body)
        raise RuntimeError(f"Telegram sendMessage (ForceReply) failed: {body!r}")
    log.info("telegram_force_reply_sent", chat_id=chat_id)
    return body.get("result", {})


async def answer_callback_query(callback_query_id: str, text: str | None = None) -> None:
    """Acknowledge a Telegram callback query to dismiss the loading state."""
    payload: dict[str, Any] = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    response = await _http().post(_endpoint("answerCallbackQuery"), json=payload)
    _raise_for_status(response, method="answerCallbackQuery")


async def download_photo(file_id: str) -> tuple[bytes, str]:
    """Download a Telegram photo by file_id. Returns (raw_bytes, mime_type)."""
    resp = await _http().get(
        _endpoint("getFile"), params={"file_id": file_id}
    )
    _raise_for_status(resp, method="getFile")
    file_path: str = resp.json()["result"]["file_path"]
    dl_url = f"{_API_BASE}/file/bot{settings.TELEGRAM_BOT_TOKEN}/{file_path}"
    file_resp = await _http().get(dl_url)
    _raise_for_status(file_resp, method="getFile.download")
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else "jpg"
    mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return file_resp.content, mime_map.get(ext, "image/jpeg")
