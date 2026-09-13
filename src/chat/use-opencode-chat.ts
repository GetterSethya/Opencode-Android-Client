import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EventSource from 'react-native-sse';

import { toFilePart, type PendingAttachment } from './attachments';
import {
  OpencodeClient,
  type OpencodeEvent,
  type OpencodeMessage,
  type OpencodeMessageInfo,
  type OpencodePart,
  type OpencodePartInput,
  type OpencodeSession,
  type OpencodeToolState,
} from './opencode';
import { useChatSettings } from './settings';
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
        parts: Object.values(record.parts)
          .map(partToUI)
          .filter((part): part is UIMessagePart => part !== null),
      };
    });
}

function sortSessions(sessions: OpencodeSession[]) {
  return [...sessions].sort((a, b) => b.time.updated - a.time.updated);
}

const INITIAL_MESSAGE_LIMIT = 10;
const MESSAGE_PAGE_SIZE = 10;

const INITIAL_HISTORY_LIMIT = 10;
const HISTORY_PAGE_SIZE = 10;
const MAX_HISTORY_LIMIT = 200;

export function useOpencodeChat() {
  const { activeServer, ready: settingsReady } = useChatSettings();
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
  const [isLoading, setIsLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(INITIAL_HISTORY_LIMIT);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      const history = await client.listMessages(sessionId, INITIAL_HISTORY_LIMIT);
      setState(buildState(history));
      setActiveSessionId(sessionId);
      setHistoryLimit(INITIAL_HISTORY_LIMIT);
      setHasMoreOlder(history.length >= INITIAL_HISTORY_LIMIT);
    },
    [client],
  );

  useEffect(() => {
    if (!settingsReady) {
      return;
    }

    let cancelled = false;

    (async () => {
      setError(null);
      setStatus('ready');
      setState({});
      setActiveSessionId(null);
      activeSessionIdRef.current = null;
      setHistoryLimit(INITIAL_HISTORY_LIMIT);
      setHasMoreOlder(false);
      setIsLoading(true);

      try {
        const list = await client.listSessions();
        if (cancelled) {
          return;
        }
        const sorted = sortSessions(list);
        setSessions(sorted);

        if (sorted.length > 0) {
          const history = await client.listMessages(sorted[0].id, INITIAL_HISTORY_LIMIT);
          if (cancelled) {
            return;
          }
          setState(buildState(history));
          setActiveSessionId(sorted[0].id);
          activeSessionIdRef.current = sorted[0].id;
          setHasMoreOlder(history.length >= INITIAL_HISTORY_LIMIT);
        } else {
          const session = await client.createSession('opencode mobile');
          if (cancelled) {
            return;
          }
          setSessions([session]);
          setActiveSessionId(session.id);
          activeSessionIdRef.current = session.id;
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, settingsReady]);

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

      if (parsed.type === 'session.updated' || parsed.type === 'session.created') {
        const info = (parsed.properties as { info?: OpencodeSession }).info;
        if (info?.id) {
          setSessions((prev) => {
            const others = prev.filter((session) => session.id !== info.id);
            return sortSessions([info, ...others]);
          });
        }
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

    eventSource.addEventListener('error', () => {
      // react-native-sse reconnects automatically.
    });

    return () => {
      eventSource.close();
    };
  }, [client, settingsReady]);

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

  const createSession = useCallback(async () => {
    try {
      const session = await client.createSession('New session');
      setSessions((prev) => sortSessions([session, ...prev]));
      setState({});
      setActiveSessionId(session.id);
      activeSessionIdRef.current = session.id;
      setHistoryLimit(INITIAL_HISTORY_LIMIT);
      setHasMoreOlder(false);
      setStatus('ready');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [client]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current) {
        return;
      }
      setIsLoading(true);
      setError(null);
      setStatus('ready');
      try {
        await loadSession(sessionId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setIsLoading(false);
      }
    },
    [loadSession],
  );

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
      const id = `msg_${created.toString(36)}${Math.random().toString(36).slice(2, 8)}`;

      const optimisticParts: MessageRecord['parts'] = {};
      if (trimmed) {
        optimisticParts[`optimistic-${id}-text`] = {
          id: `optimistic-${id}-text`,
          sessionID: sid,
          messageID: id,
          type: 'text',
          text: trimmed,
        };
      }
      for (const attachment of attachments) {
        optimisticParts[`optimistic-${id}-${attachment.id}`] = {
          id: `optimistic-${id}-${attachment.id}`,
          sessionID: sid,
          messageID: id,
          type: 'file',
          mime: attachment.mime,
          filename: attachment.name,
          url: attachment.uri,
        };
      }

      setState((prev) => ({
        ...prev,
        [id]: {
          info: { id, sessionID: sid, role: 'user', time: { created } },
          parts: optimisticParts,
        },
      }));
      setStatus('submitted');
      setError(null);

      try {
        const parts: OpencodePartInput[] = [];
        if (trimmed) {
          parts.push({ type: 'text', text: trimmed });
        }
        for (const attachment of attachments) {
          parts.push(await toFilePart(attachment));
        }
        await client.promptAsync(sid, parts, id, activeServer.model);
        setStatus('streaming');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    },
    [client, activeServer.model],
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

  const messages = useMemo(() => deriveMessages(state), [state]);
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  return {
    messages,
    status,
    error,
    isLoading,
    isLoadingOlder,
    hasMoreOlder,
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    selectSession,
    deleteSession,
    refreshSessions,
    loadOlderMessages,
    sendMessage,
    stop,
  };
}
