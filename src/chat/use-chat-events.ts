import type { QueryClient } from '@tanstack/react-query';
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import EventSource from 'react-native-sse';

import { applyEvent, sortSessions, type MessageState } from './chat-state';
import {
  OpencodeClient,
  type OpencodeEvent,
  type OpencodePart,
  type OpencodeQuestion,
  type OpencodeSession,
} from './opencode';
import type { PendingPermission, PendingQuestion } from './chat-state';
import type { ChatStatus } from './types';

export type ChatEventSubscriptionOptions = {
  client: OpencodeClient;
  settingsReady: boolean;
  queryClient: QueryClient;
  loadSession: (sessionId: string) => Promise<void>;
  refreshPendingQuestions: () => Promise<void>;
  activeSessionIdRef: { current: string | null };
  sessionsRef: { current: OpencodeSession[] };
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setSessions: Dispatch<SetStateAction<OpencodeSession[]>>;
  setState: Dispatch<SetStateAction<MessageState>>;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  setPendingQuestionMap: Dispatch<SetStateAction<Record<string, PendingQuestion>>>;
  setPendingPermissionMap: Dispatch<SetStateAction<Record<string, PendingPermission>>>;
};

/**
 * Subscribes to the server's SSE stream (`/event`) for the active server.
 * Session/question/permission/message events update local state; the
 * subscription restarts whenever the server (client) changes.
 */
export function useChatEventSubscription({
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
}: ChatEventSubscriptionOptions) {
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
        parsed.type === 'message.part.delta' ||
        parsed.type === 'message.part.removed'
      ) {
        if (!sid) {
          return;
        }
        setState((prev) => applyEvent(prev, parsed, sid));
        if (parsed.type === 'message.part.updated' || parsed.type === 'message.part.delta') {
          const props = parsed.properties as { sessionID?: string; part?: OpencodePart };
          const eventSid = props.part?.sessionID ?? props.sessionID;
          if (eventSid === sid) {
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
}
