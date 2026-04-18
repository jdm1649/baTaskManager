"""Thin wrapper around LM Studio's OpenAI-compatible chat endpoint.

Kept deliberately small: one function in, one string out. Everything
JSON/schema-related happens a layer up in `ba_agent.py`.
"""

from __future__ import annotations

from openai import OpenAI

from config import BAConfig


def build_client(cfg: BAConfig) -> OpenAI:
    return OpenAI(
        base_url=cfg.base_url,
        api_key=cfg.api_key,
        timeout=cfg.request_timeout,
    )


def chat(cfg: BAConfig, messages: list[dict], *, client: OpenAI | None = None) -> str:
    """Run a single chat completion and return the assistant text."""
    client = client or build_client(cfg)
    response = client.chat.completions.create(
        model=cfg.model,
        messages=messages,
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
    )
    choice = response.choices[0]
    content = choice.message.content or ""
    return content
