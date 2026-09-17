export type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

export type TextUIPart = {
  type: 'text';
  text: string;
};

export type ReasoningUIPart = {
  type: 'reasoning';
  text: string;
};

export type ToolUIPart = {
  type: `tool-${string}`;
  toolCallId: string;
  toolName: string;
  title?: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /** Tool-specific extras (e.g. the question tool's recorded answers). */
  metadata?: Record<string, unknown>;
};

export type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolCallId: string;
  toolName: string;
  title?: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  metadata?: Record<string, unknown>;
};

export type SourceUrlUIPart = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
};

export type FileUIPart = {
  type: 'file';
  mediaType: string;
  filename?: string;
  url: string;
};

export type UIMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart
  | DynamicToolUIPart
  | SourceUrlUIPart
  | FileUIPart;

export type MessageError = {
  name: string;
  message?: string;
  statusCode?: number;
  isRetryable?: boolean;
};

export type UIMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: UIMessagePart[];
  model?: string;
  durationMs?: number;
  error?: MessageError;
};

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';
