import { useQueryClient } from '@tanstack/react-query';
import { useCallback, type Dispatch, type SetStateAction } from 'react';

import {
  buildState,
  FORK_WHOLE_SESSION,
  MESSAGE_PAGE_SIZE,
  sortSessions,
  type MessageState,
  type PendingPermission,
  type PendingQuestion,
  type QueuedMessage,
} from './chat-state';
import {
  isSessionNotFoundError,
  OpencodeClient,
  type OpencodeSession,
} from './opencode';
import { useChatSettings, type ServerConfig } from './settings';
import { createClientFromServer } from './use-opencode-providers';
import type { ChatStatus } from './types';

type UpdateServer = ReturnType<typeof useChatSettings>['updateServer'];

export type SessionActionsOptions = {
  client: OpencodeClient;
  activeServer: ServerConfig;
  updateServer: UpdateServer;
  loadSession: (sessionId: string) => Promise<void>;
  bootstrap: (cancelledRef: { cancelled: boolean }) => Promise<void>;
  status: ChatStatus;
  historyLimit: number;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  forkingRef: { current: boolean };
  activeSessionIdRef: { current: string | null };
  setState: Dispatch<SetStateAction<MessageState>>;
  setSessions: Dispatch<SetStateAction<OpencodeSession[]>>;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setHistoryLimit: Dispatch<SetStateAction<number>>;
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>;
  setIsLoadingOlder: Dispatch<SetStateAction<boolean>>;
  setForkTarget: Dispatch<SetStateAction<string | null>>;
  setPendingQuestionMap?: Dispatch<SetStateAction<Record<string, PendingQuestion>>>;
  setPendingPermissionMap?: Dispatch<SetStateAction<Record<string, PendingPermission>>>;
  messageQueueRef?: { current: QueuedMessage[] };
  setMessageQueue?: Dispatch<SetStateAction<QueuedMessage[]>>;
};

/**
 * Session lifecycle and history actions: creating/selecting/deleting
 * sessions, paging older messages, fork/share/rename/revert and friends.
 * Pure code motion out of `useOpencodeChat` so that hook stays readable;
 * behavior is unchanged.
 */
export function useSessionActions({
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
}: SessionActionsOptions) {
  const queryClient = useQueryClient();
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
   *
   * No explicit title is passed: the server assigns its default
   * ("New session - <timestamp>"), which is what its title agent looks for
   * when auto-renaming after the first message. An explicit title would
   * stick forever.
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
        const session = await targetClient.createSession();
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
        // Filter first: the server's session.created event can arrive before
        // this POST resolves, in which case the session is already listed.
        // Without this the same id renders twice (duplicate React keys).
        setSessions((prev) => sortSessions([session, ...prev.filter((s) => s.id !== session.id)]));
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
        // Filter first: the server's session.created event can arrive before
        // this POST resolves, in which case the session is already listed.
        setSessions((prev) => sortSessions([session, ...prev.filter((s) => s.id !== session.id)]));
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
  }, [client, activeServer.model, activeSessionIdRef, setError]);

  /**
   * Closes the active project folder: aborts any running prompt, disposes
   * the server instance, clears project caches and in-flight chat state, and
   * resets the directory back to the server default (or re-bootstraps if
   * already default).
   */
  const closeProject = useCallback(async (directory?: string) => {
    const targetDir = directory ?? activeServer.directory;
    const sid = activeSessionIdRef.current;
    if (sid && (status === 'submitted' || status === 'streaming')) {
      try {
        await client.abort(sid);
      } catch {
        // Best effort
      }
    }
    if (targetDir) {
      try {
        await client.disposeInstance(targetDir);
      } catch {
        // Best effort
      }
    }
    setState({});
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setPendingQuestionMap?.({});
    setPendingPermissionMap?.({});
    if (messageQueueRef) {
      messageQueueRef.current = [];
    }
    setMessageQueue?.([]);
    setSessions([]);
    setError(null);
    setLoadError(null);
    setStatus('ready');

    queryClient.removeQueries({ queryKey: ['files'] });
    queryClient.removeQueries({ queryKey: ['vcs-status'] });
    queryClient.removeQueries({ queryKey: ['vcs-diff'] });
    queryClient.removeQueries({ queryKey: ['file-search'] });
    queryClient.removeQueries({ queryKey: ['commands'] });
    queryClient.removeQueries({ queryKey: ['session-children'] });
    queryClient.removeQueries({ queryKey: ['pty'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });

    if (activeServer.directory) {
      updateServer(activeServer.id, { directory: '' });
    } else {
      await bootstrap({ cancelled: false });
    }
  }, [
    activeServer.directory,
    activeServer.id,
    bootstrap,
    client,
    queryClient,
    setActiveSessionId,
    setError,
    setLoadError,
    setMessageQueue,
    setPendingPermissionMap,
    setPendingQuestionMap,
    setSessions,
    setState,
    setStatus,
    status,
    updateServer,
    activeSessionIdRef,
    messageQueueRef,
  ]);

  return {
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
  };
}
