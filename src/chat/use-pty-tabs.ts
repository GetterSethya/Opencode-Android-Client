import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { classifyError } from '@/components/ui/error-state';

import type { PtyInfo } from './opencode';
import type { ServerConfig } from './settings';
import {
  appendCapped,
  blobToArrayBuffer,
  parseCursorFrame,
  parseCursorText,
  sanitizeTerminalChunk,
} from './terminal-text';
import { createClientFromServer } from './use-opencode-providers';

export type PtyTabStatus = 'connecting' | 'open' | 'reconnecting' | 'exited' | 'error';

export type PtyTab = {
  id: string;
  title: string;
  exited: boolean;
  status: PtyTabStatus;
  error?: string;
};

type PtyBuffer = {
  text: string;
  cursor: number;
};

const SCROLLBACK_LIMIT = 64 * 1024;
const DEFAULT_SIZE = { cols: 80, rows: 24 };
const MAX_RECONNECT_TRIES = 10;

function ptyKey(server: ServerConfig): (string | undefined)[] {
  return ['pty', server.serverUrl, server.username, server.password, server.directory ?? ''];
}

/**
 * Tabs + live I/O for the lightweight PTY terminal. The tab roster comes
 * from the server (only running sessions are listed); exited sessions are
 * tracked locally so they can show a restart affordance.
 *
 * Only the active tab holds a WebSocket. Background tabs miss nothing: the
 * server retains output and replays from the saved cursor on re-attach.
 */
export function usePtyTerminal({
  server,
  enabled,
}: {
  server: ServerConfig;
  enabled: boolean;
}) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  const queryClient = useQueryClient();

  const [requestedActiveId, setRequestedActiveId] = useState<string | null>(null);
  const [exited, setExited] = useState<{ id: string; title: string }[]>([]);
  const [buffers, setBuffers] = useState<Record<string, PtyBuffer>>({});
  const [liveStatus, setLiveStatus] = useState<PtyTabStatus>('connecting');
  const [liveError, setLiveError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** Bumped by retry to re-run the socket effect after giving up. */
  const [attempt, setAttempt] = useState(0);

  const buffersRef = useRef<Record<string, PtyBuffer>>({});
  const titlesRef = useRef<Record<string, string>>({});
  const freshRef = useRef<Set<string>>(new Set());
  /** IDs the server list has contained at least once. */
  const confirmedRef = useRef<Set<string>>(new Set());
  const sizedRef = useRef<Set<string>>(new Set());
  const removedRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const generationRef = useRef(0);
  const flushScheduledRef = useRef(false);
  const pendingRef = useRef<Record<string, { text: string; cursorDelta: number }>>({});

  const listQuery = useQuery({
    queryKey: ptyKey(server),
    queryFn: () => client.listPtys(),
    enabled,
    staleTime: 0,
    retry: 1,
  });
  const running = useMemo(
    () => (listQuery.data ?? []).filter((info) => !removedRef.current.has(info.id)),
    [listQuery.data],
  );

  for (const info of running) {
    titlesRef.current[info.id] = info.title;
  }

  // Tabs the server no longer lists went away while we looked elsewhere
  // (exited, or killed from another client): keep them as exited chips.
  // Freshly created tabs are exempt until the list confirms them once, so a
  // slow first refetch never mistakes them for gone.
  const exitedIds = useMemo(() => new Set(exited.map((tab) => tab.id)), [exited]);
  useEffect(() => {
    if (!listQuery.data) {
      return;
    }
    for (const info of listQuery.data) {
      confirmedRef.current.add(info.id);
    }
    const live = new Set(listQuery.data.map((info) => info.id));
    const known = [
      ...Object.keys(buffersRef.current),
      ...[...freshRef.current].filter((id) => confirmedRef.current.has(id)),
    ];
    const gone = known.filter(
      (id, index) =>
        known.indexOf(id) === index &&
        !live.has(id) &&
        !removedRef.current.has(id) &&
        !exitedIds.has(id),
    );
    if (gone.length === 0) {
      return;
    }
    setExited((prev) => {
      const have = new Set(prev.map((tab) => tab.id));
      const add = gone
        .filter((id) => !have.has(id))
        .map((id) => ({ id, title: titlesRef.current[id] ?? 'Terminal' }));
      return add.length > 0 ? [...prev, ...add] : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data]);

  // The last explicit selection stays active while it still exists; otherwise
  // fall back to the first running (then exited) tab.
  const activeId =
    requestedActiveId &&
    (running.some((info) => info.id === requestedActiveId) || exitedIds.has(requestedActiveId))
      ? requestedActiveId
      : (running[0]?.id ?? exited[0]?.id ?? null);

  const flushPending = useCallback(() => {
    flushScheduledRef.current = false;
    const pending = pendingRef.current;
    pendingRef.current = {};
    const ids = Object.keys(pending);
    if (ids.length === 0) {
      return;
    }
    setBuffers((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const item = pending[id];
        const current = next[id] ?? { text: '', cursor: 0 };
        next[id] = {
          text: appendCapped(current.text, item.text, SCROLLBACK_LIMIT),
          cursor: current.cursor + item.cursorDelta,
        };
      }
      return next;
    });
  }, []);

  const pushOutput = useCallback(
    (id: string, raw: string) => {
      if (!raw) {
        return;
      }
      const clean = sanitizeTerminalChunk(raw);
      const entry = pendingRef.current[id] ?? { text: '', cursorDelta: 0 };
      entry.text += clean;
      // The cursor counts raw output length server-side, pre-sanitize.
      entry.cursorDelta += raw.length;
      pendingRef.current[id] = entry;
      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        queueMicrotask(flushPending);
      }
    },
    [flushPending],
  );

  const setCursor = useCallback((id: string, cursor: number) => {
    setBuffers((prev) => {
      const current = prev[id] ?? { text: '', cursor: 0 };
      if (current.cursor === cursor) {
        return prev;
      }
      return { ...prev, [id]: { ...current, cursor } };
    });
  }, []);

  // Kept current during render so the socket effect can read the latest
  // buffers without reconnecting on every output chunk.
  buffersRef.current = buffers;

  const activeRunning = running.find((info) => info.id === activeId) ?? null;
  const activeExited = exited.find((tab) => tab.id === activeId) ?? null;

  // One socket for the active tab. Reconnects resume from the saved cursor
  // so only missed output replays; adopted tabs start live (cursor -1).
  useEffect(() => {
    if (!enabled || !activeRunning) {
      return;
    }
    const tabId = activeRunning.id;
    const gen = ++generationRef.current;
    let socket: WebSocket | null = null;
    let tries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const isCurrent = () => generationRef.current === gen && !closed;

    const open = async () => {
      if (!isCurrent()) {
        return;
      }
      setLiveStatus(tries === 0 ? 'connecting' : 'reconnecting');
      setLiveError(undefined);
      let ticket: string | undefined;
      try {
        ticket = (await client.createPtyConnectToken(tabId))?.ticket;
      } catch {
        ticket = undefined;
      }
      if (!isCurrent()) {
        return;
      }
      const saved = buffersRef.current[tabId];
      const cursor = saved ? saved.cursor : freshRef.current.has(tabId) ? 0 : -1;
      socket = new WebSocket(client.ptyConnectUrl(tabId, { cursor, ticket }));
      socketRef.current = socket;
      try {
        (socket as unknown as { binaryType?: string }).binaryType = 'arraybuffer';
      } catch {
        // Older runtimes ignore binaryType; frames may arrive as strings.
      }

      socket.onopen = () => {
        if (!isCurrent() || socketRef.current !== socket) {
          return;
        }
        tries = 0;
        setLiveStatus('open');
        if (!sizedRef.current.has(tabId)) {
          sizedRef.current.add(tabId);
          client.updatePty(tabId, { size: DEFAULT_SIZE }).catch(() => {
            // Cosmetic only; output still flows at the server default size.
          });
        }
      };

      socket.onmessage = (event: { data?: unknown }) => {
        if (!isCurrent()) {
          return;
        }
        const data = event.data;
        if (typeof data === 'string') {
          const cursorValue = parseCursorText(data);
          if (cursorValue !== undefined) {
            setCursor(tabId, cursorValue);
            return;
          }
          pushOutput(tabId, data);
          return;
        }
        if (data instanceof ArrayBuffer) {
          const cursorValue = parseCursorFrame(data);
          if (cursorValue !== undefined) {
            setCursor(tabId, cursorValue);
          }
          return;
        }
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
          void blobToArrayBuffer(data).then((buffer) => {
            if (isCurrent()) {
              const cursorValue = parseCursorFrame(buffer);
              if (cursorValue !== undefined) {
                setCursor(tabId, cursorValue);
              }
            }
          });
        }
      };

      socket.onerror = () => {
        // Errors are otherwise silent on RN; the close handler decides.
      };

      socket.onclose = (event: { code?: number }) => {
        if (!isCurrent() || socketRef.current !== socket) {
          return;
        }
        socketRef.current = null;
        if (removedRef.current.has(tabId)) {
          return;
        }
        if (event.code === 1000) {
          setLiveStatus('exited');
          setExited((prev) =>
            prev.some((tab) => tab.id === tabId)
              ? prev
              : [...prev, { id: tabId, title: titlesRef.current[tabId] ?? 'Terminal' }],
          );
          void queryClient.invalidateQueries({ queryKey: ptyKey(server) });
          return;
        }
        if (tries >= MAX_RECONNECT_TRIES) {
          setLiveStatus('error');
          setLiveError('Connection lost. The server may be unreachable.');
          return;
        }
        setLiveStatus('reconnecting');
        const delay = Math.min(250 * 2 ** Math.min(tries, 4), 4000);
        tries += 1;
        retryTimer = setTimeout(open, delay);
      };
    };

    void open();

    return () => {
      closed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      generationRef.current += 1;
      if (socketRef.current) {
        try {
          socketRef.current.close(1000);
        } catch {
          // Already gone.
        }
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeRunning?.id, attempt, client]);

  const send = useCallback((data: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !data) {
      return false;
    }
    socket.send(data);
    return true;
  }, []);

  /** Submit a line to the active tab; `clear` also wipes local scrollback. */
  const submit = useCallback(
    (line: string) => {
      if (!activeRunning) {
        return false;
      }
      if (line.trim() === 'clear' || line.trim() === 'reset') {
        setBuffers((prev) => ({
          ...prev,
          [activeRunning.id]: { text: '', cursor: prev[activeRunning.id]?.cursor ?? 0 },
        }));
      }
      return send(`${line}\n`);
    },
    [activeRunning, send],
  );

  const createTab = useCallback(async () => {
    setBusy(true);
    try {
      const info = await client.createPty({});
      removedRef.current.delete(info.id);
      freshRef.current.add(info.id);
      confirmedRef.current.add(info.id);
      titlesRef.current[info.id] = info.title;
      queryClient.setQueryData<PtyInfo[]>(ptyKey(server), (prev) => [
        ...(prev?.filter((p) => p.id !== info.id) ?? []),
        info,
      ]);
      setRequestedActiveId(info.id);
      setLiveStatus('connecting');
      void listQuery.refetch();
      return info.id;
    } finally {
      setBusy(false);
    }
  }, [client, listQuery, queryClient, server]);

  const removeTab = useCallback(
    async (id: string) => {
      removedRef.current.add(id);
      freshRef.current.delete(id);
      confirmedRef.current.delete(id);
      sizedRef.current.delete(id);

      const wasActive = activeId === id;
      if (wasActive) {
        generationRef.current += 1;
        if (socketRef.current) {
          try {
            socketRef.current.close(1000);
          } catch {
            // Already gone.
          }
          socketRef.current = null;
        }
        setLiveStatus('connecting');
        setLiveError(undefined);
      }

      queryClient.setQueryData<PtyInfo[]>(ptyKey(server), (prev) =>
        prev ? prev.filter((info) => info.id !== id) : [],
      );
      setExited((prev) => prev.filter((tab) => tab.id !== id));
      setBuffers((prev) => {
        if (!(id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRequestedActiveId((prev) => (prev === id ? null : prev));

      try {
        await client.removePty(id);
      } catch {
        // Already gone server-side (exited sessions vanish on their own).
      }

      void listQuery.refetch();
    },
    [activeId, client, listQuery, queryClient, server],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ptyKey(server) });
  }, [queryClient, server]);

  /** Re-run the socket effect after an error gave up reconnecting. */
  const retry = useCallback(() => {
    setLiveError(undefined);
    setLiveStatus('connecting');
    refresh();
    setAttempt((value) => value + 1);
  }, [refresh]);

  const tabs: PtyTab[] = useMemo(() => {
    const live = new Map(running.map((info) => [info.id, info]));
    const ordered: PtyTab[] = [];
    for (const info of running) {
      if (removedRef.current.has(info.id)) {
        continue;
      }
      ordered.push({
        id: info.id,
        title: info.title,
        exited: false,
        status: info.id === activeRunning?.id ? liveStatus : 'open',
        error: info.id === activeRunning?.id ? liveError : undefined,
      });
    }
    for (const tab of exited) {
      if (!live.has(tab.id) && !removedRef.current.has(tab.id)) {
        ordered.push({ ...tab, exited: true, status: 'exited' });
      }
    }
    return ordered;
  }, [running, exited, activeRunning, liveStatus, liveError]);

  const active = tabs.find((tab) => tab.id === activeId) ?? null;
  const activeBuffer = (activeId ? buffers[activeId] : undefined) ?? { text: '', cursor: 0 };
  const unsupported =
    classifyError(listQuery.error) === 'not-found' ? (listQuery.error as Error) : null;

  return {
    tabs,
    active,
    activeId,
    selectTab: setRequestedActiveId,
    activeText: activeBuffer.text,
    canSend: !!activeRunning && liveStatus === 'open',
    creating: busy,
    listState: {
      isLoading: listQuery.isLoading,
      error: unsupported ? null : listQuery.error,
      unsupported,
      refetch: refresh,
    },
    send,
    submit,
    createTab,
    removeTab,
    refresh,
    retry,
  };
}
