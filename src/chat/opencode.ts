import { Directory, File, Paths } from 'expo-file-system';

import { classifyError } from '@/components/ui/error-state';

export * from './opencode-types';
import type {
  FileContent,
  FileNode,
  GlobalConfig,
  OpencodeClientOptions,
  OpencodeCommand,
  OpencodeCommandResult,
  OpencodeMessage,
  OpencodePartInput,
  OpencodePermissionRequest,
  OpencodeProject,
  OpencodeProvidersResponse,
  OpencodeQuestionRequest,
  OpencodeSession,
  PermissionReply,
  ProviderAuthMethod,
  ProviderCatalogResponse,
  ProviderOAuthAuthorization,
  VcsFileDiff,
  VcsFileStatus,
} from './opencode-types';

/** Payloads larger than this are refused before JSON parsing can OOM the app. */
const FILE_CONTENT_MAX_BYTES = 32 * 1024 * 1024;

function cacheFileName(baseUrl: string, directory: string | undefined, path: string) {
  const key = `${baseUrl}|${directory ?? ''}|${path}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `opencode-${(hash >>> 0).toString(16)}.json`;
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Shape-checks a downloaded payload; error envelopes fail the check. */
function normalizePayloadError(data: unknown): Error {
  const snippet = JSON.stringify(data)?.slice(0, 200) ?? '';
  if (/notfound/i.test(snippet)) {
    return new Error(`opencode 404: ${snippet}`);
  }
  if (/unauthorized/i.test(snippet)) {
    return new Error('Unauthorized: check the server password in settings.');
  }
  return new Error(`opencode request failed (unexpected response): ${snippet}`);
}

/**
 * Maps native download failures onto the `opencode <status>` error shape the
 * rest of the app classifies on (e.g. session/file-not-found handling).
 */
function normalizeDownloadError(cause: unknown): Error {
  if (cause instanceof Error) {
    if (cause.message.startsWith('opencode ') || cause.message.startsWith('Unauthorized')) {
      return cause;
    }
    // Only 4xx/5xx look like HTTP statuses; filenames and hashes in native
    // error messages contain digit runs that must not match (e.g. cache hash).
    const code = cause.message.match(/status\D{0,12}([45]\d{2})|\b([45]\d{2})\b/)?.slice(1).find(Boolean);
    if (code === '401') {
      return new Error('Unauthorized: check the server password in settings.');
    }
    if (code) {
      return new Error(`opencode ${code}: ${cause.message.slice(0, 200)}`);
    }
    if (/notfound/i.test(cause.message)) {
      return new Error(`opencode 404: ${cause.message.slice(0, 200)}`);
    }
  }
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** True when a request failed because the session no longer exists server-side. */
export function isSessionNotFoundError(cause: unknown) {
  return classifyError(cause) === 'not-found';
}

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

  /** Project folders the server knows about (each has an absolute worktree). */
  listProjects() {
    return this.request<OpencodeProject[]>('/project');
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

  forkSession(sessionId: string, messageID?: string) {
    return this.request<OpencodeSession>(`/session/${sessionId}/fork`, {
      method: 'POST',
      body: JSON.stringify(messageID ? { messageID } : {}),
    });
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

  /**
   * Reads file content through a native download into the app cache: the
   * response body streams straight to disk instead of sitting in the JS heap
   * as a giant string, which matters for multi-megabyte files. Files larger
   * than FILE_CONTENT_MAX_BYTES are refused before they can OOM the parser.
   */
  async readFile(path: string, onProgress?: (fraction: number) => void): Promise<FileContent> {
    const url = this.url(`/file/content?path=${encodeURIComponent(path)}`);
    const cacheDir = new Directory(Paths.cache, 'opencode-files');
    if (!cacheDir.exists) {
      new Directory(Paths.cache).createDirectory('opencode-files');
    }
    const dest = new File(cacheDir, cacheFileName(this.baseUrl, this.directory, path));
    const controller = new AbortController();
    let tooLarge: number | null = null;
    let announcedTotal = -1;

    try {
      const file = await File.downloadFileAsync(url, dest, {
        headers: { ...this.headers },
        idempotent: true,
        signal: controller.signal,
        onProgress: ({ bytesWritten, totalBytes }) => {
          announcedTotal = totalBytes;
          if (totalBytes > FILE_CONTENT_MAX_BYTES) {
            // Best effort: not all expo-file-system versions honor the
            // abort signal here. The post-download size check below is the
            // real guard; this just saves bandwidth when it works.
            tooLarge = totalBytes;
            controller.abort();
            return;
          }
          if (totalBytes > 0) {
            onProgress?.(Math.min(1, bytesWritten / totalBytes));
          }
        },
      });
      if (announcedTotal > FILE_CONTENT_MAX_BYTES) {
        tooLarge = announcedTotal;
        throw new Error('__too_large__');
      }
      const data = (await file.json()) as Partial<FileContent>;
      if (data?.type !== 'text' && data?.type !== 'binary') {
        throw normalizePayloadError(data);
      }
      onProgress?.(1);
      return data as FileContent;
    } catch (cause) {
      if (tooLarge !== null || (cause instanceof Error && cause.message === '__too_large__')) {
        const total = tooLarge ?? announcedTotal;
        // Oversize payloads stay on disk (system-purgeable cache, overwritten
        // on retry) and are never parsed: parsing is what would OOM us.
        throw new Error(
          `File too large to preview (${formatMegabytes(total)}). Limit is ${formatMegabytes(FILE_CONTENT_MAX_BYTES)}.`,
        );
      }
      throw normalizeDownloadError(cause);
    }
  }

  findFiles(query: string, limit = 50) {
    return this.request<string[]>(
      `/find/file?query=${encodeURIComponent(query)}&limit=${limit}`,
    );
  }

  /** Slash commands registered on the server for the current directory. */
  listCommands() {
    return this.request<OpencodeCommand[]>('/command');
  }

  /**
   * Execute a slash command in a session. Mirrors promptAsync: the caller
   * supplies the user message ID so the optimistic message is reconciled by
   * the SSE stream, and the assistant reply streams back the same way.
   */
  executeCommand(
    sessionId: string,
    input: {
      messageID?: string;
      command: string;
      args: string;
      model?: string;
      parts?: OpencodePartInput[];
    },
  ) {
    return this.request<OpencodeCommandResult>(`/session/${sessionId}/command`, {
      method: 'POST',
      body: JSON.stringify({
        messageID: input.messageID,
        command: input.command,
        arguments: input.args,
        model: input.model,
        parts: input.parts,
      }),
    });
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

  /** Pending `question` tool requests across all sessions. */
  listQuestions() {
    return this.request<OpencodeQuestionRequest[]>('/question');
  }

  /**
   * Answer a pending `question` tool request. The execution resumes
   * server-side; `answers` holds the selected labels (plus any custom text)
   * per question, in order.
   */
  replyToQuestion(requestID: string, answers: string[][]) {
    return this.request<boolean>(`/question/${requestID}/reply`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  }

  rejectQuestion(requestID: string) {
    return this.request<boolean>(`/question/${requestID}/reject`, { method: 'POST' });
  }

  /** Pending tool permission requests (e.g. a bash call awaiting approval). */
  listPermissions() {
    return this.request<OpencodePermissionRequest[]>('/permission');
  }

  replyToPermission(requestID: string, reply: PermissionReply) {
    return this.request<boolean>(`/permission/${requestID}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply }),
    });
  }

  renameSession(sessionId: string, title: string) {
    return this.request<OpencodeSession>(`/session/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  /**
   * Undo back to (and including) a message, usually the last user message.
   * The server truncates the history; callers reload the session after.
   */
  revertSession(sessionId: string, messageID: string) {
    return this.request<OpencodeSession>(`/session/${sessionId}/revert`, {
      method: 'POST',
      body: JSON.stringify({ messageID }),
    });
  }

  unrevertSession(sessionId: string) {
    return this.request<OpencodeSession>(`/session/${sessionId}/unrevert`, { method: 'POST' });
  }

  deleteMessage(sessionId: string, messageID: string) {
    return this.request<boolean>(`/session/${sessionId}/message/${messageID}`, {
      method: 'DELETE',
    });
  }

  /** Sessions spawned from this one (forks, subagent runs). */
  listSessionChildren(sessionId: string) {
    return this.request<OpencodeSession[]>(`/session/${sessionId}/children`);
  }

  shareSession(sessionId: string) {
    return this.request<OpencodeSession>(`/session/${sessionId}/share`, { method: 'POST' });
  }

  unshareSession(sessionId: string) {
    return this.request<OpencodeSession>(`/session/${sessionId}/share`, { method: 'DELETE' });
  }

  summarizeSession(sessionId: string, model: { providerID: string; modelID: string }) {
    return this.request<boolean>(`/session/${sessionId}/summarize`, {
      method: 'POST',
      body: JSON.stringify({ providerID: model.providerID, modelID: model.modelID }),
    });
  }

  /**
   * Execute a shell command in the session context. Mirrors executeCommand:
   * the caller supplies the user message ID so the optimistic message is
   * reconciled by the SSE stream, and the result streams back the same way.
   */
  executeShell(
    sessionId: string,
    input: {
      messageID?: string;
      agent: string;
      command: string;
      model?: { providerID: string; modelID: string };
    },
  ) {
    return this.request<OpencodeCommandResult>(`/session/${sessionId}/shell`, {
      method: 'POST',
      body: JSON.stringify({
        messageID: input.messageID,
        agent: input.agent,
        command: input.command,
        model: input.model,
      }),
    });
  }
}
