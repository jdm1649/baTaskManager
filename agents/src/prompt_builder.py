"""Build the BA chat-completion messages from templates and examples.

Phase 1 packs *all* examples into the prompt. Phase 2 will swap this out for
Chroma top-k retrieval - the signature of `build_messages` stays the same, so
only the retrieval source changes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence

from pydantic import ValidationError

from schemas import VAExample


AGENTS_DIR = Path(__file__).resolve().parents[1]
PROMPTS_DIR = AGENTS_DIR / "prompts"
EXAMPLES_DIR = AGENTS_DIR / "examples"


def load_examples(examples_dir: Path = EXAMPLES_DIR) -> list[VAExample]:
    """Load every `*.json` under `examples_dir`, sorted by filename.

    Sorting by filename keeps prompt ordering deterministic, which matters for
    eyeballing diffs when you tweak the prompt.
    """
    files = sorted(examples_dir.glob("*.json"))
    if not files:
        raise FileNotFoundError(f"No example JSON files found under {examples_dir}")

    examples: list[VAExample] = []
    for f in files:
        try:
            examples.append(VAExample.model_validate_json(f.read_text(encoding="utf-8")))
        except ValidationError as exc:
            raise ValueError(f"Invalid example file {f.name}: {exc}") from exc
    return examples


def _render_example(ex: VAExample) -> str:
    diag = "\n".join(f"  {i + 1}. {step}" for i, step in enumerate(ex.diagnosis_steps))
    tags = ", ".join(ex.tags) if ex.tags else "(none)"
    return (
        f"## Example: {ex.title}\n"
        f"- id: {ex.id}\n"
        f"- category: {ex.category}\n"
        f"- priority: {ex.priority}\n"
        f"- tags: {tags}\n\n"
        f"**Problem reported**\n{ex.problem_reported}\n\n"
        f"**Expected behavior**\n{ex.expected_behavior}\n\n"
        f"**Actual behavior**\n{ex.actual_behavior}\n\n"
        f"**Diagnosis steps**\n{diag or '  (none recorded)'}\n\n"
        f"**Resolution**\n{ex.resolution}\n\n"
        f"**Confirmation**\n{ex.confirmation}\n"
    )


def render_examples_block(examples: Sequence[VAExample]) -> str:
    return "\n---\n".join(_render_example(e) for e in examples)


def load_system_prompt() -> str:
    return (PROMPTS_DIR / "ba_system_prompt.md").read_text(encoding="utf-8")


def load_user_template() -> str:
    return (PROMPTS_DIR / "ba_user_prompt_template.md").read_text(encoding="utf-8")


def build_messages(task: str, examples: Sequence[VAExample] | None = None) -> list[dict]:
    """Assemble the chat messages for a BA run.

    Args:
        task: The new incoming task text.
        examples: Optional override; defaults to every example on disk.
    """
    if examples is None:
        examples = load_examples()

    system = load_system_prompt()
    template = load_user_template()
    user = template.format(
        examples_block=render_examples_block(examples),
        task=task.strip(),
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def dump_messages_debug(messages: list[dict]) -> str:
    """Pretty-print the full message list for --dry-run."""
    return json.dumps(messages, indent=2, ensure_ascii=False)
