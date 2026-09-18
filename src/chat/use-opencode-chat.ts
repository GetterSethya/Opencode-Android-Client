import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type PendingAttachment } from './attachments';
import {
  buildFileParts,
  buildOptimisticMessage,
  buildState,
  deriveMessages,
  INITIAL_HISTORY_LIMIT,
  optimisticMessageId,
  queuedMessageId,
  recordToInputParts,
  sortSessions,
  type MessageState,
  type PendingPermission,
  type PendingQuestion,
  type QueuedMessage,
} from './chat-state';
import {
  OpencodeClient,
  type OpencodePartInput,
  type OpencodeSession,
  type PermissionReply,
} from './opencode';
import { useChatSettings } from './settings';
import { useChatEventSubscription } from './use-chat-events';
import { useSessionActions } from './use-session-actions';
import { createClientFromServer } from './use-opencode-providers';
import type { ChatStatus } from './types';

export { FORK_WHOLE_SESSION } from './chat-state';
export type { PendingPermission, PendingQuestion, QueuedMessage } from './chat-state';

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

  // Mirrors kept current during render so imperative callbacks (SSE handlers,
  // queued flush) read the latest values without being re-created per update.
  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = activeSessionId;

  const stateRef = useRef<MessageState>({});
  stateRef.current = state;

  const sessionsRef = useRef<OpencodeSession[]>([]);
  sessionsRef.current = sessions;

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
          // No title passed: the server assigns its default, which its
          // title agent renames after the first message. An explicit title
          // would stick forever.
          const session = await client.createSession();
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

  useChatEventSubscription({
    client,
    settingsReady,
    queryClient,
    loadSession,
    refreshPendingQuestions,
    activeSessionIdRef,
    sessionsRef,
    setStatus,
    setSessions,
    setState,
    setActiveSessionId,
    setPendingQuestionMap,
    setPendingPermissionMap,
  });

  const {
    loadOlderMessages,
    refreshSessions,
    createSession,
    selectSession,
    retryLoad,
    deleteSession,
    forkSession,
    renameSession,
    revertSession,
    unrevertSession,
    deleteMessage,
    shareSession,
    unshareSession,
    summarizeSession,
    closeProject,
  } = useSessionActions({
    client,
    activeServer,
    updateServer,
    loadSession,
    bootstrap,
    status,
    historyLimit,
    hasMoreOlder,
    isLoadingOlder,
    forkingRef,
    activeSessionIdRef,
    setState,
    setSessions,
    setActiveSessionId,
    setStatus,
    setError,
    setLoadError,
    setIsLoading,
    setHistoryLimit,
    setHasMoreOlder,
    setIsLoadingOlder,
    setForkTarget,
    setPendingQuestionMap,
    setPendingPermissionMap,
    messageQueueRef,
    setMessageQueue,
  });

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
    closeProject,
    messageQueue,
    queueMessage,
    removeQueuedMessage,
    stop,
  };
}
