"""Interactive CLI for the subtask testing loop.

Flow:

1. Probe LM Studio, show loaded model / quant / context length.
2. Pick a task from tasks/.
3. Pick a subtask from that task.
4. Show the exact prompt that will be sent, estimated token count, and
   model settings. Offer [y/n/e].
5. On 'y', run. Print the response inline with stop reason, tok/s, token
   counts.
6. Capture optional user notes.
7. Save the run to outputs/.
8. Loop: run another subtask, pick another task, or quit.
"""

from __future__ import annotations

import sys

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from config import load_config
from schemas import LoadedTask, Subtask
from src.lm_studio_client import (
    LMStudioError,
    chat,
    find_model,
    list_loaded_models,
)
from src.subtask import (
    SubtaskError,
    build_messages,
    enforce_prompt_token_budget,
    list_task_ids,
    load_task,
    save_run,
)


console = Console()


def _prompt(prompt: str, default: str | None = None) -> str:
    try:
        raw = input(prompt)
    except (EOFError, KeyboardInterrupt):
        console.print("\n[yellow]cancelled[/yellow]")
        raise SystemExit(130)
    if not raw.strip() and default is not None:
        return default
    return raw


def _show_model_info(cfg) -> None:
    try:
        models = list_loaded_models(cfg)
    except LMStudioError as exc:
        console.print(f"[red]Could not reach LM Studio at {cfg.native_base_url}[/red]: {exc}")
        sys.exit(2)

    if not models:
        console.print("[red]No LLMs reported by LM Studio.[/red]")
        sys.exit(2)

    t = Table(title="LM Studio state", show_lines=False, header_style="bold cyan")
    t.add_column("Model id")
    t.add_column("State")
    t.add_column("Quant")
    t.add_column("ctx (loaded / max)")
    for m in models:
        ctx = (
            f"{m.loaded_context_length} / {m.max_context_length}"
            if m.loaded_context_length is not None
            else "?"
        )
        state_color = "green" if m.state == "loaded" else "dim"
        t.add_row(
            m.model_id,
            f"[{state_color}]{m.state or '?'}[/{state_color}]",
            m.quant or "?",
            ctx,
        )
    console.print(t)

    target = find_model(cfg, cfg.model)
    if target is None:
        console.print(
            f"[red]Configured BA_MODEL={cfg.model} is not listed by LM Studio.[/red] "
            "Load it in the LM Studio UI and retry."
        )
        sys.exit(2)
    if target.state != "loaded":
        console.print(
            f"[yellow]Warning: {cfg.model} state={target.state} (not 'loaded'). "
            "LM Studio may load on first request, which can add latency.[/yellow]"
        )


def _pick_task() -> str | None:
    ids = list_task_ids()
    if not ids:
        console.print(
            "[red]No tasks found.[/red] Create one at "
            "[cyan]agents/tasks/<task_id>/task.md[/cyan] with subtasks in "
            "[cyan]subtasks/NN_<kind>.json[/cyan]."
        )
        return None

    console.print("\n[bold]Tasks:[/bold]")
    for i, tid in enumerate(ids, 1):
        console.print(f"  [{i}] {tid}")
    console.print("  [q] quit")

    raw = _prompt("Pick a task: ").strip().lower()
    if raw in {"q", "quit", "exit"}:
        return None
    try:
        idx = int(raw)
        return ids[idx - 1]
    except (ValueError, IndexError):
        console.print("[red]Invalid selection.[/red]")
        return _pick_task()


def _pick_subtask(task: LoadedTask) -> Subtask | None:
    if not task.subtasks:
        console.print(
            f"[red]Task {task.task_id} has no subtasks yet.[/red] Add one at "
            f"[cyan]agents/tasks/{task.task_id}/subtasks/01_<kind>.json[/cyan]."
        )
        return None

    console.print("\n[bold]Subtasks:[/bold]")
    for i, s in enumerate(task.subtasks, 1):
        console.print(f"  [{i}] order={s.order:02d} kind={s.kind}  (temp={s.model_settings.temperature}, max_tokens={s.model_settings.max_tokens})")
    console.print("  [b] back")

    raw = _prompt("Pick a subtask: ").strip().lower()
    if raw in {"b", "back"}:
        return None
    try:
        idx = int(raw)
        return task.subtasks[idx - 1]
    except (ValueError, IndexError):
        console.print("[red]Invalid selection.[/red]")
        return _pick_subtask(task)


def _show_preview(task: LoadedTask, subtask: Subtask, messages, est_tokens: int) -> None:
    prompt_text = messages[0]["content"]
    console.print(
        Panel(
            prompt_text,
            title=f"Prompt (task={task.task_id}, subtask={subtask.kind}, order={subtask.order})",
            border_style="cyan",
        )
    )
    settings = subtask.model_settings
    console.print(
        f"[bold]Settings:[/bold] temperature={settings.temperature}  "
        f"max_tokens={settings.max_tokens}  "
        f"top_p={settings.top_p if settings.top_p is not None else '(server default)'}"
    )
    console.print(f"[bold]Estimated prompt tokens:[/bold] ~{est_tokens}")


def _run_one(cfg, task: LoadedTask, subtask: Subtask) -> bool:
    """Return True if user wants to loop, False to go back."""
    messages = build_messages(task.task_text, subtask)
    try:
        est_tokens = enforce_prompt_token_budget(messages, cfg)
    except SubtaskError as exc:
        console.print(f"[red]Prompt budget exceeded:[/red] {exc}")
        return True

    _show_preview(task, subtask, messages, est_tokens)

    decision = _prompt("Send? [y/n/e=edit question]: ").strip().lower()
    if decision == "e":
        console.print(
            "[yellow]Edit the question in "
            f"agents/tasks/{task.task_id}/subtasks/*.json, then re-select the subtask.[/yellow]"
        )
        return True
    if decision != "y":
        console.print("[dim]skipped[/dim]")
        return True

    console.print("[dim]Sending to LM Studio...[/dim]")
    try:
        result = chat(cfg, messages, subtask.model_settings)
    except LMStudioError as exc:
        console.print(f"[red]LM Studio error:[/red] {exc}")
        return True

    info = result.runtime
    header = (
        f"stop={info.stop_reason or '?'}  "
        f"tok/s={info.tokens_per_second:.1f}  " if info.tokens_per_second is not None
        else f"stop={info.stop_reason or '?'}  tok/s=?  "
    )
    header += (
        f"ttft={info.time_to_first_token:.2f}s  " if info.time_to_first_token is not None
        else "ttft=?  "
    )
    header += (
        f"in={info.prompt_tokens} out={info.completion_tokens}"
        if info.prompt_tokens is not None
        else "in=? out=?"
    )
    console.print(Panel(result.content.rstrip() or "(empty)", title=header, border_style="green"))

    if info.stop_reason == "maxTokensReached":
        console.print(
            "[yellow]Warning: hit max_tokens. The model likely wanted to say more. "
            "Raise max_tokens in the subtask JSON if the content looks cut off.[/yellow]"
        )

    notes = _prompt("Add notes (blank to skip): ", default="")
    path = save_run(
        task_id=task.task_id,
        subtask=subtask,
        messages=messages,
        chat_result=result,
        model=cfg.model,
        user_notes=notes,
    )
    console.print(f"[dim]saved {path.relative_to(path.parents[2])}[/dim]")
    return True


def main() -> int:
    cfg = load_config()
    console.print(f"[bold]Target:[/bold] {cfg.base_url}  (native: {cfg.native_base_url})")
    console.print(f"[bold]Model:[/bold]  {cfg.model}")
    console.print(f"[bold]Prompt budget:[/bold] {cfg.max_prompt_tokens} tokens (hard stop)\n")

    _show_model_info(cfg)

    while True:
        task_id = _pick_task()
        if task_id is None:
            return 0
        try:
            task = load_task(task_id)
        except SubtaskError as exc:
            console.print(f"[red]{exc}[/red]")
            continue

        while True:
            subtask = _pick_subtask(task)
            if subtask is None:
                break
            if not _run_one(cfg, task, subtask):
                break
            again = _prompt("\nAnother run on this task? [y/N]: ", default="n").strip().lower()
            if again != "y":
                break


if __name__ == "__main__":
    raise SystemExit(main())
