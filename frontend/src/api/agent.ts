import type {
  CreateSubtaskRequest,
  ModelInfo,
  RunContextSource,
  RunSubtaskError,
  Subtask,
  SubtaskRun,
} from '../types/agent';

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

export interface RunSubtaskOptions {
  userNotes?: string | null;
  contextSource?: RunContextSource;
}

export async function runSubtask(
  subtaskId: number,
  options: RunSubtaskOptions = {},
): Promise<SubtaskRun> {
  const res = await fetch(`${API_BASE}/subtasks/${subtaskId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userNotes: options.userNotes ?? null,
      contextSource: options.contextSource ?? 'DescriptionWithTitleFallback',
    }),
  });
  return handleResponse<SubtaskRun>(res);
}

export async function createSubtask(
  taskId: number,
  payload: CreateSubtaskRequest,
): Promise<Subtask> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/subtasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<Subtask>(res);
}

/** Partial update. Send only the fields you want to change.
 *  For systemPrompt, send "" to clear, null/undefined to leave unchanged. */
export interface UpdateSubtaskPatch {
  question?: string;
  systemPrompt?: string | null;
  temperature?: number;
  maxTokens?: number;
  topP?: number | null;
  notes?: string | null;
  order?: number;
}

export async function updateSubtask(
  subtaskId: number,
  patch: UpdateSubtaskPatch,
): Promise<Subtask> {
  const res = await fetch(`${API_BASE}/subtasks/${subtaskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handleResponse<Subtask>(res);
}
