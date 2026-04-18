"""LM Studio client using the native /api/v0 endpoint for richer metadata.

We deliberately use LM Studio's native endpoint instead of the OpenAI-compatible
/v1 one. The native response includes:

- `stats.stop_reason` (eosFound / maxTokensReached / userStopped): critical
  for detecting loops vs. clean stops
- `stats.tokens_per_second`: performance signal for tuning
- `stats.time_to_first_token`: latency signal
- `model_info.quant`, `model_info.context_length`: what's actually loaded
- `runtime.name`, `runtime.version`: GPU backend / llama.cpp version

We also call /api/v0/models once at startup to know what's loaded.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from config import AppConfig
from schemas import LMRuntimeInfo, ModelSettings


@dataclass(frozen=True)
class ChatResult:
    content: str
    runtime: LMRuntimeInfo


@dataclass(frozen=True)
class LoadedModelInfo:
    model_id: str
    quant: str | None
    loaded_context_length: int | None
    max_context_length: int | None
    state: str | None


class LMStudioError(RuntimeError):
    """Raised on any LM Studio HTTP failure or unexpected response shape."""


def _post_json(url: str, body: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise LMStudioError(f"POST {url} failed: {exc.code} {exc.reason}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise LMStudioError(f"POST {url} failed to connect: {exc}") from exc


def _get_json(url: str, timeout: int) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise LMStudioError(f"GET {url} failed: {exc.code} {exc.reason}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise LMStudioError(f"GET {url} failed to connect: {exc}") from exc


def list_loaded_models(cfg: AppConfig) -> list[LoadedModelInfo]:
    """Return metadata for every model LM Studio knows about."""
    body = _get_json(f"{cfg.native_base_url}/models", timeout=10)
    out: list[LoadedModelInfo] = []
    for m in body.get("data", []):
        if m.get("type") not in (None, "llm"):
            continue
        out.append(
            LoadedModelInfo(
                model_id=m.get("id", "?"),
                quant=m.get("quantization"),
                loaded_context_length=m.get("loaded_context_length"),
                max_context_length=m.get("max_context_length"),
                state=m.get("state"),
            )
        )
    return out


def find_model(cfg: AppConfig, model_id: str) -> LoadedModelInfo | None:
    for m in list_loaded_models(cfg):
        if m.model_id == model_id:
            return m
    return None


def chat(
    cfg: AppConfig,
    messages: list[dict],
    settings: ModelSettings,
) -> ChatResult:
    """Run one chat completion via LM Studio's native endpoint.

    Returns the assistant text plus a populated LMRuntimeInfo with stats
    from the server (stop reason, tok/s, time to first token, token counts,
    quant, context length, runtime).
    """
    body: dict = {
        "model": cfg.model,
        "messages": messages,
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
    }
    if settings.top_p is not None:
        body["top_p"] = settings.top_p

    raw = _post_json(
        f"{cfg.native_base_url}/chat/completions",
        body,
        timeout=cfg.request_timeout,
    )

    try:
        choice = raw["choices"][0]
        content = choice["message"]["content"] or ""
    except (KeyError, IndexError) as exc:
        raise LMStudioError(f"Unexpected response shape: {raw!r}") from exc

    stats = raw.get("stats", {})
    usage = raw.get("usage", {})
    model_info = raw.get("model_info", {})
    runtime = raw.get("runtime", {})

    info = LMRuntimeInfo(
        stop_reason=stats.get("stop_reason"),
        tokens_per_second=stats.get("tokens_per_second"),
        time_to_first_token=stats.get("time_to_first_token"),
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        total_tokens=usage.get("total_tokens"),
        quant=model_info.get("quant"),
        context_length=model_info.get("context_length"),
        runtime=(
            f"{runtime.get('name')} v{runtime.get('version')}"
            if runtime.get("name")
            else None
        ),
    )
    return ChatResult(content=content, runtime=info)
