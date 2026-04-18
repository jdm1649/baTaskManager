"""Offline tests for task+subtask loading and prompt building."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from config import load_config
from schemas import ModelSettings, Subtask
from src.subtask import (
    SubtaskError,
    build_messages,
    enforce_prompt_token_budget,
    list_task_ids,
    load_task,
)


def test_seed_task_loads():
    task = load_task("001_safari_saved_filters")
    assert task.task_id == "001_safari_saved_filters"
    assert "Safari" in task.task_text
    kinds = [s.kind for s in task.subtasks]
    assert "restate" in kinds
    assert all(s.order >= 1 for s in task.subtasks)


def test_list_task_ids_includes_seed():
    ids = list_task_ids()
    assert "001_safari_saved_filters" in ids


def test_load_task_missing_raises():
    with pytest.raises(SubtaskError):
        load_task("does_not_exist")


def test_load_task_empty_task_md_raises(tmp_path: Path):
    tdir = tmp_path / "tasks" / "empty_task"
    tdir.mkdir(parents=True)
    (tdir / "task.md").write_text("   \n", encoding="utf-8")
    with pytest.raises(SubtaskError):
        load_task("empty_task", tasks_dir=tmp_path / "tasks")


def test_load_task_invalid_subtask_json_raises(tmp_path: Path):
    tdir = tmp_path / "tasks" / "bad"
    (tdir / "subtasks").mkdir(parents=True)
    (tdir / "task.md").write_text("something", encoding="utf-8")
    (tdir / "subtasks" / "01_restate.json").write_text(
        json.dumps({"kind": "restate", "order": 1}),  # missing 'question'
        encoding="utf-8",
    )
    with pytest.raises(SubtaskError):
        load_task("bad", tasks_dir=tmp_path / "tasks")


def test_build_messages_is_single_user_turn():
    subtask = Subtask(
        kind="restate",
        order=1,
        question="Rewrite as one sentence.",
        model_settings=ModelSettings(),
    )
    msgs = build_messages("Customers can't log in.", subtask)
    assert len(msgs) == 1
    assert msgs[0]["role"] == "user"
    content = msgs[0]["content"]
    assert content.startswith("Rewrite as one sentence.")
    assert "TASK:" in content
    assert "Customers can't log in." in content


def test_prompt_budget_accepts_small():
    subtask = Subtask(kind="restate", order=1, question="tiny")
    msgs = build_messages("small task", subtask)
    cfg = load_config()
    est = enforce_prompt_token_budget(msgs, cfg)
    assert est < cfg.max_prompt_tokens


def test_prompt_budget_hard_stops_on_overflow():
    subtask = Subtask(kind="restate", order=1, question="q")
    giant_task = "x" * 20000  # ~6666 tokens by our estimator
    msgs = build_messages(giant_task, subtask)
    cfg = load_config()
    tight_cfg = replace(cfg, max_prompt_tokens=1000)
    with pytest.raises(SubtaskError):
        enforce_prompt_token_budget(msgs, tight_cfg)


def test_prompt_budget_uses_custom_counter():
    subtask = Subtask(kind="restate", order=1, question="q")
    msgs = build_messages("short task", subtask)
    cfg = load_config()
    # Force a "count" that exceeds the budget.
    huge_counter = lambda _: cfg.max_prompt_tokens + 1  # noqa: E731
    with pytest.raises(SubtaskError):
        enforce_prompt_token_budget(msgs, cfg, token_counter=huge_counter)
