"""Pydantic schemas for the subtask testing loop.

The atomic unit is a **subtask**: one narrow question asked to the model
about a parent task. Every run of a subtask produces a `SubtaskRun` record
capturing exactly what we sent, what we got back, and what LM Studio was
doing at the time. The run history is the tuning artifact.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


SubtaskKind = Literal[
    "restate",
    "expected_behavior",
    "actual_behavior",
    "categorize",
    "first_diagnostic_step",
    "next_diagnostic_step",
    "confirmation_plan",
]


class ModelSettings(BaseModel):
    """Per-subtask sampling settings sent to LM Studio."""

    model_config = ConfigDict(extra="forbid")

    temperature: float = Field(0.0, ge=0.0, le=2.0)
    max_tokens: int = Field(256, ge=1)
    top_p: float | None = Field(None, ge=0.0, le=1.0)


class Subtask(BaseModel):
    """One narrow question to ask the model about a parent task."""

    model_config = ConfigDict(extra="forbid")

    kind: SubtaskKind
    order: int = Field(..., ge=1)
    question: str = Field(
        ...,
        description=(
            "The question to ask the model. Must be a single, narrow instruction. "
            "The parent task text will be appended automatically."
        ),
    )
    model_settings: ModelSettings = Field(default_factory=ModelSettings)
    notes: str = Field(
        "",
        description="Freeform notes about why this prompt is shaped this way.",
    )


class LMRuntimeInfo(BaseModel):
    """Metadata LM Studio reports about a completion (from /api/v0)."""

    model_config = ConfigDict(extra="allow")

    stop_reason: str | None = None
    tokens_per_second: float | None = None
    time_to_first_token: float | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    quant: str | None = None
    context_length: int | None = None
    runtime: str | None = None


class SubtaskRun(BaseModel):
    """One completed run of a subtask. Written to outputs/ as the tuning record."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    subtask_kind: SubtaskKind
    subtask_order: int
    run_started_at: datetime
    model: str
    sent_messages: list[dict]
    sent_settings: ModelSettings
    response_content: str
    runtime: LMRuntimeInfo
    user_notes: str = ""


class LoadedTask(BaseModel):
    """A task plus its subtasks, loaded from disk.

    This is an in-memory convenience object; it is not persisted as one file.
    The canonical on-disk layout is:

        tasks/<task_id>/task.md
        tasks/<task_id>/subtasks/<NN>_<kind>.json
    """

    model_config = ConfigDict(extra="forbid")

    task_id: str
    task_text: str
    subtasks: list[Subtask]
