# Local AI Agent System - Subtask Testing Loop

A deliberate slowdown from the original Phase 1 scaffold. Instead of asking
the model to produce an entire BA workflow in one shot, we decompose each
task into a series of **subtasks** - one narrow question each - and tune the
model one subtask at a time.

Maps to the planning doc's **Phase 1** ("Prove the Concept") and sets up the
data we'll need for **Phase 5** ("Build Loop" - replace model logic with
code once a subtask is proven).

## The loop

1. Write a task as a plain Markdown file.
2. Define a subtask: one narrow question + per-subtask model settings.
3. Run the subtask through the CLI. The CLI shows the exact prompt, asks
   you to approve, sends it to LM Studio, and prints the response plus
   server-reported stats (stop reason, tokens/sec, token counts).
4. You adjust LM Studio settings (temperature, top-p, top-k, repeat
   penalty, sampler, context length) in the UI. I adjust the subtask JSON
   (prompt wording, max_tokens, temperature). We iterate together.
5. Every run is saved as JSON under `outputs/<task_id>/` - the tuning
   history is the artifact.

## Directory layout

```
agents/
  schemas.py                     Task, Subtask, SubtaskRun, LMRuntimeInfo
  config.py                      LM Studio URLs, model id, prompt-token budget
  src/
    lm_studio_client.py          Native /api/v0 client (stop reason, tok/s, ...)
    subtask.py                   Load task+subtask, build prompt, enforce budget, save run
    runner.py                    Interactive CLI
  tasks/
    <task_id>/
      task.md                    Raw task text
      subtasks/
        NN_<kind>.json           One narrow question + settings per subtask
  outputs/                       Per-run JSON records (gitignored)
  tests/                         Unit tests for the data model and loaders
```

## Subtask JSON shape

```json
{
  "kind": "restate",
  "order": 1,
  "question": "Rewrite the task below as a single sentence. ...",
  "model_settings": {
    "temperature": 0.0,
    "max_tokens": 120,
    "top_p": 1.0
  },
  "notes": "Why this prompt is shaped this way."
}
```

Valid `kind` values (defined in `schemas.py`):

- `restate`
- `expected_behavior`
- `actual_behavior`
- `categorize`
- `first_diagnostic_step`
- `next_diagnostic_step`
- `confirmation_plan`

Add more to `SubtaskKind` in `schemas.py` as we need them.

## Prerequisites

- Python 3.11+ (3.14 tested).
- LM Studio with its local server running on `http://127.0.0.1:1234`.
- A loaded instruct model (we start with `mistralai/mistral-7b-instruct-v0.3`).

## Setup

```powershell
cd agents
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` if your LM Studio URL or model id differs.

## Running the CLI

```powershell
python -m src.runner
```

The CLI:

1. Lists models LM Studio has loaded (and flags it if your configured
   `BA_MODEL` is not among them).
2. Lists tasks under `tasks/`.
3. Lists subtasks for the chosen task.
4. Shows the exact prompt, estimated token count, and sampling settings.
5. Asks `Send? [y/n/e=edit question]`.
6. On send, prints the response with `stop / tok-per-sec / ttft / in / out`
   and saves a `SubtaskRun` to `outputs/<task_id>/`.

## Running tests

```powershell
pytest
```

Tests are offline-only - they never call LM Studio.

## What success looks like at this stage

The `restate` subtask, with `mistral-7b-instruct-v0.3` at `temperature=0.0`,
should reliably produce a single sentence that restates the task without:

- adding details not present in the task
- proposing causes or solutions
- emitting multiple sentences or a bulleted list
- wrapping the output in code fences or quotes

Once `restate` is solid, we add the next subtask (likely `categorize` or
`expected_behavior`) and tune that one in isolation.
