"""Offline schema tests for the subtask testing loop."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from schemas import (
    LMRuntimeInfo,
    ModelSettings,
    Subtask,
    SubtaskRun,
)


def test_model_settings_defaults():
    s = ModelSettings()
    assert s.temperature == 0.0
    assert s.max_tokens == 256
    assert s.top_p is None


def test_model_settings_rejects_extras():
    with pytest.raises(ValidationError):
        ModelSettings.model_validate(
            {"temperature": 0.0, "max_tokens": 256, "random_key": 1}
        )


@pytest.mark.parametrize("bad_temp", [-0.1, 2.1])
def test_model_settings_rejects_out_of_range_temperature(bad_temp):
    with pytest.raises(ValidationError):
        ModelSettings(temperature=bad_temp)


def test_subtask_happy_path():
    s = Subtask(
        kind="restate",
        order=1,
        question="Rewrite as one sentence.",
    )
    assert s.kind == "restate"
    assert s.order == 1
    assert s.model_settings.temperature == 0.0


def test_subtask_rejects_unknown_kind():
    with pytest.raises(ValidationError):
        Subtask(kind="not-a-real-kind", order=1, question="x")


def test_subtask_order_must_be_positive():
    with pytest.raises(ValidationError):
        Subtask(kind="restate", order=0, question="x")


def test_subtask_rejects_extra_fields():
    with pytest.raises(ValidationError):
        Subtask.model_validate(
            {
                "kind": "restate",
                "order": 1,
                "question": "x",
                "sneaky": "not allowed",
            }
        )


def test_subtask_run_roundtrip_json():
    run = SubtaskRun(
        task_id="001_safari_saved_filters",
        subtask_kind="restate",
        subtask_order=1,
        run_started_at=datetime(2026, 4, 17, 21, 15, 2, tzinfo=timezone.utc),
        model="mistralai/mistral-7b-instruct-v0.3",
        sent_messages=[{"role": "user", "content": "hello"}],
        sent_settings=ModelSettings(temperature=0.0, max_tokens=120),
        response_content="Saved filters disappear on Safari after logout.",
        runtime=LMRuntimeInfo(
            stop_reason="eosFound",
            tokens_per_second=68.4,
            time_to_first_token=0.18,
            prompt_tokens=54,
            completion_tokens=18,
            total_tokens=72,
            quant="Q4_K_M",
            context_length=4096,
            runtime="llama.cpp v2.13.0",
        ),
        user_notes="looks good",
    )
    blob = run.model_dump_json()
    restored = SubtaskRun.model_validate_json(blob)
    assert restored.runtime.stop_reason == "eosFound"
    assert restored.sent_settings.max_tokens == 120
    assert restored.response_content.startswith("Saved filters")


def test_lm_runtime_info_allows_extra_fields():
    # LM Studio may add fields in future versions; we should not break on them.
    info = LMRuntimeInfo.model_validate(
        {"stop_reason": "eosFound", "brand_new_field": "future-proof"}
    )
    assert info.stop_reason == "eosFound"
