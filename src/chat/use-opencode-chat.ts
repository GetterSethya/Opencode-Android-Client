import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EventSource from 'react-native-sse';

import { toFilePart, type PendingAttachment } from './attachments';
import {
  isSessionNotFoundError,
  OpencodeClient,
  type OpencodeEvent,
  type OpencodeMessage,
  type OpencodeMessageInfo,
  type OpencodePart,
  type OpencodeQuestion,
  type PermissionReply,
  type OpencodePartInput,
  type OpencodeSession,
  type OpencodeToolState,
} from './opencode';
import { useChatSettings } from './settings';
import { createClientFromServer } from './use-opencode-providers';
import type { ChatStatus, ToolState, UIMessage, UIMessagePart } from './types';

type MessageRecord = {
  info: OpencodeMessageInfo;
  parts: Record<string, OpencodePart>;
};

type MessageState = Record<string, MessageRecord>;

function mapToolState(state: OpencodeToolState): ToolState {
  switch (state.status) {
    case 'pending':
      return 'input-streaming';
    case 'running':
      return 'input-available';
    case 'completed':
      return 'output-available';
    case 'error':
      return 'output-error';
    default:
      return 'input-streaming';
  }
}

function partToUI(part: OpencodePart): UIMessagePart | null {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'reasoning':
      return { type: 'reasoning', text: part.text };
    case 'file':
      return {
        type: 'file',
        mediaType: part.mime,
        filename: part.filename,
        url: part.url,
      };
    case 'tool': {
      const toolState = part.state;
      const title =
        toolState.status === 'completed' || toolState.status === 'running'
          ? toolState.title
          : undefined;
      return {
        type: `tool-${part.tool}`,
        toolName: part.tool,
        title,
        toolCallId: part.callID,
        state: mapToolState(toolState),
        input: toolState.input,
        output: toolState.status === 'completed' ? toolState.output : undefined,
        errorText: toolState.status === 'error' ? toolState.error : undefined,
        metadata:
          toolState.status === 'completed' || toolState.status === 'running'
            ? toolState.metadata
            : undefined,
      };
    }
    case 'step-start':
      return { type: 'step-start' };
    default:
      return null;
  }
}

function buildState(messages: OpencodeMessage[]): MessageState {
  const next: MessageState = {};
  for (const message of messages) {
    next[message.info.id] = {
      info: message.info,
      parts: Object.fromEntries(message.parts.map((part) => [part.id, part])),
    };
  }
  return next;
}

function optimisticMessageId() {
  return `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function buildOptimisticMessage(
  sid: string,
  id: string,
  created: number,
  text: string,
  attachments: PendingAttachment[],
): MessageRecord {
  const parts: MessageRecord['parts'] = {};
  if (text) {
    parts[`optimistic-${id}-text`] = {
      id: `optimistic-${id}-text`,
      sessionID: sid,
      messageID: id,
      type: 'text',
      text,
    };
  }
  for (const attachment of attachments) {
    parts[`optimistic-${id}-${attachment.id}`] = {
      id: `optimistic-${id}-${attachment.id}`,
      sessionID: sid,
      messageID: id,
      type: 'file',
      mime: attachment.mime,
      filename: attachment.name,
      url: attachment.uri,
    };
  }
  return {
    info: { id, sessionID: sid, role: 'user', time: { created } },
    parts,
  };
}

async function buildFileParts(attachments: PendingAttachment[]): Promise<OpencodePartInput[]> {
  const parts: OpencodePartInput[] = [];
  for (const attachment of attachments) {
    parts.push(await toFilePart(attachment));
  }
  return parts;
}

/** Rebuilds sendable prompt parts from a stored user message (for retry). */
function recordToInputParts(record: MessageRecord): OpencodePartInput[] {
  const parts: OpencodePartInput[] = [];
  for (const part of Object.values(record.parts)) {
    if (part.type === 'text' && part.text.trim()) {
      parts.push({ type: 'text', text: part.text });
    } else if (part.type === 'file') {
      parts.push({ type: 'file', mime: part.mime, filename: part.filename, url: part.url });
    }
  }
  return parts;
}

function applyEvent(state: MessageState, event: OpencodeEvent, sessionId: string): MessageState {
  switch (event.type) {
    case 'message.updated': {
      const info = event.properties.info as OpencodeMessageInfo;
      if (info.sessionID !== sessionId) {
        return state;
      }
      const existing = state[info.id];
      return {
        ...state,
        [info.id]: { info: { ...existing?.info, ...info }, parts: existing?.parts ?? {} },
      };
    }
    case 'message.part.updated': {
      const part = event.properties.part as OpencodePart;
      if (part.sessionID !== sessionId) {
        return state;
      }
      const existing = state[part.messageID] ?? {
        info: {
          id: part.messageID,
          sessionID: sessionId,
          role: 'assistant' as const,
          time: { created: Date.now() },
        },
        parts: {},
      };
      const parts = { ...existing.parts };
      for (const key of Object.keys(parts)) {
        if (key.startsWith('optimistic-')) {
          delete parts[key];
        }
      }
      parts[part.id] = part;
      return { ...state, [part.messageID]: { ...existing, parts } };
    }
    case 'message.part.removed': {
      const { messageID, partID } = event.properties as { messageID: string; partID: string };
      const existing = state[messageID];
      if (!existing) {
        return state;
      }
      const parts = { ...existing.parts };
      delete parts[partID];
      return { ...state, [messageID]: { ...existing, parts } };
    }
    default:
      return state;
  }
}

/**
 * Collapses the server's discriminated error union into the flat shape the UI
 * renders. Not every variant carries a status code; provider auth failures
 * only have a message.
 */
function toMessageError(error: OpencodeMessageInfo['error']): UIMessage['error'] {
  if (!error) {
    return undefined;
  }
  const data = error.data ?? {};
  const message =
    typeof data.message === 'string'
      ? data.message
      : typeof data.providerID === 'string'
        ? `Authentication failed for ${data.providerID}.`
        : undefined;
  return {
    name: error.name,
    message,
    statusCode: typeof data.statusCode === 'number' ? data.statusCode : undefined,
    isRetryable: typeof data.isRetryable === 'boolean' ? data.isRetryable : undefined,
  };
}

function deriveMessages(state: MessageState): UIMessage[] {
  return Object.values(state)
    .sort((a, b) => a.info.time.created - b.info.time.created)
    .map((record) => {
      const { info } = record;
      const durationMs =
        info.role === 'assistant' && info.time.completed
          ? info.time.completed - info.time.created
          : undefined;
      return {
        id: info.id,
        role: info.role,
        model: info.modelID,
        durationMs,
        error: toMessageError(info.error),
        parts: Object.values(record.parts)
          .map(partToUI)
          .filter((part): part is UIMessagePart => part !== null),
      };
    });
}

function sortSessions(sessions: OpencodeSession[]) {
  return [...sessions].sort((a, b) => b.time.updated - a.time.updated);
}

/**
 * Pagination sizes. Long histories are expensive to fetch and derive in one
 * go, so the newest page loads first and older pages are pulled in on scroll,
 * with a spinner shown while a page is in flight.
 */
const INITIAL_HISTORY_LIMIT = 60;
const MESSAGE_PAGE_SIZE = 60;

/** Sentinel fork target for a whole-session fork (no message ID). */
export const FORK_WHOLE_SESSION = '__session__';

/**
 * A `question` tool request waiting for the user. The paused run resumes
 * when the answers are posted to POST /question/:id/reply.
 */
export type PendingQuestion = {
  requestID: string;
  sessionID: string;
  messageID: string;
  callID: string;
  /** Authoritative questions from the event, used if the part input lags. */
  questions: OpencodeQuestion[];
  /** Local update time; guards reconciliation against in-flight events. */
  updatedAt?: number;
};

/**
 * A tool permission request waiting for the user (e.g. a bash call the
 * server policy wants approved). Replying resumes or stops the run.
 */
export type PendingPermission = {
  requestID: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  messageID?: string;
  callID?: string;
};

/**
 * A message composed while a run was in flight. It is sent automatically,
 * in order, once the session goes idle again.
 */
export type QueuedMessage = {
  id: string;
  sessionID: string;
  kind: 'message' | 'command' | 'shell';
  text: string;
  command?: string;
  args?: string;
  attachments: PendingAttachment[];
};

function queuedMessageId() {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function useOpencodeChat() {
  const queryClient = useQueryClient();
  const { activeServer, ready: settingsReady, updateServer } = useChatSettings();
  const client = useMemo(
    () =>
      new OpencodeClient({
        baseUrl: activeServer.serverUrl,
        username: activeServer.username,
        password: activeServer.password,
        directory: activeServer.directory || undefined,
      }),
    [activeServer.serverUrl, activeServer.username, activeServer.password, activeServer.directory],
  );

  const [state, setState] = useState<MessageState>({});
  const [sessions, setSessions] = useState<OpencodeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<string | null>(null);
  // Fatal-to-view failures (initial load, session select): rendered as a
  // full 404/500 screen when there are no messages to show. Transient
  // failures (send, fork, refresh) stay in `error` as an inline banner.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(INITIAL_HISTORY_LIMIT);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  // Message ID being forked, or FORK_WHOLE_SESSION for a full-session fork.
  const [forkTarget, setForkTarget] = useState<string | null>(null);
  const forkingRef = useRef(false);
  // `question` tool requests still waiting for an answer, keyed by request ID.
  const [pendingQuestionMap, setPendingQuestionMap] = useState<Record<string, PendingQuestion>>(
    {},
  );
  // Tool permission requests still waiting for a reply, keyed by request ID.
  const [pendingPermissionMap, setPendingPermissionMap] = useState<
    Record<string, PendingPermission>
  >({});
  // Messages composed while a run was in flight; a ref mirror drives the
  // auto-flush so the effect never acts on a stale closure.
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const messageQueueRef = useRef<QueuedMessage[]>([]);

  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Mirror of `state` for callbacks that must read the latest messages without
  // being re-created on every streamed part.
  const stateRef = useRef<MessageState>({});
  stateRef.current = state;

  const sessionsRef = useRef<OpencodeSession[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  /**
   * Reconciles pending question requests with the server. The SSE
   * `question.asked` event only covers requests raised while this client is
   * connected; requests still pending from before (app restart, another
   * client) would otherwise render read-only. Entries the server no longer
   * reports are dropped.
   */
  const refreshPendingQuestions = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const requests = await client.listQuestions();
      setPendingQuestionMap((prev) => {
        const reported = new Set(requests.map((request) => request.id));
        const next: Record<string, PendingQuestion> = {};
        for (const request of requests) {
          const existing = prev[request.id];
          next[request.id] = {
            requestID: request.id,
            sessionID: request.sessionID,
            messageID: request.tool?.messageID ?? existing?.messageID ?? '',
            callID: request.tool?.callID ?? existing?.callID ?? '',
            questions: request.questions ?? existing?.questions ?? [],
            updatedAt: existing?.updatedAt ?? startedAt,
          };
        }
        // Drop entries the server no longer reports, but keep ones raised
        // after this fetch began (a live `question.asked` racing the GET).
        for (const [id, entry] of Object.entries(prev)) {
          if (!reported.has(id) && (entry.updatedAt ?? 0) > startedAt) {
            next[id] = entry;
          }
        }
        return next;
      });
    } catch {
      // Best effort: the SSE event remains the fast path for live requests.
    }
  }, [client]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      const history = await client.listMessages(sessionId, INITIAL_HISTORY_LIMIT);
      setState(buildState(history));
      setActiveSessionId(sessionId);
      setHistoryLimit(INITIAL_HISTORY_LIMIT);
      setHasMoreOlder(history.length >= INITIAL_HISTORY_LIMIT);
      void refreshPendingQuestions();
    },
    [client, refreshPendingQuestions],
  );

  const bootstrap = useCallback(
    async (cancelledRef: { cancelled: boolean }) => {
      setError(null);
      setLoadError(null);
      setStatus('ready');
      setState({});
      setPendingQuestionMap({});
      setPendingPermissionMap({});
      messageQueueRef.current = [];
      setMessageQueue([]);
      setActiveSessionId(null);
      activeSessionIdRef.current = null;
      setIsLoading(true);

      try {
        const list = await client.listSessions();
        if (cancelledRef.cancelled) {
          return;
        }
        const sorted = sortSessions(list);
        setSessions(sorted);
        void refreshPendingQuestions();

        if (sorted.length > 0) {
          const history = await client.listMessages(sorted[0].id, INITIAL_HISTORY_LIMIT);
          if (cancelledRef.cancelled) {
            return;
          }
          setState(buildState(history));
          setActiveSessionId(sorted[0].id);
          activeSessionIdRef.current = sorted[0].id;
          setHistoryLimit(INITIAL_HISTORY_LIMIT);
          setHasMoreOlder(history.length >= INITIAL_HISTORY_LIMIT);
        } else {
          const session = await client.createSession('opencode mobile');
          if (cancelledRef.cancelled) {
            return;
          }
          setSessions([session]);
          setActiveSessionId(session.id);
          activeSessionIdRef.current = session.id;
        }
      } catch (cause) {
        if (!cancelledRef.cancelled) {
          setLoadError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!cancelledRef.cancelled) {
          setIsLoading(false);
        }
      }
    },
    [client, refreshPendingQuestions],
  );

  useEffect(() => {
    if (!settingsReady) {
      return;
    }

    const cancelledRef = { cancelled: false };
    void bootstrap(cancelledRef);

    return () => {
      cancelledRef.cancelled = true;
    };
  }, [bootstrap, settingsReady]);

  useEffect(() => {
    if (!settingsReady) {
      return;
    }

    const eventSource = new EventSource(client.eventUrl(), {
      pollingInterval: 0,
      headers: client.authHeaders(),
    });

    eventSource.addEventListener('message', (event) => {
      const raw = (event as { data?: string | null }).data;
      if (!raw) {
        return;
      }

      let parsed: OpencodeEvent;
      try {
        parsed = JSON.parse(raw) as OpencodeEvent;
      } catch {
        return;
      }

      const sid = activeSessionIdRef.current;

      if (parsed.type === 'session.idle') {
        if ((parsed.properties as { sessionID?: string }).sessionID === sid) {
          setStatus('ready');
        }
        return;
      }

      if (parsed.type === 'session.status') {
        const properties = parsed.properties as {
          sessionID?: string;
          status?: { type?: string };
        };
        if (properties.sessionID === sid && properties.status?.type === 'idle') {
          setStatus('ready');
        }
        return;
      }

      if (
        parsed.type === 'session.updated' ||
        parsed.type === 'session.created' ||
        parsed.type === 'session.forked'
      ) {
        const info = (parsed.properties as { info?: OpencodeSession }).info;
        if (info?.id) {
          setSessions((prev) => {
            const others = prev.filter((session) => session.id !== info.id);
            return sortSessions([info, ...others]);
          });
        }
        return;
      }

      if (parsed.type === 'session.deleted') {
        const deletedId = (parsed.properties as { sessionID?: string }).sessionID;
        if (deletedId) {
          setSessions((prev) => prev.filter((session) => session.id !== deletedId));
          if (activeSessionIdRef.current === deletedId) {
            const remaining = sortSessions(
              sessionsRef.current.filter((session) => session.id !== deletedId),
            );
            const next = remaining[0];
            if (next) {
              void loadSession(next.id).catch(() => {
                // Fallback failed (e.g. also deleted); clear instead.
                activeSessionIdRef.current = null;
                setActiveSessionId(null);
                setState({});
              });
            } else {
              activeSessionIdRef.current = null;
              setActiveSessionId(null);
              setState({});
              setStatus('ready');
            }
          }
        }
        return;
      }

      // Config reloads (adding/removing providers, models, credentials) and
      // server restarts invalidate the cached provider catalog. Without this
      // the app keeps showing the provider list it fetched at startup.
      if (parsed.type === 'catalog.updated' || parsed.type === 'global.disposed') {
        void queryClient.invalidateQueries({ queryKey: ['providers-catalog'] });
        void queryClient.invalidateQueries({ queryKey: ['provider-auth-methods'] });
        void queryClient.invalidateQueries({ queryKey: ['global-config'] });
        void queryClient.invalidateQueries({ queryKey: ['opencode-providers'] });
        return;
      }

      // The `question` tool pauses the run until the user answers. Track
      // pending requests so the tool renders tappable options; answering
      // posts to POST /question/:id/reply and the run resumes server-side.
      if (parsed.type === 'question.asked') {
        const properties = parsed.properties as {
          id: string;
          sessionID: string;
          questions: OpencodeQuestion[];
          tool?: { messageID: string; callID: string };
        };
        setPendingQuestionMap((prev) => ({
          ...prev,
          [properties.id]: {
            requestID: properties.id,
            sessionID: properties.sessionID,
            messageID: properties.tool?.messageID ?? '',
            callID: properties.tool?.callID ?? '',
            questions: properties.questions ?? [],
            updatedAt: Date.now(),
          },
        }));
        return;
      }

      if (parsed.type === 'question.replied' || parsed.type === 'question.rejected') {
        const requestID = (parsed.properties as { requestID?: string }).requestID;
        if (!requestID) {
          return;
        }
        setPendingQuestionMap((prev) => {
          if (!(requestID in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[requestID];
          return next;
        });
        return;
      }

      // Tool permission requests pause the run until approved or rejected.
      // They carry the tool call they belong to, so the card renders under
      // the matching tool part (same pattern as question.asked).
      if (parsed.type === 'permission.asked') {
        const properties = parsed.properties as {
          id: string;
          sessionID: string;
          permission: string;
          patterns: string[];
          tool?: { messageID: string; callID: string };
        };
        setPendingPermissionMap((prev) => ({
          ...prev,
          [properties.id]: {
            requestID: properties.id,
            sessionID: properties.sessionID,
            permission: properties.permission,
            patterns: properties.patterns ?? [],
            messageID: properties.tool?.messageID,
            callID: properties.tool?.callID,
          },
        }));
        return;
      }

      if (parsed.type === 'permission.replied') {
        const requestID = (parsed.properties as { requestID?: string }).requestID;
        if (!requestID) {
          return;
        }
        setPendingPermissionMap((prev) => {
          if (!(requestID in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[requestID];
          return next;
        });
        return;
      }

      if (
        parsed.type === 'message.updated' ||
        parsed.type === 'message.part.updated' ||
        parsed.type === 'message.part.removed'
      ) {
        if (!sid) {
          return;
        }
        setState((prev) => applyEvent(prev, parsed, sid));
        if (parsed.type === 'message.part.updated') {
          const part = parsed.properties.part as OpencodePart;
          if (part.sessionID === sid) {
            setStatus((current) => (current === 'ready' ? 'streaming' : current));
          }
        }
      }
    });

    // A reconnect can have missed question events; resync from the server.
    eventSource.addEventListener('open', () => {
      void refreshPendingQuestions();
    });

    eventSource.addEventListener('error', () => {
      // react-native-sse reconnects automatically.
    });

    return () => {
      eventSource.close();
    };
  }, [client, settingsReady, loadSession, queryClient, refreshPendingQuestions]);

  /**
   * Pulls the next (older) page in. Guarded so a fling to the top cannot fire
   * overlapping requests, and paused while a response is streaming (the list
   * is jumping around and the user is reading the newest messages).
   */
  const loadOlderMessages = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid || !hasMoreOlder || isLoadingOlder) {
      return;
    }
    if (status === 'submitted' || status === 'streaming') {
      return;
    }
    setIsLoadingOlder(true);
    try {
      const nextLimit = historyLimit + MESSAGE_PAGE_SIZE;
      const history = await client.listMessages(sid, nextLimit);
      setState(buildState(history));
      setHistoryLimit(nextLimit);
      setHasMoreOlder(history.length >= nextLimit);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsLoadingOlder(false);
    }
  }, [client, hasMoreOlder, isLoadingOlder, status, historyLimit]);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await client.listSessions();
      setSessions(sortSessions(list));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [client]);

  /**
   * Creates a session, optionally in a different project folder. When the
   * folder differs from the server's configured directory the setting is
   * updated and that session becomes the active one (sessions are scoped to
   * their folder, so the list is reloaded for it).
   */
  const createSession = useCallback(
    async (directory?: string) => {
      const current = activeServer.directory ?? '';
      const target = directory ?? current;
      try {
        const targetClient =
          target === current
            ? client
            : createClientFromServer({ ...activeServer, directory: target });
        const session = await targetClient.createSession('New session');
        if (target !== current) {
          updateServer(activeServer.id, { directory: target });
          setSessions([session]);
          setState({});
          setActiveSessionId(session.id);
          activeSessionIdRef.current = session.id;
          setStatus('ready');
          setError(null);
          setLoadError(null);
          return;
        }
        setSessions((prev) => sortSessions([session, ...prev]));
        setState({});
        setActiveSessionId(session.id);
        activeSessionIdRef.current = session.id;
        setStatus('ready');
        setError(null);
        setLoadError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [activeServer, client, updateServer],
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current) {
        return;
      }
      setIsLoading(true);
      setError(null);
      setLoadError(null);
      setStatus('ready');
      try {
        await loadSession(sessionId);
      } catch (cause) {
        if (isSessionNotFoundError(cause)) {
          // Stale entry (deleted elsewhere): drop it instead of showing raw JSON.
          setSessions((prev) => prev.filter((session) => session.id !== sessionId));
          setError('That session no longer exists.');
        } else {
          setLoadError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [loadSession],
  );

  /**
   * Re-runs the current view load after a full-screen 404/500: reloads the
   * active session, or bootstraps from scratch when there is none.
   */
  const retryLoad = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    setLoadError(null);
    if (sid) {
      setIsLoading(true);
      try {
        await loadSession(sid);
      } catch (cause) {
        if (isSessionNotFoundError(cause)) {
          setSessions((prev) => prev.filter((session) => session.id !== sid));
          setActiveSessionId(null);
          activeSessionIdRef.current = null;
          setState({});
          setLoadError('That session no longer exists.');
        } else {
          setLoadError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }
    await bootstrap({ cancelled: false });
  }, [bootstrap, loadSession]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await client.deleteSession(sessionId);
        setSessions((prev) => prev.filter((session) => session.id !== sessionId));
        if (activeSessionIdRef.current === sessionId) {
          setState({});
          setActiveSessionId(null);
          activeSessionIdRef.current = null;
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [client],
  );

  const sendMessage = useCallback(
    async (text: string, attachments: PendingAttachment[] = []) => {
      const sid = activeSessionIdRef.current;
      const trimmed = text.trim();
      if (!sid || (!trimmed && attachments.length === 0)) {
        return;
      }

      const created = Date.now();
      const id = optimisticMessageId();

      setState((prev) => ({
        ...prev,
        [id]: buildOptimisticMessage(sid, id, created, trimmed, attachments),
      }));
      setStatus('submitted');
      setError(null);
      setLoadError(null);

      try {
        const parts: OpencodePartInput[] = [];
        if (trimmed) {
          parts.push({ type: 'text', text: trimmed });
        }
        parts.push(...(await buildFileParts(attachments)));
        await client.promptAsync(sid, parts, id, activeServer.model);
        setStatus('streaming');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    },
    [client, activeServer.model],
  );

  /**
   * Retry a failed assistant turn: undo back to the prompt that produced it,
   * then re-send that prompt. The revert keeps history clean instead of
   * stacking a duplicate user message on top of the empty error bubble.
   */
  const retryMessage = useCallback(
    async (messageID: string) => {
      const sid = activeSessionIdRef.current;
      if (!sid) {
        return;
      }
      const target = stateRef.current[messageID];
      if (!target || target.info.role !== 'assistant') {
        return;
      }
      const prompt = Object.values(stateRef.current)
        .filter(
          (record) =>
            record.info.role === 'user' && record.info.time.created < target.info.time.created,
        )
        .sort((a, b) => b.info.time.created - a.info.time.created)[0];
      if (!prompt) {
        return;
      }
      const parts = recordToInputParts(prompt);
      if (parts.length === 0) {
        return;
      }

      setError(null);
      setLoadError(null);
      try {
        await client.revertSession(sid, prompt.info.id);
        await loadSession(sid);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }

      const created = Date.now();
      const id = optimisticMessageId();
      const text = parts
        .filter(
          (part): part is Extract<OpencodePartInput, { type: 'text' }> => part.type === 'text',
        )
        .map((part) => part.text)
        .join('\n\n');
      setState((prev) => ({
        ...prev,
        [id]: buildOptimisticMessage(sid, id, created, text, []),
      }));
      setStatus('submitted');

      try {
        await client.promptAsync(sid, parts, id, activeServer.model);
        setStatus('streaming');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    },
    [client, loadSession, activeServer.model],
  );

  /**
   * Execute a slash command (`/name args`) via POST /session/:id/command.
   * The confirmed text is derived server-side from the command template; the
   * optimistic message shows the raw `/name args` until SSE reconciles it,
   * exactly like promptAsync.
   */
  const sendCommand = useCallback(
    async (command: string, args: string, attachments: PendingAttachment[] = []) => {
      const sid = activeSessionIdRef.current;
      if (!sid || !command) {
        return;
      }
      const text = `/${command}${args ? ` ${args}` : ''}`;

      const created = Date.now();
      const id = optimisticMessageId();

      setState((prev) => ({
        ...prev,
        [id]: buildOptimisticMessage(sid, id, created, text, attachments),
      }));
      setStatus('submitted');
      setError(null);
      setLoadError(null);

      try {
        const fileParts = await buildFileParts(attachments);
        const model = activeServer.model;
        await client.executeCommand(sid, {
          messageID: id,
          command,
          args,
          model: model ? `${model.providerID}/${model.modelID}` : undefined,
          parts: fileParts.length > 0 ? fileParts : undefined,
        });
        setStatus('streaming');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    },
    [client, activeServer.model],
  );

  /**
   * Fork the active session into a new session. With a message ID the fork
   * copies history up to that message; without one the whole session is
   * copied. The new session becomes the active session. Forking a large
   * session can take a while server-side, so callers should reflect
   * `isForking` in the UI.
   */
  const forkSession = useCallback(
    async (messageID?: string) => {
      const sid = activeSessionIdRef.current;
      if (!sid || forkingRef.current) {
        return null;
      }
      forkingRef.current = true;
      setForkTarget(messageID ?? FORK_WHOLE_SESSION);
      try {
        const session = await client.forkSession(sid, messageID);
        setSessions((prev) => sortSessions([session, ...prev]));
        await loadSession(session.id);
        setError(null);
        return session;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return null;
      } finally {
        forkingRef.current = false;
        setForkTarget(null);
      }
    },
    [client, loadSession],
  );

  const stop = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid) {
      return;
    }
    try {
      await client.abort(sid);
    } catch {
      // ignore abort failures
    }
    setStatus('ready');
  }, [client]);

  /**
   * Execute a shell command in the session (`!cmd`, TUI parity) via
   * POST /session/:id/shell. Optimistic display mirrors sendCommand; the
   * result streams back over SSE and the bash renderer shows it.
   */
  const sendShell = useCallback(
    async (command: string) => {
      const sid = activeSessionIdRef.current;
      const trimmed = command.trim();
      if (!sid || !trimmed) {
        return;
      }
      const agent =
        sessionsRef.current.find((session) => session.id === sid)?.agent || 'build';

      const created = Date.now();
      const id = optimisticMessageId();

      setState((prev) => ({
        ...prev,
        [id]: buildOptimisticMessage(sid, id, created, trimmed, []),
      }));
      setStatus('submitted');
      setError(null);
      setLoadError(null);

      try {
        const model = activeServer.model;
        await client.executeShell(sid, {
          messageID: id,
          agent,
          command: trimmed,
          model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
        });
        setStatus('streaming');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    },
    [client, activeServer.model],
  );

  /**
   * Submit answers to a pending `question` tool request. The paused run
   * resumes server-side; the pending marker clears on `question.replied`.
   * Throws on failure so the caller can show the error inline.
   */
  const answerQuestion = useCallback(
    async (requestID: string, answers: string[][]) => {
      await client.replyToQuestion(requestID, answers);
    },
    [client],
  );

  const pendingQuestions = useMemo(
    () => Object.values(pendingQuestionMap).filter((entry) => entry.sessionID === activeSessionId),
    [pendingQuestionMap, activeSessionId],
  );

  const pendingPermissions = useMemo(
    () =>
      Object.values(pendingPermissionMap).filter((entry) => entry.sessionID === activeSessionId),
    [pendingPermissionMap, activeSessionId],
  );

  /**
   * Reply to a pending tool permission request. Throws on failure so the
   * caller can show the error inline next to the buttons.
   */
  const replyToPermission = useCallback(
    async (requestID: string, reply: PermissionReply) => {
      await client.replyToPermission(requestID, reply);
    },
    [client],
  );

  /** Dismiss a pending `question` without answering; the run is cancelled. */
  const rejectQuestion = useCallback(
    async (requestID: string) => {
      await client.rejectQuestion(requestID);
    },
    [client],
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const trimmed = title.trim();
      if (!sessionId || !trimmed) {
        return;
      }
      try {
        const session = await client.renameSession(sessionId, trimmed);
        setSessions((prev) => sortSessions([session, ...prev.filter((s) => s.id !== session.id)]));
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [client],
  );

  /**
   * Undo back to (and including) a message, then reload the truncated
   * history. Redo restores it.
   */
  const revertSession = useCallback(
    async (messageID: string) => {
      const sid = activeSessionIdRef.current;
      if (!sid) {
        return;
      }
      try {
        await client.revertSession(sid, messageID);
        await loadSession(sid);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [client, loadSession],
  );

  const unrevertSession = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid) {
      return;
    }
    try {
      await client.unrevertSession(sid);
      await loadSession(sid);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [client, loadSession]);

  /** Delete a single message, optimistically dropping it from the view. */
  const deleteMessage = useCallback(
    async (messageID: string) => {
      const sid = activeSessionIdRef.current;
      if (!sid) {
        return;
      }
      try {
        await client.deleteMessage(sid, messageID);
        setState((prev) => {
          if (!(messageID in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[messageID];
          return next;
        });
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        try {
          await loadSession(sid);
        } catch {
          // resync is best-effort; the banner already shows the error
        }
      }
    },
    [client, loadSession],
  );

  const mergeSession = useCallback((session: OpencodeSession) => {
    setSessions((prev) => sortSessions([session, ...prev.filter((s) => s.id !== session.id)]));
  }, []);

  /**
   * Share (or unshare) the active session. Returns the updated session so
   * callers can read the share URL; null on failure (see the error banner).
   */
  const shareSession = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid) {
      return null;
    }
    try {
      const session = await client.shareSession(sid);
      mergeSession(session);
      setError(null);
      return session;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }, [client, mergeSession]);

  const unshareSession = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid) {
      return null;
    }
    try {
      const session = await client.unshareSession(sid);
      mergeSession(session);
      setError(null);
      return session;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }, [client, mergeSession]);

  /** Compact the session into a summary with the currently selected model. */
  const summarizeSession = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    const model = activeServer.model;
    if (!sid || !model) {
      return;
    }
    try {
      await client.summarizeSession(sid, {
        providerID: model.providerID,
        modelID: model.modelID,
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [client, activeServer.model]);

  /**
   * Stage a message composed while a run is in flight. It is sent
   * automatically, in order, once the session goes idle again.
   */
  const queueMessage = useCallback(
    (item: Omit<QueuedMessage, 'id' | 'sessionID'>) => {
      const sid = activeSessionIdRef.current;
      if (!sid) {
        return;
      }
      const entry: QueuedMessage = { ...item, id: queuedMessageId(), sessionID: sid };
      messageQueueRef.current = [...messageQueueRef.current, entry];
      setMessageQueue(messageQueueRef.current);
    },
    [],
  );

  const removeQueuedMessage = useCallback((id: string) => {
    messageQueueRef.current = messageQueueRef.current.filter((entry) => entry.id !== id);
    setMessageQueue(messageQueueRef.current);
  }, []);

  // Queued entries belong to the session they were composed in; switching
  // sessions drops them rather than risking a send to the wrong session.
  useEffect(() => {
    messageQueueRef.current = [];
    setMessageQueue([]);
  }, [activeSessionId]);

  // Flush the queue whenever the active session goes idle: each flush sends
  // one entry, which moves the status back out of ready until the run ends.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const sendCommandRef = useRef(sendCommand);
  sendCommandRef.current = sendCommand;
  const sendShellRef = useRef(sendShell);
  sendShellRef.current = sendShell;
  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    const sid = activeSessionIdRef.current;
    if (!sid) {
      return;
    }
    const next = messageQueueRef.current.find((entry) => entry.sessionID === sid);
    if (!next) {
      return;
    }
    messageQueueRef.current = messageQueueRef.current.filter((entry) => entry.id !== next.id);
    setMessageQueue(messageQueueRef.current);
    if (next.kind === 'command' && next.command) {
      void sendCommandRef.current(next.command, next.args ?? '', next.attachments);
    } else if (next.kind === 'shell' && next.command) {
      void sendShellRef.current(next.command);
    } else {
      void sendMessageRef.current(next.text, next.attachments);
    }
  }, [status, activeSessionId]);

  const messages = useMemo(() => deriveMessages(state), [state]);
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  return {
    messages,
    status,
    error,
    loadError,
    isLoading,
    isLoadingOlder,
    hasMoreOlder,
    forkTarget,
    isForking: forkTarget !== null,
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    selectSession,
    deleteSession,
    forkSession,
    refreshSessions,
    retryLoad,
    loadOlderMessages,
    sendMessage,
    retryMessage,
    sendCommand,
    sendShell,
    answerQuestion,
    rejectQuestion,
    pendingQuestions,
    pendingPermissions,
    replyToPermission,
    renameSession,
    revertSession,
    unrevertSession,
    deleteMessage,
    shareSession,
    unshareSession,
    summarizeSession,
    messageQueue,
    queueMessage,
    removeQueuedMessage,
    stop,
  };
}
