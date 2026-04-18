"""Load tasks + subtasks, build the single-question prompt, run, save.

On-disk layout:

    tasks/<task_id>/
        task.md                  (raw task text)
        subtasks/<NN>_<kind>.json (one Subtask per file)

Every run writes a SubtaskRun JSON to:

    outputs/<task_id>/<NN>_<kind>__<UTC-ISO>__<quant-or-nomodel>.json
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from config import AppConfig, OUTPUTS_DIR, TASKS_DIR
from schemas import LoadedTask, Subtask, SubtaskRun
from src.lm_studio_client import ChatResult


_ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*]')


class SubtaskError(RuntimeError):
    """Raised for all subtask-loading and prompt-guard failures."""


def list_task_ids(tasks_dir: Path = TASKS_DIR) -> list[str]:
    if not tasks_dir.exists():
        return []
    return sorted(p.name for p in tasks_dir.iterdir() if p.is_dir())


def load_task(task_id: str, tasks_dir: Path = TASKS_DIR) -> LoadedTask:
    task_dir = tasks_dir / task_id
    if not task_dir.is_dir():
        raise SubtaskError(f"Task directory not found: {task_dir}")

    task_md = task_dir / "task.md"
    if not task_md.is_file():
        raise SubtaskError(f"Missing task.md in {task_dir}")

    task_text = task_md.read_text(encoding="utf-8").strip()
    if not task_text:
        raise SubtaskError(f"{task_md} is empty")

    subtasks_dir = task_dir / "subtasks"
    subtasks: list[Subtask] = []
    if subtasks_dir.is_dir():
        for f in sorted(subtasks_dir.glob("*.json")):
            try:
                subtasks.append(Subtask.model_validate_json(f.read_text(encoding="utf-8")))
            except ValidationError as exc:
                raise SubtaskError(f"Invalid subtask {f.name}: {exc}") from exc

    subtasks.sort(key=lambda s: s.order)
    return LoadedTask(task_id=task_id, task_text=task_text, subtasks=subtasks)


def build_messages(task_text: str, subtask: Subtask) -> list[dict]:
    """Build the minimal chat-message list: one user turn.

    No system role (Mistral v0.3's chat template rejects it). No examples,
    no methodology - just the one question and the task text.
    """
    content = (
        f"{subtask.question.strip()}\n\n"
        f"TASK:\n{task_text.strip()}"
    )
    return [{"role": "user", "content": content}]


def enforce_prompt_token_budget(
    messages: list[dict],
    cfg: AppConfig,
    *,
    token_counter=None,
) -> int:
    """Hard-stop if the prompt would exceed `cfg.max_prompt_tokens`.

    In Phase 1 of the testing loop we don't use tiktoken (Mistral isn't on
    OpenAI tokenizers anyway). We use a conservative char-based proxy:
    roughly 3.5 chars per token for English prose with code. This overestimates
    token count slightly, which is the safe direction for a guard.

    `token_counter` is accepted for future use / testing override; if given,
    it's called as `token_counter(text) -> int` and trusted.
    """
    joined = "\n".join(m.get("content", "") for m in messages)
    if token_counter is not None:
        estimated = token_counter(joined)
    else:
        estimated = max(1, len(joined) // 3)  # deliberately pessimistic

    if estimated > cfg.max_prompt_tokens:
        raise SubtaskError(
            f"Prompt would be ~{estimated} tokens, exceeding the "
            f"{cfg.max_prompt_tokens} budget. Shrink the subtask question "
            f"or raise BA_MAX_PROMPT_TOKENS."
        )
    return estimated


def _safe_filename_component(s: str) -> str:
    return _ILLEGAL_FILENAME_CHARS.sub("_", s)


def save_run(
    task_id: str,
    subtask: Subtask,
    messages: list[dict],
    chat_result: ChatResult,
    model: str,
    user_notes: str = "",
    outputs_dir: Path = OUTPUTS_DIR,
) -> Path:
    """Persist a SubtaskRun to disk and return the written path."""
    started = datetime.now(timezone.utc)
    quant = chat_result.runtime.quant or "nomodelinfo"
    stamp = started.strftime("%Y-%m-%dT%H-%M-%SZ")

    run = SubtaskRun(
        task_id=task_id,
        subtask_kind=subtask.kind,
        subtask_order=subtask.order,
        run_started_at=started,
        model=model,
        sent_messages=messages,
        sent_settings=subtask.model_settings,
        response_content=chat_result.content,
        runtime=chat_result.runtime,
        user_notes=user_notes,
    )

    task_out = outputs_dir / task_id
    task_out.mkdir(parents=True, exist_ok=True)

    fname = f"{subtask.order:02d}_{_safe_filename_component(subtask.kind)}__{stamp}__{_safe_filename_component(quant)}.json"
    path = task_out / fname
    path.write_text(
        run.model_dump_json(indent=2),
        encoding="utf-8",
    )
    return path
