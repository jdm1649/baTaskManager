export type SubtaskKind =
  | 'Restate'
  | 'ExpectedBehavior'
  | 'ActualBehavior'
  | 'Categorize'
  | 'FirstDiagnosticStep'
  | 'NextDiagnosticStep'
  | 'ConfirmationPlan';

export interface Subtask {
  id: number;
  taskItemId: number;
  kind: SubtaskKind;
  order: number;
  question: string;
  temperature: number;
  maxTokens: number;
  topP: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubtaskRun {
  id: number;
  subtaskId: number;
  startedAt: string;
  model: string;
  sentMessagesJson: string;
  sentTemperature: number;
  sentMaxTokens: number;
  sentTopP: number | null;
  responseContent: string;
  stopReason: string | null;
  tokensPerSecond: number | null;
  timeToFirstToken: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  quant: string | null;
  contextLength: number | null;
  runtime: string | null;
  userNotes: string | null;
}

export interface ModelInfo {
  configuredModel: string;
  state: string | null;
  quant: string | null;
  loadedContextLength: number | null;
  maxContextLength: number | null;
  reachable: boolean;
  error: string | null;
}

export interface RunSubtaskError {
  error: string;
  message: string;
  estimatedTokens?: number;
  maxPromptTokens?: number;
}
