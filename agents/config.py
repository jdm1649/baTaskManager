"""Typed configuration loaded from environment / .env.

For the subtask testing loop we only need the LM Studio connection details
and a couple of safety rails. Sampling settings live per-subtask, not here.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


AGENTS_DIR = Path(__file__).resolve().parent
TASKS_DIR = AGENTS_DIR / "tasks"
OUTPUTS_DIR = AGENTS_DIR / "outputs"


@dataclass(frozen=True)
class AppConfig:
    base_url: str
    """OpenAI-compatible base URL, e.g. http://127.0.0.1:1234/v1"""

    native_base_url: str
    """LM Studio native base URL (for richer metadata), e.g. http://127.0.0.1:1234/api/v0"""

    api_key: str
    model: str
    request_timeout: int

    max_prompt_tokens: int
    """Hard cap: if a subtask's prompt exceeds this, the run aborts before sending.

    Set well below the loaded context_length so we never silently truncate.
    """


def load_config() -> AppConfig:
    load_dotenv(AGENTS_DIR / ".env", override=False)

    openai_base = os.getenv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1").rstrip("/")
    native_base = os.getenv("LM_STUDIO_NATIVE_URL", openai_base.replace("/v1", "/api/v0"))

    return AppConfig(
        base_url=openai_base,
        native_base_url=native_base.rstrip("/"),
        api_key=os.getenv("LM_STUDIO_API_KEY", "lm-studio"),
        model=os.getenv("BA_MODEL", "mistralai/mistral-7b-instruct-v0.3"),
        request_timeout=int(os.getenv("BA_REQUEST_TIMEOUT", "180")),
        max_prompt_tokens=int(os.getenv("BA_MAX_PROMPT_TOKENS", "3000")),
    )
