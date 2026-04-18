"""Phase 1 CLI: run the BA agent against a single task.

Usage:
    python -m src.runner --task "Describe the issue here"
    python -m src.runner --task-file path\\to\\ticket.txt
    python -m src.runner --task "..." --dry-run    # print prompt only
    python -m src.runner --task "..." --json       # emit workflow JSON only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from config import load_config
from src.ba_agent import BAOutputError, run_ba
from src.prompt_builder import build_messages, dump_messages_debug


console = Console()


def _read_task(args: argparse.Namespace) -> str:
    if args.task:
        return args.task
    if args.task_file:
        path = Path(args.task_file)
        if not path.exists():
            console.print(f"[red]Task file not found:[/red] {path}")
            sys.exit(2)
        return path.read_text(encoding="utf-8")
    console.print("[red]One of --task or --task-file is required.[/red]")
    sys.exit(2)


def _print_workflow(result) -> None:
    wf = result.workflow

    console.print(Panel.fit(wf.task_summary, title="Task summary", border_style="cyan"))

    meta = Table.grid(padding=(0, 2))
    meta.add_column(style="bold")
    meta.add_column()
    meta.add_row("Suspected category", wf.suspected_category)
    meta.add_row("Confidence", f"{wf.confidence:.2f}")
    console.print(meta)

    console.print(Panel(wf.hypothesis_expected, title="Expected behavior", border_style="green"))
    console.print(Panel(wf.hypothesis_actual, title="Actual behavior", border_style="red"))

    steps_table = Table(title="Steps", show_lines=True, header_style="bold")
    steps_table.add_column("#", justify="right", width=3)
    steps_table.add_column("Action")
    steps_table.add_column("Rationale")
    steps_table.add_column("Expected outcome")
    for s in wf.steps:
        steps_table.add_row(str(s.order), s.action, s.rationale, s.expected_outcome)
    console.print(steps_table)

    console.print(Panel(wf.confirmation, title="Confirmation", border_style="magenta"))

    if wf.open_questions:
        oq = "\n".join(f"- {q}" for q in wf.open_questions)
        console.print(Panel(oq, title="Open questions", border_style="yellow"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the BA agent (Phase 1).")
    src = parser.add_mutually_exclusive_group(required=False)
    src.add_argument("--task", type=str, help="Inline task text.")
    src.add_argument("--task-file", type=str, help="Path to a file containing the task text.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the assembled chat messages and exit (no model call).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit only the validated workflow as JSON to stdout.",
    )
    args = parser.parse_args(argv)

    task = _read_task(args)

    if args.dry_run:
        messages = build_messages(task)
        console.print(dump_messages_debug(messages))
        return 0

    try:
        cfg = load_config()
        result = run_ba(task, cfg=cfg)
    except BAOutputError as exc:
        console.print(f"[red]BA output parse error:[/red] {exc}")
        return 3
    except Exception as exc:  # noqa: BLE001 - final CLI boundary
        console.print(f"[red]Unexpected error:[/red] {exc}")
        return 1

    if args.json:
        print(json.dumps(result.workflow.model_dump(), indent=2, ensure_ascii=False))
    else:
        _print_workflow(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
