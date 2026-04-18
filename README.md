# Prompt Lab — Tier 1 (Tinker)

A local prompt-engineering lab for open-source LLMs. Tune prompts against locally-hosted models, capture a complete audit trail of every run, and build intuition for what makes a given model behave.

**Scope boundary**: this project is deliberately single-tier. It is a lab for experimentation and nothing else. The Tier 2 project — which adds a separate "execution" mode for running tuned prompts against production inputs — lives in a sibling repository and is developed independently. This project will never grow a Tier 2.

> Forked identity history: this project began as `ba-taskmanager` (a business-analyst workflow tool) and pivoted tonight into a prompt-engineering lab. The folder name is historical. The tool it now is is described below.

---

## What this is for

You have a local LLM (Mistral, Llama, Qwen, Phi, Gemma, DeepSeek, whatever) running in LM Studio. You want to figure out, empirically:

- How does this model respond to different system prompts?
- Does the `[SYSTEM] / [INSTRUCTION] / [TASK]` 3-block structure steer it better than a 2-block prompt?
- What's the effect of temperature, max_tokens, top_p on output shape?
- Which framings survive this model's chat template? (Mistral v0.3 famously rejects the `system` role — that workaround is baked in here.)
- How consistent is `temp=0` across repeated runs? (Spoiler: character-perfect, per tonight's Task #2 evidence.)

This tool lets you answer those questions with a durable record. Every run's full prompt, response, telemetry, and settings are persisted. Edit a prompt, rerun, the old run stays. You end up with a journal of "what I tried, what happened, what I learned."

---

## Architecture

```
c:\Source\ba-taskmanager\
├── backend/
│   └── TaskManager/                  .NET 8 Web API
│       ├── Controllers/              REST endpoints
│       │   ├── TasksController.cs    CRUD over TaskItem
│       │   ├── SubtasksController.cs CRUD over Subtask (refinement steps)
│       │   ├── SubtaskRunsController.cs  POST /run -> LM Studio
│       │   └── AgentController.cs    GET /agent/model-info
│       ├── Data/
│       │   └── AppDbContext.cs       EF Core + SQLite, soft-delete filters
│       ├── Models/                   Entities + DTOs
│       │   ├── TaskItem.cs           The primary task (title/desc/status/etc)
│       │   ├── Subtask.cs            One refinement step (system/question/params)
│       │   ├── SubtaskRun.cs         One LLM call + response + telemetry
│       │   └── *Dto.cs               Request/response shapes
│       └── Services/
│           ├── LMStudioClient.cs     HTTP client -> http://localhost:1234
│           └── AgentSeeder.cs        Idempotent seeding from agents/tasks/
├── frontend/                         React 19 + TypeScript + Vite
│   └── src/
│       ├── api/
│       │   ├── tasks.ts              task CRUD client
│       │   └── agent.ts              subtask, run, model-info, updateSubtask
│       ├── components/
│       │   ├── TaskList.tsx          main list view, filters, search
│       │   ├── TaskFormModal.tsx     create/edit TaskItem
│       │   └── TaskDetailModal.tsx   wizard UI for steps + runs (this is the lab)
│       └── types/
│           ├── task.ts               TaskItem shape
│           └── agent.ts              Subtask/SubtaskRun/Kind/ContextSource shapes
├── agents/
│   └── tasks/                        File-backed seed tasks
│       └── 001_safari_saved_filters/
│           ├── task.md               Title + description
│           └── subtasks/
│               └── 01_restate.json   Starter refinement step with system prompt
├── docs/                             Design notes, experiment logs
└── taskmanager.db                    SQLite DB (created on first run; auto-seeded)
```

### Tech stack

| Layer     | Choice                                              |
|-----------|-----------------------------------------------------|
| Backend   | .NET 8, ASP.NET Core Web API                        |
| DB        | SQLite via Entity Framework Core 8 (EnsureCreated)  |
| Frontend  | React 19, TypeScript, Vite                          |
| LLM       | LM Studio (http://localhost:1234) — any OSS model   |
| Local-only| No cloud model, no API keys, no telemetry leaving   |

---

## Data model

```
TaskItem  1 ──< many ── Subtask  1 ──< many ── SubtaskRun
  │                        │                        │
  title                    kind                     started_at
  description              order                    model
  status                   question (INSTRUCTION)   sent_messages_json (audit)
  priority                 system_prompt            sent_temperature
  tags                     temperature              sent_max_tokens
  created/updated          max_tokens               sent_top_p
  soft-deleted             top_p                    system_prompt (snapshot)
                           notes                    response_content
                                                    stop_reason  (eosFound / maxPredictedTokensReached)
                                                    tokens_per_second
                                                    time_to_first_token
                                                    prompt_tokens / completion_tokens / total_tokens
                                                    quant / context_length / runtime
                                                    user_notes
```

**Critical property**: a `SubtaskRun` snapshots the system prompt and all sampling params that were in effect at run time. Editing the parent `Subtask` later does NOT mutate historical runs. This is what makes the history a true audit trail.

---

## Prompt structure

When you run a step, the backend builds a single user message. Two shapes depending on whether the step has a `SystemPrompt`:

**With system prompt (3-block):**
```
[SYSTEM]
<system_prompt>

[INSTRUCTION]
<question>

[TASK]
<task_text>    ← selected from TaskItem.title/description via ContextSource
```

**Without system prompt (2-block):**
```
<question>

TASK:
<task_text>
```

Why merge `[SYSTEM]` into the user message instead of using a real `system` role? Because **Mistral v0.3's chat template rejects the `system` role** with a 400 from the Jinja layer ("Only user and assistant roles are supported!"). LM Studio's own preset system prompt hits this same wall. Merging into the user turn is the portable workaround. Other models (Llama, Qwen) accept both.

The `ContextSource` enum lets you pick which part of the parent TaskItem becomes the TASK block: `TitleOnly`, `DescriptionOnly`, `TitleAndDescription`, or `DescriptionWithTitleFallback` (default).

---

## Running the app

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/)
- [LM Studio](https://lmstudio.ai/) with at least one model loaded and its local server enabled (default port 1234)

### Backend

```powershell
cd backend\TaskManager
dotnet run
```

API at `http://localhost:5151`. Swagger at `http://localhost:5151/swagger`.

On first startup the seeder creates `taskmanager.db` and inserts the Safari seed task (see `agents/tasks/001_safari_saved_filters/`). On every subsequent startup the seeder is idempotent: missing seed tasks are created, soft-deleted seeds are undeleted, existing seeds are left alone.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend at `http://localhost:5173`. CORS is configured for that origin only — if Vite picks a different port (e.g. 5174 because 5173 is stale), you'll see "Failed to fetch" errors. Kill the stale node process and relaunch.

### LM Studio

Open LM Studio, load a chat-capable model, click "Start Server." Verify via:
```
GET http://localhost:1234/v1/models
```
The backend queries this at `/api/agent/model-info` and surfaces it in the top strip of the task modal.

### Configuration

Set `LMStudio:Model` (and optionally `LMStudio:MaxPromptTokens`, `LMStudio:BaseUrl`) in `backend/TaskManager/appsettings.json` or `appsettings.Development.json` to target a specific model.

---

## The wizard UI (what a lab session looks like)

Open any task. The modal opens in wizard form:

1. **Top strip**: model identity, state (loaded / not-loaded), quant, context window
2. **Stepper**: pill buttons for each refinement step (`1 Restate • 2 ExpectedBehavior • ...`). Dot indicates step has a system prompt. Plus an `+ Add` pill.
3. **One step at a time**:
   - `INPUT` card with three labeled sections — `SYSTEM` (edit in place), `INSTRUCTION` (edit in place), `TASK` (with inline `from` source selector for ContextSource)
   - Run controls (notes + `▶ Run step N`)
   - `RESPONSE` card with stats row (stop reason, tok/s, ttft, in/out tokens, sys-prompt pill) and the response body
   - `History for this step` — per-step, newest first, compressed
4. **Bottom nav bar**: `← Previous / + Add step / Next →`

Add Step composer shows a segmented pill group for Kind with a one-line description per kind, plus number inputs for temp/max_tokens/top_p and textareas for system prompt / instruction / notes.

---

## The seven "Kinds"

Kinds are preset templates. They fill in default system prompt + instruction + max_tokens when you create a new step. They are **labels only** — the backend does not branch on Kind, and the prompt is built entirely from the step's own system prompt, instruction, and the parent task's context.

| Kind                 | System prompt family | Purpose                                                              |
|----------------------|----------------------|----------------------------------------------------------------------|
| `Restate`            | UTILITY              | Rewrite the TASK as a single sentence, no added detail, no speculation |
| `ExpectedBehavior`   | ANALYST              | State the expected behavior implied by the TASK                      |
| `ActualBehavior`     | ANALYST              | State the actual/observed behavior from the TASK                     |
| `Categorize`         | UTILITY              | Tag as `bug / feature / question / chore` (single word)              |
| `FirstDiagnosticStep`| ANALYST              | Propose the most valuable first diagnostic action                    |
| `NextDiagnosticStep` | ANALYST              | Propose the next diagnostic action after the obvious                 |
| `ConfirmationPlan`   | ANALYST              | Up to three concrete reproducibility checks                          |

**UTILITY** framing: "you are a text-processing utility, not a conversational assistant; operate on the TASK as input, don't answer questions in it."

**ANALYST** framing: "focused analyst, answer concisely, no speculation unless asked."

### Known limitations of the kind set (findings, see below)

- **Bug-triage-shaped.** Five of the seven kinds (`ExpectedBehavior`, `ActualBehavior`, `FirstDiagnosticStep`, `NextDiagnosticStep`, `ConfirmationPlan`) implicitly assume the TASK is a malfunction report. On non-bug tasks (e.g. "What is today's date?" or "How to save files in file explorer") they either collapse into near-duplicates or hallucinate a malfunction to justify their framing.
- **Pairs collapse.** `ExpectedBehavior` ≈ `ActualBehavior` when the task isn't describing a discrepancy. `FirstDiagnosticStep` ≈ `NextDiagnosticStep` when the task doesn't support a multi-step investigation.
- **Not contracts.** Categorize returns whatever string the model feels like; there is no schema enforcement.

These are acknowledged and captured on the TODO list below.

---

## Findings (empirical, from tonight's experiments)

These were produced by running the tool against Mistral-7B-Instruct-v0.3 Q4_K_M and recorded in-database. Full run audit trail is in the SQLite file.

**1. Mistral v0.3 rejects the `system` role.** The chat template is strict. Workaround: merge system framing into the user message as a `[SYSTEM]` block. LM Studio's preset system prompt hits the same wall and is unusable with Mistral v0.3. This is implemented as the default behavior in `SubtaskRunsController.BuildPrompt`.

**2. Framing can override RLHF personality, at Mistral-7B-Q4_K_M, when merged into the user turn.**

Task #2, title = "What is today's date?", `ContextSource=TitleOnly`, `temp=0`:

| Condition | Response | Tokens |
|-----------|----------|--------|
| NO system prompt | "Today's date is to be determined, as I don't have real-time capabilities or access to a calendar." | 26 |
| WITH utility prompt | "Today's date is the stated date." | 10 |

The utility framing successfully suppresses the "helpful assistant" instinct to explain its limitations and instead produces a mechanical restatement. Reproducible across multiple runs.

**3. `temp=0` is character-deterministic on Mistral-7B-Q4_K_M.** Two runs of the same prompt produced byte-identical output including token counts (113/96 for step 2 of Task #4). This makes the lab's A/B methodology trustworthy: if you see diff in output at temp=0, something in the prompt or config actually changed.

**4. Kinds impose framings and the model bends to fit them.** Task #4, title = "How to save files in file explorer" (a how-to, not a bug). Running all seven kinds produced:
- Restate: hallucinated a "Save As button" detail not in the TASK (utility framing not strong enough to suppress plausible-completion instinct)
- ExpectedBehavior and ActualBehavior: near-identical paragraphs (pair collapsed)
- Categorize: returned "Chore" when "question" would've been more accurate (taxonomy mismatch)
- FirstDiagnosticStep and NextDiagnosticStep: near-identical, both invented a malfunction to diagnose (pair collapsed + frame-invention)
- ConfirmationPlan: highest-quality output but still presumed a bug

**5. Instruction wording is a massive lever.** The word "issue" in `ConfirmationPlan`'s instruction forced the model to manufacture an issue. Lesson: if you don't want the model to presume a shape, don't let the instruction presume one.

These findings directly justify the TODO items below.

---

## What's been built (commit history)

| Commit   | What                                                                                             |
|----------|--------------------------------------------------------------------------------------------------|
| `A`      | First wiring: TaskDetailModal, LMStudioClient, SubtaskRunsController, non-streaming            |
| `A.5+A.6`| Seeder becomes idempotent; add Subtask in UI; ContextSource selector; per-step SystemPrompt; Mistral system-role workaround |
| `A.7`    | Wizard layout rewrite: stepper, one-step-at-a-time, inline edit, segmented Kind pills, modal-wide theme sweep |

Every commit message in `git log` carries a detailed body — read them for the reasoning behind each decision.

---

## TODO — Tier 1 roadmap

Priorities are ordered roughly by impact-per-effort and dependency. Not all will be done; the point is to have the list so you know what's on the table.

### High priority — fixes the biggest gaps in the lab experience

- [ ] **Commit B: streaming (SSE).** Watch tokens appear as the model generates them instead of waiting for the full reply. Turns 3-second waits into live feedback, which is psychologically huge for tuning. Biggest velocity improvement remaining.
- [ ] **Commit C: compare two runs side-by-side.** Pick any two rows in a step's history, open a split view, diff the inputs, show responses in parallel. This single feature converts the tool from "LM Studio with a nicer UI" into a real lab. Enables everything that follows.
- [ ] **Per-run model filter in history.** The `SubtaskRun.Model` field is already captured; surface it in the UI so you can filter/group history by model. Prerequisite for multi-model comparison.
- [ ] **EF migrations infrastructure.** We've been `EnsureCreated`-ing and nuking the DB on schema changes. That stops working the moment the DB contains data you care about. Add a migrations folder, one baseline migration for the current schema, switch startup from `EnsureCreated` to `Migrate`. Do this BEFORE the next schema change.

### Medium priority — quality of life

- [ ] **Annotations on runs.** Mark a run as good/bad/interesting, attach a free-text observation. Replaces the "mental notes" step during experiments with persisted evaluations.
- [ ] **Model-swap per run.** Target a specific LM Studio model for a single run without changing `appsettings`. Enables "does this prompt generalize across models?" experiments within one step.
- [ ] **Rename the "subtask" entity UI-side more aggressively.** The wizard already says "Step" everywhere user-visible, but API URLs, a few error messages, and the Swagger schema still say "subtask." Consider a rename to `Step` entity-wide. Breaking API change; may or may not be worth it.
- [ ] **Fork a step (intentional A/B).** Skipped in A.7 by design. Add back a `Duplicate step` button when we want explicit variant tracking rather than edit-in-place.

### Low priority — nice-to-haves

- [ ] **Rethink Kinds.** The seven kinds are bug-triage-shaped; tonight's Task #4 experiment showed 5 of 7 misbehave on non-bug TASKs. Options: (a) shrink to generic presets (`Custom`, `Restate`, `Classify`, `Extract`); (b) make Kinds user-definable / saveable as a personal prompt library; (c) attach JSON schemas to kinds for output validation (e.g. Categorize must return one of a fixed set). Probably (a) first, (b) later, (c) when the tool is mature.
- [ ] **Latency budget tracking.** Aggregate tok/s, wall-clock, ttft across many runs; surface "this prompt is slow" as a signal.
- [ ] **Fixture libraries.** A "task" today is one TASK. Allow a task to hold a list of fixture inputs so you can run one step against N inputs and get a grid. This edges toward Tier 2 functionality — if you find yourself wanting this, it's a signal the Tier 2 project has caught up to where you need it to be.
- [ ] **Export winner as prompt bundle.** A JSON bundle capturing system + instruction + model + params + example TASK and example response. This is the bridge artifact into Tier 2, but can exist in Tier 1 as a one-way export.

### Won't do (explicit non-goals)

- **Execution Tasks, bidirectional task linking, production input grids, scheduled runs.** Those are Tier 2 scope and belong in the sibling project.
- **Remote / cloud model support.** Local-only is a load-bearing product decision. Use Tier 2 if you want cloud models.
- **Multi-user / auth.** Single-user local tool by design.

---

## Relationship to the Tier 2 project

A Tier 2 project (`prompt-lab-v2`) was forked from this project at commit `8ab67e3` and is developed independently. Tier 2 extends the tool with Execution Tasks (run a tuned prompt against many inputs), a Winner concept (promote a tuned step to a reusable prompt bundle), bidirectional linking, and a full tinker→produce lifecycle.

The two projects will diverge. Features can be cherry-picked across if useful. There is no plan to merge them back together.

---

## License

Personal project. All rights reserved.
