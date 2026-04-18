import type { ModelInfo, RunSubtaskError, Subtask, SubtaskRun } from '../types/agent';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5151/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let parsed: unknown = null;
    const text = await response.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON - leave as null, fall through to generic error.
    }
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const err = parsed as RunSubtaskError;
      const tagged = new Error(err.message || err.error) as Error & { payload?: RunSubtaskError };
      tagged.payload = err;
      throw tagged;
    }
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function getModelInfo(): Promise<ModelInfo> {
  const res = await fetch(`${API_BASE}/agent/model-info`);
  return handleResponse<ModelInfo>(res);
}

export async function listSubtasks(taskId: number): Promise<Subtask[]> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/subtasks`);
  return handleResponse<Subtask[]>(res);
}

export async function listRuns(subtaskId: number): Promise<SubtaskRun[]> {
  const res = await fetch(`${API_BASE}/subtasks/${subtaskId}/runs`);
  return handleResponse<SubtaskRun[]>(res);
}

export async function runSubtask(subtaskId: number, userNotes?: string): Promise<SubtaskRun> {
  const res = await fetch(`${API_BASE}/subtasks/${subtaskId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userNotes: userNotes ?? null }),
  });
  return handleResponse<SubtaskRun>(res);
}
