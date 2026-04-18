"""Typed configuration loaded from environment / .env.

Keep this file boring: one dataclass, one loader, no surprises.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


AGENTS_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class BAConfig:
    base_url: str
    api_key: str
    model: str
    temperature: float
    max_tokens: int
    request_timeout: int


def load_config() -> BAConfig:
    """Load config from `agents/.env` if present, then from the environment."""
    load_dotenv(AGENTS_DIR / ".env", override=False)

    return BAConfig(
        base_url=os.getenv("LM_STUDIO_BASE_URL", "http://localhost:1234/v1"),
        api_key=os.getenv("LM_STUDIO_API_KEY", "lm-studio"),
        model=os.getenv("BA_MODEL", "llama-3.1-8b-instruct"),
        temperature=float(os.getenv("BA_TEMPERATURE", "0.2")),
        max_tokens=int(os.getenv("BA_MAX_TOKENS", "2048")),
        request_timeout=int(os.getenv("BA_REQUEST_TIMEOUT", "120")),
    )
