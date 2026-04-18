"""BA agent: task text in, validated BAWorkflow out."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from pydantic import ValidationError

from config import BAConfig, load_config
from schemas import BAWorkflow
from src.lm_studio_client import chat
from src.prompt_builder import build_messages


_FENCED_JSON_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


class BAOutputError(RuntimeError):
    """Raised when the model output cannot be parsed into a BAWorkflow."""


@dataclass(frozen=True)
class BARunResult:
    workflow: BAWorkflow
    raw_output: str


def _extract_json_object(text: str) -> str:
    """Return the first balanced JSON object found in `text`.

    Local models, especially when quantized, sometimes wrap JSON in Markdown
    fences or add a preamble despite instructions. This rescues those cases
    without silently accepting malformed output.
    """
    text = text.strip()
    if not text:
        raise BAOutputError("Model returned empty content.")

    fenced = _FENCED_JSON_RE.search(text)
    if fenced:
        return fenced.group(1).strip()

    start = text.find("{")
    if start == -1:
        raise BAOutputError(f"No '{{' in model output. First 200 chars: {text[:200]!r}")

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    raise BAOutputError("Reached end of model output without a balanced JSON object.")


def parse_workflow(raw: str) -> BAWorkflow:
    try:
        payload = _extract_json_object(raw)
    except BAOutputError:
        raise
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise BAOutputError(f"Model output was not valid JSON: {exc}") from exc
    try:
        return BAWorkflow.model_validate(data)
    except ValidationError as exc:
        raise BAOutputError(f"Model output failed schema validation: {exc}") from exc


def run_ba(task: str, cfg: BAConfig | None = None) -> BARunResult:
    """End-to-end BA run: task -> prompt -> LM Studio -> validated workflow."""
    cfg = cfg or load_config()
    messages = build_messages(task)
    raw = chat(cfg, messages)
    workflow = parse_workflow(raw)
    return BARunResult(workflow=workflow, raw_output=raw)
