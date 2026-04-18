"""Parser tests for BA model output.

These exercise `ba_agent.parse_workflow` directly so we can validate how
resilient we are to the shapes local quantized models actually emit, without
ever calling LM Studio.
"""

from __future__ import annotations

import json

import pytest

from src.ba_agent import BAOutputError, parse_workflow


def _valid_payload() -> dict:
    return {
        "task_summary": "Users cannot export reports.",
        "suspected_category": "reporting",
        "hypothesis_expected": "Exports should download a CSV.",
        "hypothesis_actual": "Exports return a 500 error.",
        "steps": [
            {
                "order": 1,
                "action": "Check the export worker logs for the last hour.",
                "rationale": "A 500 is server-side; logs will point to the failing component.",
                "expected_outcome": "An exception trace identifies the failing call.",
            }
        ],
        "confirmation": "Trigger a test export and confirm a valid CSV is downloaded.",
        "confidence": 0.7,
        "open_questions": [],
    }


def test_parses_clean_json():
    raw = json.dumps(_valid_payload())
    wf = parse_workflow(raw)
    assert wf.task_summary.startswith("Users cannot export")
    assert len(wf.steps) == 1


def test_parses_fenced_json():
    raw = "```json\n" + json.dumps(_valid_payload()) + "\n```"
    wf = parse_workflow(raw)
    assert wf.confidence == pytest.approx(0.7)


def test_parses_json_with_preamble():
    raw = "Sure! Here is the workflow:\n\n" + json.dumps(_valid_payload())
    wf = parse_workflow(raw)
    assert wf.suspected_category == "reporting"


def test_empty_output_raises():
    with pytest.raises(BAOutputError):
        parse_workflow("   ")


def test_no_json_raises():
    with pytest.raises(BAOutputError):
        parse_workflow("I cannot help with that.")


def test_malformed_json_raises():
    with pytest.raises(BAOutputError):
        parse_workflow('{"task_summary": "x", "steps": [')


def test_schema_violation_raises():
    payload = _valid_payload()
    del payload["confirmation"]
    with pytest.raises(BAOutputError):
        parse_workflow(json.dumps(payload))


def test_confidence_out_of_range_raises():
    payload = _valid_payload()
    payload["confidence"] = 1.5
    with pytest.raises(BAOutputError):
        parse_workflow(json.dumps(payload))
