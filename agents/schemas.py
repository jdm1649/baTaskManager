"""Pydantic schemas for Phase 1.

Two kinds of data are modeled here:

* `VAExample` - a documented past support ticket, used as an in-context
  reference for the BA model. The fields map directly to the Section 5
  "First Step" list in the planning doc.
* `BAWorkflow` - the structured output we ask the BA model to produce for a
  new task. Forcing structure now keeps Phase 2/3 (Chroma storage, categorizer
  routing) machine-processable without re-parsing free text.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


Priority = Literal["low", "medium", "high", "urgent"]


class VAExample(BaseModel):
    """A single documented VA example loaded from `examples/*.json`."""

    id: str = Field(..., description="Stable identifier, e.g. '01_checkout_button_broken'.")
    title: str = Field(..., description="One-line summary of the ticket.")
    category: str = Field(
        ...,
        description=(
            "Coarse category label (e.g. 'auth', 'billing', 'notifications'). "
            "Used later by the Sorting Layer; for Phase 1 it is just metadata."
        ),
    )
    priority: Priority = "medium"

    problem_reported: str = Field(..., description="The problem as the user reported it.")
    expected_behavior: str = Field(..., description="What the system was supposed to do.")
    actual_behavior: str = Field(..., description="What the system was actually doing.")
    diagnosis_steps: list[str] = Field(
        default_factory=list,
        description="Ordered steps you took to isolate the cause.",
    )
    resolution: str = Field(..., description="What fixed the issue.")
    confirmation: str = Field(
        ...,
        description="How you confirmed the fix held (what you checked at the end).",
    )
    tags: list[str] = Field(default_factory=list)


class BAStep(BaseModel):
    """A single step in the BA-generated workflow."""

    order: int = Field(..., ge=1, description="1-based step index.")
    action: str = Field(..., description="What to do in this step (imperative).")
    rationale: str = Field(..., description="Why this step, tied to the hypothesis.")
    expected_outcome: str = Field(
        ...,
        description="What result should be observed if the hypothesis holds.",
    )


class BAWorkflow(BaseModel):
    """Structured BA output for a new task.

    Mirrors the VA methodology: state the hypothesis (expected vs actual),
    enumerate diagnostic steps, then describe how success will be confirmed.
    """

    task_summary: str = Field(..., description="One-sentence restatement of the incoming task.")
    suspected_category: str = Field(
        ...,
        description="Best-guess category label. In Phase 1 this is the BA's guess; "
                    "in Phase 3 the Sorting Layer will provide it instead.",
    )
    hypothesis_expected: str = Field(..., description="What the system should be doing.")
    hypothesis_actual: str = Field(..., description="What the system appears to be doing.")
    steps: list[BAStep] = Field(
        ...,
        min_length=1,
        description="Ordered diagnostic/resolution steps.",
    )
    confirmation: str = Field(
        ...,
        description="How the operator will confirm the fix end-to-end.",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Self-reported confidence 0..1. Used later by the Tier 3 Confidence Review.",
    )
    open_questions: list[str] = Field(
        default_factory=list,
        description="Anything the BA needs clarified before the workflow is safe to run.",
    )
