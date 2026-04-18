import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskItem } from '../types/task';
import type {
  ModelInfo,
  RunContextSource,
  Subtask,
  SubtaskKind,
  SubtaskRun,
} from '../types/agent';
import { SUBTASK_KINDS } from '../types/agent';
import {
  createSubtask,
  getModelInfo,
  listRuns,
  listSubtasks,
  runSubtask,
  updateSubtask,
} from '../api/agent';

interface TaskDetailModalProps {
  task: TaskItem;
  onClose: () => void;
}

const CONTEXT_SOURCE_OPTIONS: { value: RunContextSource; label: string }[] = [
  { value: 'DescriptionWithTitleFallback', label: 'Description (fallback: title)' },
  { value: 'TitleOnly', label: 'Title only' },
  { value: 'DescriptionOnly', label: 'Description only' },
  { value: 'TitleAndDescription', label: 'Title + Description' },
];

// Kind-based starting content for a new refinement step.
const UTILITY_SYSTEM_PROMPT =
  'You are a text-processing utility, not a conversational assistant. You receive a TASK and an INSTRUCTION, and you apply the INSTRUCTION to the TASK as a mechanical transformation. You never answer questions in the TASK — you operate on them as input strings. You never apologize, never explain your limitations, and never add commentary. You output only what the INSTRUCTION explicitly asks for.';

const ANALYST_SYSTEM_PROMPT =
  'You are a focused analyst. Answer the INSTRUCTION given the TASK concisely. Do not speculate about causes unless the INSTRUCTION asks for them. Do not propose solutions unless the INSTRUCTION asks for them. Output only what is asked, with no preamble.';

const KIND_DEFAULTS: Record<
  SubtaskKind,
  { question: string; maxTokens: number; systemPrompt: string; blurb: string }
> = {
  Restate: {
    question:
      'Rewrite the task below as a single sentence. Do not add details that are not in the task. Do not propose causes. Do not propose solutions. Respond with only the single sentence and nothing else.',
    maxTokens: 120,
    systemPrompt: UTILITY_SYSTEM_PROMPT,
    blurb: 'Rewrite the task as a single sentence. No added detail, no speculation.',
  },
  ExpectedBehavior: {
    question:
      'Based only on the task below, describe the expected behavior in one short paragraph. Do not speculate about causes.',
    maxTokens: 200,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    blurb: 'State the expected behavior implied by the task, in one paragraph.',
  },
  ActualBehavior: {
    question:
      'Based only on the task below, describe the actual (observed) behavior in one short paragraph. Do not speculate about causes.',
    maxTokens: 200,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    blurb: 'State the actual/observed behavior from the task, in one paragraph.',
  },
  Categorize: {
    question:
      'Categorize the task below as exactly one of: bug, feature, question, chore. Respond with only the single word.',
    maxTokens: 10,
    systemPrompt: UTILITY_SYSTEM_PROMPT,
    blurb: 'Tag the task as bug / feature / question / chore. Single-word output.',
  },
  FirstDiagnosticStep: {
    question:
      'Given the task below, what is the single most valuable diagnostic step to take first? Respond with one sentence.',
    maxTokens: 120,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    blurb: 'Propose the most valuable first diagnostic action. One sentence.',
  },
  NextDiagnosticStep: {
    question:
      'Given the task below, propose the next diagnostic step in one sentence. Assume the first obvious check has already been done.',
    maxTokens: 120,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    blurb: 'Propose the next diagnostic action after obvious checks. One sentence.',
  },
  ConfirmationPlan: {
    question:
      'Given the task below, list up to three concrete checks that would confirm the issue is reproducible. One per line, no preamble.',
    maxTokens: 200,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    blurb: 'Up to three concrete checks that confirm reproducibility.',
  },
};

function buildContextPreview(
  title: string | null | undefined,
  description: string | null | undefined,
  source: RunContextSource,
): string {
  const t = (title ?? '').trim();
  const d = (description ?? '').trim();
  switch (source) {
    case 'TitleOnly':
      return t;
    case 'DescriptionOnly':
      return d;
    case 'TitleAndDescription':
      if (!d) return t;
      if (!t) return d;
      return `${t}\n\n${d}`;
    case 'DescriptionWithTitleFallback':
    default:
      return d || t;
  }
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [modelInfoError, setModelInfoError] = useState<string | null>(null);

  const [steps, setSteps] = useState<Subtask[] | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const [history, setHistory] = useState<SubtaskRun[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [runNotes, setRunNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<SubtaskRun | null>(null);
  const [contextSource, setContextSource] = useState<RunContextSource>(
    'DescriptionWithTitleFallback',
  );

  // Inline-edit state for the ACTIVE step's SYSTEM and INSTRUCTION blocks.
  const [editingSystem, setEditingSystem] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(false);
  const [systemDraft, setSystemDraft] = useState('');
  const [instructionDraft, setInstructionDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // "Add step" mode — when true we show a focused composer instead of an
  // existing step. Created step auto-becomes the active one on save.
  const [adding, setAdding] = useState(false);
  const [addKind, setAddKind] = useState<SubtaskKind>('Restate');
  const [addQuestion, setAddQuestion] = useState(KIND_DEFAULTS.Restate.question);
  const [addSystemPrompt, setAddSystemPrompt] = useState(KIND_DEFAULTS.Restate.systemPrompt);
  const [addTemperature, setAddTemperature] = useState(0.0);
  const [addMaxTokens, setAddMaxTokens] = useState(KIND_DEFAULTS.Restate.maxTokens);
  const [addTopP, setAddTopP] = useState<number | ''>('');
  const [addNotes, setAddNotes] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Load model info once.
  useEffect(() => {
    getModelInfo()
      .then(setModelInfo)
      .catch((e: unknown) => setModelInfoError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Load steps once per task.
  useEffect(() => {
    let cancelled = false;
    listSubtasks(task.id)
      .then((list) => {
        if (cancelled) return;
        setSteps(list);
        setActiveIdx(0);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStepsError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const activeStep: Subtask | null = useMemo(() => {
    if (!steps || steps.length === 0) return null;
    return steps[Math.min(activeIdx, steps.length - 1)] ?? null;
  }, [steps, activeIdx]);

  const loadHistory = useCallback(async (stepId: number) => {
    try {
      setHistoryError(null);
      const runs = await listRuns(stepId);
      setHistory(runs);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // When the active step changes: reset transient UI, reload history.
  useEffect(() => {
    setLatestRun(null);
    setRunError(null);
    setRunNotes('');
    setEditingSystem(false);
    setEditingInstruction(false);
    setEditError(null);
    if (activeStep) {
      setSystemDraft(activeStep.systemPrompt ?? '');
      setInstructionDraft(activeStep.question);
      loadHistory(activeStep.id);
    } else {
      setHistory([]);
    }
  }, [activeStep, loadHistory]);

  const contextPreview = useMemo(
    () => buildContextPreview(task.title, task.description, contextSource),
    [task.title, task.description, contextSource],
  );

  const canRun =
    !!activeStep && !running && modelInfo?.state === 'loaded' && contextPreview.length > 0;

  const handleRun = async () => {
    if (!activeStep || running) return;
    if (!contextPreview) {
      setRunError(
        `The selected context source (${contextSource}) produces an empty string for this task.`,
      );
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const run = await runSubtask(activeStep.id, {
        userNotes: runNotes || null,
        contextSource,
      });
      setLatestRun(run);
      setRunNotes('');
      await loadHistory(activeStep.id);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleSaveSystem = async () => {
    if (!activeStep || saving) return;
    setSaving(true);
    setEditError(null);
    try {
      const updated = await updateSubtask(activeStep.id, {
        // Empty string explicitly clears the system prompt backend-side.
        systemPrompt: systemDraft.trim() === '' ? '' : systemDraft,
      });
      setSteps((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? [updated]);
      setEditingSystem(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInstruction = async () => {
    if (!activeStep || saving) return;
    const q = instructionDraft.trim();
    if (!q) {
      setEditError('Instruction cannot be empty.');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const updated = await updateSubtask(activeStep.id, { question: q });
      setSteps((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? [updated]);
      setEditingInstruction(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleStartAdd = () => {
    setAdding(true);
    setAddError(null);
    // Reset to the current kind's defaults.
    const d = KIND_DEFAULTS[addKind];
    setAddQuestion(d.question);
    setAddMaxTokens(d.maxTokens);
    setAddSystemPrompt(d.systemPrompt);
  };

  // When the kind changes inside the add composer, refresh defaults.
  useEffect(() => {
    if (!adding) return;
    const d = KIND_DEFAULTS[addKind];
    setAddQuestion(d.question);
    setAddMaxTokens(d.maxTokens);
    setAddSystemPrompt(d.systemPrompt);
  }, [addKind, adding]);

  const handleSubmitAdd = async () => {
    if (addSaving) return;
    const q = addQuestion.trim();
    if (!q) {
      setAddError('Instruction is required.');
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const nextOrder = (steps?.length ?? 0) + 1;
      const created = await createSubtask(task.id, {
        kind: addKind,
        order: nextOrder,
        question: q,
        systemPrompt: addSystemPrompt.trim() || null,
        temperature: addTemperature,
        maxTokens: addMaxTokens,
        topP: addTopP === '' ? null : Number(addTopP),
        notes: addNotes.trim() || null,
      });
      setSteps((prev) => (prev ? [...prev, created] : [created]));
      setAdding(false);
      setAddNotes('');
      // Jump to the new step.
      setActiveIdx((steps?.length ?? 0));
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddSaving(false);
    }
  };

  const goPrev = () => setActiveIdx((i) => Math.max(0, i - 1));
  const goNext = () => setActiveIdx((i) => Math.min((steps?.length ?? 1) - 1, i + 1));

  const totalSteps = steps?.length ?? 0;
  const hasPrev = activeIdx > 0 && !adding;
  const hasNext = !adding && activeIdx < totalSteps - 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide agent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="agent-modal-header">
          <div>
            <h2>{task.title}</h2>
            <p className="agent-task-id">Task #{task.id}</p>
          </div>
          <button className="btn btn-sm btn-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="agent-model-strip">
          {modelInfoError && (
            <span className="agent-model-error">model-info unreachable: {modelInfoError}</span>
          )}
          {!modelInfoError && !modelInfo && <span className="dim">loading model info...</span>}
          {modelInfo && (
            <>
              <span>
                <strong>Model:</strong> {modelInfo.configuredModel}
              </span>
              <span>
                <strong>State:</strong>{' '}
                <span className={modelInfo.state === 'loaded' ? 'ok' : 'warn'}>
                  {modelInfo.state ?? '?'}
                </span>
              </span>
              <span>
                <strong>Quant:</strong> {modelInfo.quant ?? '?'}
              </span>
              <span>
                <strong>ctx:</strong> {modelInfo.loadedContextLength ?? '?'} /{' '}
                {modelInfo.maxContextLength ?? '?'}
              </span>
              {modelInfo.error && <span className="agent-model-error">{modelInfo.error}</span>}
            </>
          )}
        </div>

        {/* Stepper */}
        {stepsError && <div className="error-banner">{stepsError}</div>}
        {!stepsError && steps === null && <div className="dim">loading steps...</div>}
        {steps && (
          <div className="agent-stepper" role="tablist" aria-label="Refinement steps">
            {steps.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={!adding && i === activeIdx}
                className={`agent-step-dot ${!adding && i === activeIdx ? 'active' : ''} ${
                  adding ? 'muted' : ''
                }`}
                onClick={() => {
                  setAdding(false);
                  setActiveIdx(i);
                }}
                title={`Step ${i + 1}: ${s.kind}${s.systemPrompt ? ' (sys)' : ''}`}
              >
                <span className="agent-step-num">{i + 1}</span>
                <span className="agent-step-kind">{s.kind}</span>
                {s.systemPrompt && <span className="agent-step-sys-indicator" aria-hidden>•</span>}
              </button>
            ))}
            <button
              role="tab"
              aria-selected={adding}
              className={`agent-step-dot agent-step-add ${adding ? 'active' : ''}`}
              onClick={handleStartAdd}
              title="Add a new refinement step"
            >
              <span className="agent-step-num">+</span>
              <span className="agent-step-kind">Add</span>
            </button>
          </div>
        )}

        {/* MAIN PANEL: either Add composer OR the active step */}
        {adding && (
          <section className="agent-step-panel">
            <div className="agent-step-title">
              <h3>New refinement step</h3>
              <span className="dim">Step {totalSteps + 1}</span>
            </div>

            <div className="agent-add-field">
              <div className="agent-add-field-label">Kind</div>
              <div
                className="agent-kind-group"
                role="radiogroup"
                aria-label="Refinement kind"
              >
                {SUBTASK_KINDS.map((k) => {
                  const selected = addKind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`agent-kind-pill ${selected ? 'active' : ''}`}
                      onClick={() => setAddKind(k)}
                      disabled={addSaving}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <div className="agent-kind-blurb">{KIND_DEFAULTS[addKind].blurb}</div>
            </div>

            <div className="agent-add-row">
              <label>
                Temp
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="2"
                  value={addTemperature}
                  onChange={(e) => setAddTemperature(Number(e.target.value))}
                  disabled={addSaving}
                />
              </label>
              <label>
                Max tokens
                <input
                  type="number"
                  min="1"
                  max="4096"
                  value={addMaxTokens}
                  onChange={(e) => setAddMaxTokens(Number(e.target.value))}
                  disabled={addSaving}
                />
              </label>
              <label>
                Top-p (optional)
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={addTopP}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAddTopP(v === '' ? '' : Number(v));
                  }}
                  disabled={addSaving}
                  placeholder="—"
                />
              </label>
            </div>

            <label className="agent-add-full">
              System prompt (optional — merged as [SYSTEM] block)
              <textarea
                rows={4}
                value={addSystemPrompt}
                onChange={(e) => setAddSystemPrompt(e.target.value)}
                disabled={addSaving}
                placeholder="Leave blank for no system framing."
              />
            </label>

            <label className="agent-add-full">
              Instruction
              <textarea
                rows={4}
                value={addQuestion}
                onChange={(e) => setAddQuestion(e.target.value)}
                disabled={addSaving}
              />
            </label>

            <label className="agent-add-full">
              Notes (optional)
              <textarea
                rows={2}
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                disabled={addSaving}
                placeholder="Why you're adding this step / what you're tuning."
              />
            </label>

            {addError && <div className="error-banner">{addError}</div>}

            <div className="agent-step-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setAdding(false)}
                disabled={addSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmitAdd}
                disabled={addSaving || !addQuestion.trim()}
              >
                {addSaving ? 'Saving...' : 'Save step'}
              </button>
            </div>
          </section>
        )}

        {!adding && activeStep && (
          <section className="agent-step-panel">
            <div className="agent-step-title">
              <h3>
                <span className="dim">Step {activeIdx + 1}:</span> {activeStep.kind}
                {activeStep.systemPrompt && <span className="agent-subtask-sys">sys</span>}
              </h3>
              <span className="dim">
                temp={activeStep.temperature} · max_tokens={activeStep.maxTokens}
                {activeStep.topP != null ? ` · top_p=${activeStep.topP}` : ''}
              </span>
            </div>

            {/* INPUT block */}
            <div className="agent-io-card">
              <div className="agent-io-label">Input — what the model will see</div>

              {/* SYSTEM */}
              <div className="agent-io-section">
                <div className="agent-io-section-head">
                  <span className="agent-io-tag">SYSTEM</span>
                  {!editingSystem ? (
                    <button
                      className="btn btn-sm btn-secondary agent-io-edit"
                      onClick={() => {
                        setSystemDraft(activeStep.systemPrompt ?? '');
                        setEditingSystem(true);
                        setEditError(null);
                      }}
                    >
                      {activeStep.systemPrompt ? 'Edit' : 'Add'}
                    </button>
                  ) : (
                    <div className="agent-io-edit-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setEditingSystem(false)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleSaveSystem}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                {editingSystem ? (
                  <textarea
                    className="agent-io-editor"
                    rows={5}
                    value={systemDraft}
                    onChange={(e) => setSystemDraft(e.target.value)}
                    disabled={saving}
                    placeholder="Leave blank for no system framing."
                  />
                ) : activeStep.systemPrompt ? (
                  <pre className="agent-io-body">{activeStep.systemPrompt}</pre>
                ) : (
                  <div className="agent-io-body dim">
                    (none — model gets no framing beyond the instruction)
                  </div>
                )}
              </div>

              {/* INSTRUCTION */}
              <div className="agent-io-section">
                <div className="agent-io-section-head">
                  <span className="agent-io-tag">INSTRUCTION</span>
                  {!editingInstruction ? (
                    <button
                      className="btn btn-sm btn-secondary agent-io-edit"
                      onClick={() => {
                        setInstructionDraft(activeStep.question);
                        setEditingInstruction(true);
                        setEditError(null);
                      }}
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="agent-io-edit-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setEditingInstruction(false)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleSaveInstruction}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                {editingInstruction ? (
                  <textarea
                    className="agent-io-editor"
                    rows={4}
                    value={instructionDraft}
                    onChange={(e) => setInstructionDraft(e.target.value)}
                    disabled={saving}
                  />
                ) : (
                  <pre className="agent-io-body">{activeStep.question}</pre>
                )}
              </div>

              {/* TASK */}
              <div className="agent-io-section">
                <div className="agent-io-section-head">
                  <span className="agent-io-tag">TASK</span>
                  <label className="agent-io-source-label">
                    from
                    <select
                      value={contextSource}
                      onChange={(e) => setContextSource(e.target.value as RunContextSource)}
                      disabled={running}
                    >
                      {CONTEXT_SOURCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <pre className={`agent-io-body ${contextPreview ? '' : 'warn'}`}>
                  {contextPreview || '(empty — pick another source or add a title/description)'}
                </pre>
              </div>

              {editError && <div className="error-banner">{editError}</div>}
            </div>

            {/* RUN action */}
            <div className="agent-run-controls">
              <label htmlFor="agent-notes" className="dim">
                Notes for this run (optional)
              </label>
              <textarea
                id="agent-notes"
                className="agent-notes"
                rows={2}
                value={runNotes}
                onChange={(e) => setRunNotes(e.target.value)}
                placeholder="e.g. 'tightened instruction to single sentence'"
                disabled={running}
              />
              <button
                className="btn btn-primary"
                onClick={handleRun}
                disabled={!canRun}
                title={
                  modelInfo?.state !== 'loaded'
                    ? 'Load the model in LM Studio first'
                    : !contextPreview
                      ? 'Context source is empty for this task'
                      : undefined
                }
              >
                {running ? 'Running...' : `▶ Run step ${activeIdx + 1}`}
              </button>
            </div>

            {runError && <div className="error-banner">{runError}</div>}

            {/* RESPONSE block */}
            <div className="agent-io-card">
              <div className="agent-io-label">Response</div>
              {!latestRun && history.length === 0 && (
                <div className="agent-io-body dim">(not yet run)</div>
              )}
              {!latestRun && history.length > 0 && (
                <div className="agent-io-body dim">
                  (hasn't been run since opening this modal — see history below for the last result)
                </div>
              )}
              {latestRun && (
                <>
                  <div className="agent-run-stats">
                    <span>
                      <strong>stop:</strong>{' '}
                      <span className={latestRun.stopReason === 'eosFound' ? 'ok' : 'warn'}>
                        {latestRun.stopReason ?? '?'}
                      </span>
                    </span>
                    <span>
                      <strong>tok/s:</strong>{' '}
                      {latestRun.tokensPerSecond != null
                        ? latestRun.tokensPerSecond.toFixed(1)
                        : '?'}
                    </span>
                    <span>
                      <strong>ttft:</strong>{' '}
                      {latestRun.timeToFirstToken != null
                        ? `${latestRun.timeToFirstToken.toFixed(2)}s`
                        : '?'}
                    </span>
                    <span>
                      <strong>in/out:</strong> {latestRun.promptTokens ?? '?'} /{' '}
                      {latestRun.completionTokens ?? '?'}
                    </span>
                    <span>
                      <strong>sys:</strong>{' '}
                      {latestRun.systemPrompt ? (
                        <span className="ok">yes</span>
                      ) : (
                        <span className="dim">none</span>
                      )}
                    </span>
                  </div>
                  {latestRun.systemPrompt && (
                    <details className="agent-run-sys">
                      <summary className="dim">System prompt in effect</summary>
                      <pre className="agent-task-text">{latestRun.systemPrompt}</pre>
                    </details>
                  )}
                  <pre className="agent-response">
                    {latestRun.responseContent || '(empty response)'}
                  </pre>
                </>
              )}
            </div>

            {/* HISTORY for this step */}
            <div className="agent-step-history">
              <div className="agent-step-history-head">
                <strong>History for this step</strong>
                <span className="dim">{history.length} run{history.length === 1 ? '' : 's'}</span>
              </div>
              {historyError && <div className="error-banner">{historyError}</div>}
              {history.length === 0 ? (
                <div className="dim">No runs yet.</div>
              ) : (
                <ul className="agent-history-list">
                  {history.map((r) => (
                    <li key={r.id} className="agent-history-item">
                      <div className="agent-history-head">
                        <span className="dim">{new Date(r.startedAt).toLocaleString()}</span>
                        <span className={r.stopReason === 'eosFound' ? 'ok' : 'warn'}>
                          {r.stopReason ?? '?'}
                        </span>
                        <span className="dim">
                          {r.promptTokens ?? '?'}/{r.completionTokens ?? '?'} toks
                        </span>
                        {r.systemPrompt ? (
                          <span className="agent-history-sys" title={r.systemPrompt}>
                            sys
                          </span>
                        ) : (
                          <span className="dim" title="No system framing was sent">
                            no sys
                          </span>
                        )}
                      </div>
                      <pre className="agent-history-content">{r.responseContent}</pre>
                      {r.userNotes && <div className="agent-history-notes">{r.userNotes}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {!adding && !activeStep && steps && steps.length === 0 && (
          <section className="agent-step-panel agent-step-empty">
            <p className="dim">
              This task has no refinement steps yet. Add one to start prompting the model.
            </p>
            <button className="btn btn-primary" onClick={handleStartAdd}>
              + Add your first step
            </button>
          </section>
        )}

        {/* Footer nav */}
        {steps && steps.length > 0 && !adding && (
          <div className="agent-nav-bar">
            <button
              className="btn btn-secondary btn-sm"
              onClick={goPrev}
              disabled={!hasPrev}
            >
              ← Previous
            </button>
            <button className="btn btn-sm" onClick={handleStartAdd}>
              + Add step
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={goNext}
              disabled={!hasNext}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
