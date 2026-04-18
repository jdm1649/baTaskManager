# Local AI Agent System - Phase 1 (BA Model)

This directory implements **Phase 1** of the plan in
`../docs/Local AI Agent System Plan.docx` - "Prove the Concept."

## What Phase 1 delivers

A single **Business Analyst (BA) model** that:

1. Accepts a new support task as free text.
2. Receives a handful of documented VA examples as in-context references.
3. Produces a structured, step-by-step troubleshooting workflow using your
   "expected vs actual, isolate, confirm" methodology.

**Intentionally not in Phase 1:** Chroma, the Sorting Layer, the Resolver, the
Storage Model, the Task Manager Model, and any integration with the TaskManager
web app. Those are Phase 2+.

## Directory layout

```
agents/
  examples/        Documented VA examples (the Phase 1 dataset)
  prompts/         BA system prompt (your methodology) + user template
  src/             Prompt builder, LM Studio client, BA agent, CLI runner
  tests/           Unit tests
  schemas.py       Pydantic models for examples and BA output
  config.py        Env-backed config
```

## Prerequisites

- **Python 3.11+**
- **LM Studio** with its OpenAI-compatible server running on
  `http://localhost:1234` (Developer tab -> Start Server).
- A loaded instruct model, e.g. `llama-3.1-8b-instruct` or `qwen2.5-7b-instruct`.

## Setup

```powershell
cd agents
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` to point at your LM Studio endpoint and set `BA_MODEL` to the
identifier shown in LM Studio's loaded-model list.

## Run the BA agent

```powershell
python -m src.runner --task "Users report that SSO login redirects them back to the login page after authenticating."
```

Add `--dry-run` to print the assembled prompt without calling the model - useful
for iterating on the prompt before spending tokens.

## Running tests

```powershell
pytest
```

## Success criterion (from the plan, Section 8.1)

> The model produces a workflow you would actually follow.

Iterate on `prompts/ba_system_prompt.md` and the examples in `examples/` until
that is true for a handful of real tickets. Then move on to Phase 2 (Chroma).
