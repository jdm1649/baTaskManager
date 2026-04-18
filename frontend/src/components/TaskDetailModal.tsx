import { useCallback, useEffect, useState } from 'react';
import type { TaskItem } from '../types/task';
import type { ModelInfo, Subtask, SubtaskRun } from '../types/agent';
import { getModelInfo, listRuns, listSubtasks, runSubtask } from '../api/agent';

interface TaskDetailModalProps {
  task: TaskItem;
  onClose: () => void;
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [modelInfoError, setModelInfoError] = useState<string | null>(null);

  const [subtasks, setSubtasks] = useState<Subtask[] | null>(null);
  const [subtasksError, setSubtasksError] = useState<string | null>(null);

  const [selectedSubtaskId, setSelectedSubtaskId] = useState<number | null>(null);
  const [history, setHistory] = useState<SubtaskRun[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [runNotes, setRunNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<SubtaskRun | null>(null);

  useEffect(() => {
    getModelInfo()
      .then(setModelInfo)
      .catch((e: unknown) => setModelInfoError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSubtasks(task.id)
      .then((list) => {
        if (cancelled) return;
        setSubtasks(list);
        if (list.length > 0) setSelectedSubtaskId(list[0].id);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSubtasksError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const loadHistory = useCallback(async (subtaskId: number) => {
    try {
      setHistoryError(null);
      const runs = await listRuns(subtaskId);
      setHistory(runs);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (selectedSubtaskId == null) return;
    setLatestRun(null);
    setRunError(null);
    loadHistory(selectedSubtaskId);
  }, [selectedSubtaskId, loadHistory]);

  const selectedSubtask = subtasks?.find((s) => s.id === selectedSubtaskId) ?? null;

  const handleRun = async () => {
    if (selectedSubtaskId == null || running) return;
    setRunning(true);
    setRunError(null);
    try {
      const run = await runSubtask(selectedSubtaskId, runNotes || undefined);
      setLatestRun(run);
      setRunNotes('');
      await loadHistory(selectedSubtaskId);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide agent-modal"
        onClick={(e) => e.stopPropagation()}
      >
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
              <span><strong>Model:</strong> {modelInfo.configuredModel}</span>
              <span>
                <strong>State:</strong>{' '}
                <span className={modelInfo.state === 'loaded' ? 'ok' : 'warn'}>
                  {modelInfo.state ?? '?'}
                </span>
              </span>
              <span><strong>Quant:</strong> {modelInfo.quant ?? '?'}</span>
              <span>
                <strong>ctx:</strong>{' '}
                {modelInfo.loadedContextLength ?? '?'} / {modelInfo.maxContextLength ?? '?'}
              </span>
              {modelInfo.error && (
                <span className="agent-model-error">{modelInfo.error}</span>
              )}
            </>
          )}
        </div>

        {task.description && (
          <section className="agent-section">
            <h3>Task</h3>
            <pre className="agent-task-text">{task.description}</pre>
          </section>
        )}

        <section className="agent-section">
          <h3>Subtasks</h3>
          {subtasksError && <div className="error-banner">{subtasksError}</div>}
          {!subtasksError && subtasks === null && <div className="dim">loading...</div>}
          {subtasks && subtasks.length === 0 && (
            <div className="dim">
              No subtasks yet. Seed data from <code>agents/tasks/</code> should have been imported on first backend start.
            </div>
          )}
          {subtasks && subtasks.length > 0 && (
            <ul className="agent-subtask-list">
              {subtasks.map((s) => (
                <li
                  key={s.id}
                  className={`agent-subtask-item ${s.id === selectedSubtaskId ? 'selected' : ''}`}
                  onClick={() => setSelectedSubtaskId(s.id)}
                >
                  <div className="agent-subtask-head">
                    <span className="agent-subtask-order">#{s.order.toString().padStart(2, '0')}</span>
                    <span className="agent-subtask-kind">{s.kind}</span>
                    <span className="agent-subtask-settings">
                      temp={s.temperature} max_tokens={s.maxTokens}
                      {s.topP != null ? ` top_p=${s.topP}` : ''}
                    </span>
                  </div>
                  <div className="agent-subtask-q">{s.question}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selectedSubtask && (
          <section className="agent-section">
            <h3>Run</h3>
            <div className="agent-run-controls">
              <label htmlFor="agent-notes" className="dim">
                Notes (optional, saved with the run)
              </label>
              <textarea
                id="agent-notes"
                className="agent-notes"
                rows={2}
                value={runNotes}
                onChange={(e) => setRunNotes(e.target.value)}
                placeholder="e.g. 'lowered temperature to 0, added explicit one-sentence rule'"
                disabled={running}
              />
              <button
                className="btn btn-primary"
                onClick={handleRun}
                disabled={running || modelInfo?.state !== 'loaded'}
                title={modelInfo?.state !== 'loaded' ? 'Load the model in LM Studio first' : undefined}
              >
                {running ? 'Running...' : `Run ${selectedSubtask.kind}`}
              </button>
            </div>

            {runError && <div className="error-banner">{runError}</div>}

            {latestRun && (
              <div className="agent-run-result">
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
                    <strong>in/out:</strong> {latestRun.promptTokens ?? '?'} / {latestRun.completionTokens ?? '?'}
                  </span>
                </div>
                <pre className="agent-response">{latestRun.responseContent || '(empty response)'}</pre>
              </div>
            )}
          </section>
        )}

        {selectedSubtask && (
          <section className="agent-section">
            <h3>History ({history.length})</h3>
            {historyError && <div className="error-banner">{historyError}</div>}
            {history.length === 0 ? (
              <div className="dim">No runs yet for this subtask.</div>
            ) : (
              <ul className="agent-history-list">
                {history.map((r) => (
                  <li key={r.id} className="agent-history-item">
                    <div className="agent-history-head">
                      <span className="dim">
                        {new Date(r.startedAt).toLocaleString()}
                      </span>
                      <span className="dim">
                        temp={r.sentTemperature} max_tokens={r.sentMaxTokens}
                      </span>
                      <span className={r.stopReason === 'eosFound' ? 'ok' : 'warn'}>
                        {r.stopReason ?? '?'}
                      </span>
                      <span className="dim">
                        {r.promptTokens ?? '?'}/{r.completionTokens ?? '?'} toks
                      </span>
                    </div>
                    <pre className="agent-history-content">{r.responseContent}</pre>
                    {r.userNotes && <div className="agent-history-notes">{r.userNotes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
