export type OpencodeToolState =
  | { status: 'pending'; input: Record<string, unknown>; raw: string }
  | {
      status: 'running';
      input: Record<string, unknown>;
      title?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'completed';
      input: Record<string, unknown>;
      output: string;
      title: string;
      metadata?: Record<string, unknown>;
    }
  | { status: 'error'; input: Record<string, unknown>; error: string };

export type OpencodeTextPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text';
  text: string;
};

export type OpencodeReasoningPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'reasoning';
  text: string;
};

export type OpencodeToolPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'tool';
  callID: string;
  tool: string;
  state: OpencodeToolState;
};

export type OpencodeFilePart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'file';
  mime: string;
  filename?: string;
  url: string;
};

export type OpencodeOtherPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'step-start' | 'step-finish' | 'snapshot' | 'patch' | 'agent' | 'retry' | 'compaction';
};

export type OpencodePart =
  | OpencodeTextPart
  | OpencodeReasoningPart
  | OpencodeToolPart
  | OpencodeFilePart
  | OpencodeOtherPart;

/**
 * A model/provider failure delivered on an assistant message. The server sets
 * `info.error` and stops streaming, often leaving `parts` empty; without this
 * the app renders an unexplained empty bubble.
 */
export type OpencodeMessageError = {
  name: string;
  data?: {
    message?: string;
    statusCode?: number;
    isRetryable?: boolean;
    [key: string]: unknown;
  };
};

export type OpencodeMessageInfo = {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: { created: number; completed?: number };
  modelID?: string;
  providerID?: string;
  /** Set when the assistant turn failed (APIError, ProviderAuthError, ...). */
  error?: OpencodeMessageError;
};

export type OpencodeMessage = {
  info: OpencodeMessageInfo;
  parts: OpencodePart[];
};

export type OpencodeSessionTokens = {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
  total?: number;
};

export type OpencodeSession = {
  id: string;
  title: string;
  time: { created: number; updated: number };
  tokens?: OpencodeSessionTokens;
  cost?: number;
  /** Project folder this session belongs to (absolute path on the server). */
  directory?: string;
  projectID?: string;
  /** Present once the session has been shared (POST .../share). */
  share?: { url: string };
  /** Set on forked/subagent sessions; points back to the spawning session. */
  parentID?: string;
  /** Agent currently driving the session (e.g. "build", "plan"). */
  agent?: string;
};

/** A tool permission request waiting for the user (permission.asked). */
export type OpencodePermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata?: Record<string, unknown>;
  always?: string[];
  tool?: { messageID: string; callID: string };
};

export type PermissionReply = 'once' | 'always' | 'reject';

/** A project folder the server knows about. */
export type OpencodeProject = {
  id: string;
  worktree: string;
  vcs?: string;
  time?: { created?: number; updated?: number };
};

export type OpencodeModel = {
  id: string;
  providerID: string;
  name: string;
  variants?: Record<string, unknown>;
};

export type OpencodeProvider = {
  id: string;
  name: string;
  models: Record<string, OpencodeModel>;
};

export type OpencodeProvidersResponse = {
  providers: OpencodeProvider[];
  default: Record<string, string>;
};

export type ProviderCatalogSource = 'env' | 'config' | 'custom' | 'api';

export type CatalogModel = {
  id: string;
  name: string;
  family?: string;
  release_date?: string;
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  [key: string]: unknown;
};

export type CatalogProvider = {
  id: string;
  name: string;
  source: ProviderCatalogSource;
  env: string[];
  key?: string;
  options: Record<string, unknown>;
  models: Record<string, CatalogModel>;
};

export type ProviderCatalogResponse = {
  all: CatalogProvider[];
  default: Record<string, string>;
  connected: string[];
};

export type ProviderAuthPromptOption = {
  label: string;
  value: string;
  hint?: string;
};

export type ProviderAuthPromptWhen = {
  key: string;
  op: 'eq' | 'neq';
  value: string;
};

export type ProviderAuthPrompt =
  | {
      type: 'text';
      key: string;
      message: string;
      placeholder?: string;
      when?: ProviderAuthPromptWhen;
    }
  | {
      type: 'select';
      key: string;
      message: string;
      options: ProviderAuthPromptOption[];
      when?: ProviderAuthPromptWhen;
    };

export type ProviderAuthMethod = {
  type: 'oauth' | 'api';
  label: string;
  prompts?: ProviderAuthPrompt[];
};

export type ProviderOAuthAuthorization = {
  url: string;
  method: 'auto' | 'code';
  instructions: string;
};

export type ProviderConfigPatch = {
  npm?: string;
  name?: string;
  env?: string[];
  options?: {
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    [key: string]: unknown;
  };
  models?: Record<string, { name: string }>;
  [key: string]: unknown;
};

export type GlobalConfig = {
  provider?: Record<string, ProviderConfigPatch>;
  disabled_providers?: string[];
  enabled_providers?: string[];
  model?: string;
  small_model?: string;
  [key: string]: unknown;
};

export type VcsFileStatus = {
  file: string;
  additions: number;
  deletions: number;
  status: 'added' | 'deleted' | 'modified';
};

export type VcsFileDiff = {
  file: string;
  patch?: string;
  additions: number;
  deletions: number;
  status?: 'added' | 'deleted' | 'modified';
};

export type FileNode = {
  name: string;
  path: string;
  absolute: string;
  type: 'file' | 'directory';
  ignored: boolean;
};

export type FileContent = {
  type: 'text' | 'binary';
  content?: string;
  diff?: string;
  /** Present for binary files: base64 payload encoding and detected mime type. */
  encoding?: 'base64';
  mimeType?: string;
};

/** A slash command registered on the server (built-in, project, or global). */
export type OpencodeCommand = {
  name: string;
  description: string;
  source?: string;
  template?: string;
  agent?: string | null;
  model?: string | null;
  subtask?: boolean | null;
};

/** Response envelope of POST /session/:id/command. */
export type OpencodeCommandResult = {
  info: OpencodeMessageInfo;
  parts: OpencodePart[];
};

export type OpencodeTextPartInput = {
  type: 'text';
  text: string;
};

export type OpencodeFilePartInput = {
  type: 'file';
  mime: string;
  filename?: string;
  url: string;
};

export type OpencodePartInput = OpencodeTextPartInput | OpencodeFilePartInput;

/** A question the assistant asked via the `question` tool (question.asked). */
export type OpencodeQuestion = {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiple?: boolean;
  custom?: boolean;
};

/** A pending question request as returned by GET /question. */
export type OpencodeQuestionRequest = {
  id: string;
  sessionID: string;
  questions: OpencodeQuestion[];
  tool?: { messageID: string; callID: string };
};

export type OpencodeEvent =
  | { type: 'message.updated'; properties: { info: OpencodeMessageInfo } }
  | { type: 'message.part.updated'; properties: { part: OpencodePart; delta?: string } }
  | { type: 'message.part.removed'; properties: { messageID: string; partID: string } }
  | { type: 'session.idle'; properties: { sessionID: string } }
  | { type: 'session.status'; properties: { sessionID: string; status: { type: string } } }
  | {
      type: 'question.asked';
      properties: {
        id: string;
        sessionID: string;
        questions: OpencodeQuestion[];
        tool?: { messageID: string; callID: string };
      };
    }
  | {
      type: 'question.replied';
      properties: { sessionID: string; requestID: string; answers: string[][] };
    }
  | {
      type: 'question.rejected';
      properties: { sessionID: string; requestID: string };
    }
  | {
      type: 'permission.asked';
      properties: {
        id: string;
        sessionID: string;
        permission: string;
        patterns: string[];
        metadata?: Record<string, unknown>;
        always?: string[];
        tool?: { messageID: string; callID: string };
      };
    }
  | {
      type: 'permission.replied';
      properties: { sessionID: string; requestID: string; reply: PermissionReply };
    }
  | { type: string; properties: Record<string, unknown> };

export type OpencodeClientOptions = {
  baseUrl: string;
  username?: string;
  password?: string;
  directory?: string;
};
