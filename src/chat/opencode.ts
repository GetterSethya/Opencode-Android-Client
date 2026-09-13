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

export type OpencodeMessageInfo = {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: { created: number; completed?: number };
  modelID?: string;
  providerID?: string;
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

export type OpencodeEvent =
  | { type: 'message.updated'; properties: { info: OpencodeMessageInfo } }
  | { type: 'message.part.updated'; properties: { part: OpencodePart; delta?: string } }
  | { type: 'message.part.removed'; properties: { messageID: string; partID: string } }
  | { type: 'session.idle'; properties: { sessionID: string } }
  | { type: 'session.status'; properties: { sessionID: string; status: { type: string } } }
  | { type: string; properties: Record<string, unknown> };

export type OpencodeClientOptions = {
  baseUrl: string;
  username?: string;
  password?: string;
  directory?: string;
};

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(input: string) {
  let output = '';
  let index = 0;

  while (index < input.length) {
    const char1 = input.charCodeAt(index++) & 0xff;
    const char2 = index < input.length ? input.charCodeAt(index++) & 0xff : Number.NaN;
    const char3 = index < input.length ? input.charCodeAt(index++) & 0xff : Number.NaN;

    const enc1 = char1 >> 2;
    const enc2 = ((char1 & 3) << 4) | (Number.isNaN(char2) ? 0 : char2 >> 4);
    const enc3 = Number.isNaN(char2) ? 64 : ((char2 & 15) << 2) | (Number.isNaN(char3) ? 0 : char3 >> 6);
    const enc4 = Number.isNaN(char3) ? 64 : char3 & 63;

    output +=
      BASE64_CHARS[enc1] +
      BASE64_CHARS[enc2] +
      (enc3 === 64 ? '=' : BASE64_CHARS[enc3]) +
      (enc4 === 64 ? '=' : BASE64_CHARS[enc4]);
  }

  return output;
}

function buildUrl(baseUrl: string, path: string, directory?: string) {
  const base = baseUrl.replace(/\/$/, '');
  if (!directory) {
    return `${base}${path}`;
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${base}${path}${separator}directory=${encodeURIComponent(directory)}`;
}

export class OpencodeClient {
  private readonly baseUrl: string;
  private readonly directory?: string;
  private readonly headers: Record<string, string>;

  constructor(options: OpencodeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.directory = options.directory || undefined;
    this.headers = { 'Content-Type': 'application/json' };
    if (options.password) {
      const credentials = base64Encode(`${options.username || 'opencode'}:${options.password}`);
      this.headers.Authorization = `Basic ${credentials}`;
    }
  }

  authHeaders() {
    return { ...this.headers };
  }

  private url(path: string) {
    return buildUrl(this.baseUrl, path, this.directory);
  }

  eventUrl() {
    return this.url('/event');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.url(path), {
      ...init,
      headers: {
        ...this.headers,
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new Error('Unauthorized: check the server password in settings.');
      }
      throw new Error(`opencode ${response.status}: ${text || response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  listSessions() {
    return this.request<OpencodeSession[]>('/session');
  }

  createSession(title?: string) {
    return this.request<OpencodeSession>('/session', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  deleteSession(sessionId: string) {
    return this.request<boolean>(`/session/${sessionId}`, { method: 'DELETE' });
  }

  listMessages(sessionId: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<OpencodeMessage[]>(`/session/${sessionId}/message${query}`);
  }

  listProviders() {
    return this.request<OpencodeProvidersResponse>('/config/providers');
  }

  listProviderCatalog() {
    return this.request<ProviderCatalogResponse>('/provider');
  }

  listProviderAuthMethods() {
    return this.request<Record<string, ProviderAuthMethod[]>>('/provider/auth');
  }

  authorizeProviderOAuth(
    providerID: string,
    methodIndex: number,
    inputs?: Record<string, string>,
  ) {
    return this.request<ProviderOAuthAuthorization>(
      `/provider/${encodeURIComponent(providerID)}/oauth/authorize`,
      {
        method: 'POST',
        body: JSON.stringify({ method: methodIndex, ...(inputs ? { inputs } : {}) }),
      },
    );
  }

  callbackProviderOAuth(providerID: string, methodIndex: number, code?: string) {
    return this.request<boolean>(
      `/provider/${encodeURIComponent(providerID)}/oauth/callback`,
      {
        method: 'POST',
        body: JSON.stringify({ method: methodIndex, ...(code ? { code } : {}) }),
      },
    );
  }

  setProviderAuth(providerID: string, key: string) {
    return this.request<boolean>(`/auth/${encodeURIComponent(providerID)}`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'api', key }),
    });
  }

  removeProviderAuth(providerID: string) {
    return this.request<boolean>(`/auth/${encodeURIComponent(providerID)}`, {
      method: 'DELETE',
    });
  }

  getGlobalConfig() {
    return this.request<GlobalConfig>('/global/config');
  }

  vcsStatus() {
    return this.request<VcsFileStatus[]>('/vcs/status');
  }

  vcsDiff(mode: 'git' | 'branch' = 'git', context = 3) {
    return this.request<VcsFileDiff[]>(`/vcs/diff?mode=${mode}&context=${context}`);
  }

  listFiles(path = '.') {
    return this.request<FileNode[]>(`/file?path=${encodeURIComponent(path)}`);
  }

  readFile(path: string) {
    return this.request<FileContent>(`/file/content?path=${encodeURIComponent(path)}`);
  }

  findFiles(query: string, limit = 50) {
    return this.request<string[]>(
      `/find/file?query=${encodeURIComponent(query)}&limit=${limit}`,
    );
  }

  updateGlobalConfig(patch: Partial<GlobalConfig>) {
    return this.request<GlobalConfig>('/global/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  promptAsync(
    sessionId: string,
    parts: OpencodePartInput[],
    messageID?: string,
    model?: { providerID: string; modelID: string; variant?: string },
  ) {
    return this.request<void>(`/session/${sessionId}/prompt_async`, {
      method: 'POST',
      body: JSON.stringify({
        messageID,
        model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
        variant: model?.variant,
        parts,
      }),
    });
  }

  abort(sessionId: string) {
    return this.request<boolean>(`/session/${sessionId}/abort`, { method: 'POST' });
  }
}
