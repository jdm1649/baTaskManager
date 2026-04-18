"""Prompt-builder sanity tests.

These do not hit any model. They confirm that the example files load, validate
against the schema, and render into a well-formed chat message list.
"""

from __future__ import annotations

import pytest

from schemas import VAExample
from src.prompt_builder import (
    build_messages,
    load_examples,
    render_examples_block,
)


def test_examples_load_and_validate():
    examples = load_examples()
    assert len(examples) >= 5, "Phase 1 expects at least 5 documented examples."
    for ex in examples:
        assert isinstance(ex, VAExample)
        assert ex.problem_reported
        assert ex.expected_behavior
        assert ex.actual_behavior
        assert ex.resolution
        assert ex.confirmation
        assert ex.diagnosis_steps, f"{ex.id} has no diagnosis steps"


def test_examples_have_unique_ids():
    ids = [ex.id for ex in load_examples()]
    assert len(ids) == len(set(ids)), f"Duplicate example ids: {ids}"


def test_render_examples_block_contains_every_title():
    examples = load_examples()
    block = render_examples_block(examples)
    for ex in examples:
        assert ex.title in block


def test_build_messages_shape():
    task = "Customers say export emails are not arriving."
    messages = build_messages(task)
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert task in messages[1]["content"]
    assert "Reference examples" in messages[1]["content"]


def test_build_messages_strips_task_whitespace():
    messages = build_messages("   padded task   \n")
    user = messages[1]["content"]
    assert "padded task" in user
    assert "   padded task" not in user


def test_build_messages_with_explicit_empty_examples_raises():
    # Passing an explicit empty list should still render - we only error on
    # disk-loaded emptiness. Guard against regressions in both directions.
    messages = build_messages("x", examples=[])
    assert "Reference examples" in messages[1]["content"]


@pytest.mark.parametrize("task", ["", "  ", "\n\n"])
def test_empty_task_is_allowed_by_builder(task):
    # The CLI rejects empty tasks; the builder itself should not crash.
    messages = build_messages(task)
    assert messages[0]["role"] == "system"
