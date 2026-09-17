import { toFilePart, type PendingAttachment } from './attachments';
import type {
  OpencodeEvent,
  OpencodeMessage,
  OpencodeMessageInfo,
  OpencodePart,
  OpencodePartInput,
  OpencodeQuestion,
  OpencodeSession,
  OpencodeToolState,
} from './opencode';
import type { ToolState, UIMessage, UIMessagePart } from './types';

export type MessageRecord = {
  info: OpencodeMessageInfo;
  parts: Record<string, OpencodePart>;
};

export type MessageState = Record<string, MessageRecord>;

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
    default:
      return null;
  }
}

export function buildState(messages: OpencodeMessage[]): MessageState {
  const next: MessageState = {};
  for (const message of messages) {
    next[message.info.id] = {
      info: message.info,
      parts: Object.fromEntries(message.parts.map((part) => [part.id, part])),
    };
  }
  return next;
}

export function optimisticMessageId() {
  return `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function buildOptimisticMessage(
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

export async function buildFileParts(attachments: PendingAttachment[]): Promise<OpencodePartInput[]> {
  const parts: OpencodePartInput[] = [];
  for (const attachment of attachments) {
    parts.push(await toFilePart(attachment));
  }
  return parts;
}

/** Rebuilds sendable prompt parts from a stored user message (for retry). */
export function recordToInputParts(record: MessageRecord): OpencodePartInput[] {
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

export function applyEvent(state: MessageState, event: OpencodeEvent, sessionId: string): MessageState {
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
      const currentPart = parts[part.id];
      if (
        (part.type === 'text' || part.type === 'reasoning') &&
        !part.text &&
        currentPart &&
        (currentPart.type === 'text' || currentPart.type === 'reasoning') &&
        currentPart.text
      ) {
        parts[part.id] = { ...part, text: currentPart.text };
      } else {
        parts[part.id] = part;
      }
      return { ...state, [part.messageID]: { ...existing, parts } };
    }
    case 'message.part.delta': {
      const { sessionID, messageID, partID, field, delta } = event.properties as {
        sessionID: string;
        messageID: string;
        partID: string;
        field: string;
        delta: string;
      };
      if (sessionID !== sessionId || !delta) {
        return state;
      }
      const existing = state[messageID] ?? {
        info: {
          id: messageID,
          sessionID: sessionId,
          role: 'assistant' as const,
          time: { created: Date.now() },
        },
        parts: {},
      };
      const existingPart = existing.parts[partID];
      let updatedPart: OpencodePart;
      if (existingPart && (existingPart.type === 'text' || existingPart.type === 'reasoning')) {
        const text = (existingPart.text || '') + delta;
        updatedPart = { ...existingPart, text };
      } else if (field === 'reasoning') {
        updatedPart = {
          id: partID,
          sessionID,
          messageID,
          type: 'reasoning',
          text: delta,
        };
      } else {
        updatedPart = {
          id: partID,
          sessionID,
          messageID,
          type: 'text',
          text: delta,
        };
      }
      const parts = { ...existing.parts, [partID]: updatedPart };
      return { ...state, [messageID]: { ...existing, parts } };
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

const messageCache = new WeakMap<MessageRecord, UIMessage>();

export function deriveMessages(state: MessageState): UIMessage[] {
  return Object.values(state)
    .sort((a, b) => a.info.time.created - b.info.time.created)
    .map((record) => {
      const cached = messageCache.get(record);
      if (cached) {
        return cached;
      }
      const { info } = record;
      const durationMs =
        info.role === 'assistant' && info.time.completed
          ? info.time.completed - info.time.created
          : undefined;
      const derived: UIMessage = {
        id: info.id,
        role: info.role,
        model: info.modelID,
        durationMs,
        error: toMessageError(info.error),
        parts: Object.values(record.parts)
          .map(partToUI)
          .filter((part): part is UIMessagePart => part !== null),
      };
      messageCache.set(record, derived);
      return derived;
    })
    .filter((message) => message.parts.length > 0 || message.error !== undefined);
}

export function sortSessions(sessions: OpencodeSession[]) {
  return [...sessions].sort((a, b) => b.time.updated - a.time.updated);
}

/**
 * Pagination sizes. Long histories are expensive to fetch and derive in one
 * go, so the newest page loads first and older pages are pulled in on scroll,
 * with a spinner shown while a page is in flight.
 */
export const INITIAL_HISTORY_LIMIT = 60;
export const MESSAGE_PAGE_SIZE = 60;

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

export function queuedMessageId() {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
