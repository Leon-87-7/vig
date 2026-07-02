"""Shared Google OAuth token encryption helpers."""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet


def google_token_fernet(raw_key: str) -> Fernet:
    if not raw_key:
        raise RuntimeError("GOOGLE_TOKEN_ENCRYPTION_KEY is required for per-user Google tokens")
    key = base64.urlsafe_b64encode(hashlib.sha256(raw_key.encode()).digest())
    return Fernet(key)