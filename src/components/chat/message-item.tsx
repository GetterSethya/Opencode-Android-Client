import {
  CheckIcon,
  CopyIcon,
  FileIcon,
  GitForkIcon,
  Trash2Icon,
} from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Clipboard, Image, Text, View } from 'react-native';

import type { PermissionReply } from '@/chat/opencode';
import type { ChatStatus, UIMessage } from '@/chat/types';
import type {
  PendingPermission,
  PendingQuestion,
} from '@/chat/use-opencode-chat';
import {
  BashTool,
  EditTool,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageText,
  MessageToolbar,
  PermissionCard,
  parseQuestionAnswers,
  parseQuestionInput,
  parseTodoInput,
  QuestionTool,
  ReadTool,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  TaskTool,
  TodoTool,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  WebfetchTool,
  WriteTool,
} from '@/components/ai-elements';
import {
  ErrorState,
  NotFoundState,
  ServerErrorState,
  classifyError,
} from '@/components/ui/error-state';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export const MessageItem = memo(function MessageItem({
  message,
  isLast,
  status,
  onFork,
  forkTarget,
  forkDisabled,
  pendingQuestions,
  onAnswerQuestion,
  onRejectQuestion,
  pendingPermissions,
  onReplyPermission,
  onDeleteMessage,
  onRetry,
}: {
  message: UIMessage;
  isLast: boolean;
  status: ChatStatus;
  onFork: (messageId: string) => void;
  forkTarget: string | null;
  forkDisabled: boolean;
  pendingQuestions: PendingQuestion[];
  onAnswerQuestion: (requestID: string, answers: string[][]) => Promise<void>;
  onRejectQuestion: (requestID: string) => Promise<void>;
  pendingPermissions: PendingPermission[];
  onReplyPermission: (requestID: string, reply: PermissionReply) => Promise<void>;
  onDeleteMessage: (messageId: string) => void;
  onRetry: (messageId: string) => void;
}) {
  const colors = useThemeColors();
  const isUser = message.role === 'user';
  const isStreaming = isLast && (status === 'streaming' || status === 'submitted');
  const [copied, setCopied] = useState(false);

  // LegendList recycles row components across messages, so transient local
  // state must be cleared when a row is reused for a different message.
  useEffect(() => {
    setCopied(false);
  }, [message.id]);

  const messageText = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');

  const copyResponse = () => {
    Clipboard.setString(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isForkingThis = forkTarget === message.id;
  const forkAction = (
    <MessageAction
      label="Fork session from here"
      onPress={() => onFork(message.id)}
      disabled={forkDisabled}
    >
      {isForkingThis ? (
        <Spinner size={14} color={colors.muted} />
      ) : (
        <GitForkIcon size={14} color={colors.muted} />
      )}
    </MessageAction>
  );

  return (
    <Message from={message.role}>
      <MessageContent
        className={
          isUser
            ? 'bg-surface-secondary'
            : 'w-full bg-transparent px-0 py-0'
        }
      >
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            return isUser ? (
              <MessageText key={index}>{part.text}</MessageText>
            ) : (
              <MessageResponse key={index}>{part.text}</MessageResponse>
            );
          }

          if (part.type === 'file') {
            const isImage = part.mediaType.startsWith('image/');
            return isImage ? (
              <Image
                key={index}
                source={{ uri: part.url }}
                style={{ width: 200, height: 200, borderRadius: 12 }}
                resizeMode="cover"
              />
            ) : (
              <View
                key={index}
                className="flex-row items-center gap-2 rounded-xl border border-border px-3 py-2"
              >
                <FileIcon size={16} color={colors.muted} />
                <Text className="text-sm text-foreground" numberOfLines={1}>
                  {part.filename ?? 'Attachment'}
                </Text>
              </View>
            );
          }

          if (part.type === 'reasoning') {
            return (
              <Reasoning key={index} isStreaming={isStreaming}>
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          }

          if (part.type.startsWith('tool-')) {
            const toolPart = part as Extract<
              UIMessage['parts'][number],
              { type: `tool-${string}` }
            >;
            // A paused run's permission request names the tool call it waits
            // on; the approval card renders under that tool part.
            const pendingPermission = pendingPermissions.find(
              (entry) => entry.callID && entry.callID === toolPart.toolCallId,
            );
            const permissionCard = pendingPermission ? (
              <PermissionCard
                permission={pendingPermission}
                resetKey={pendingPermission.requestID}
                onReply={(reply) =>
                  onReplyPermission(pendingPermission.requestID, reply)
                }
              />
            ) : null;
            // The question tool's input is a prompt for the user, not data to
            // dump as JSON, so it gets its own presentation (expanded by
            // default) showing the options and the chosen answer. While the
            // matching question request is pending the options are tappable
            // and the reply resumes the paused run.
            if (toolPart.toolName === 'question') {
              const pending = pendingQuestions.find(
                (entry) => entry.callID === toolPart.toolCallId,
              );
              const parsedQuestions = parseQuestionInput(toolPart.input);
              // The event's questions are authoritative; prefer them when the
              // streamed part input is empty or still partial.
              const questions = parsedQuestions.length
                ? parsedQuestions
                : (pending?.questions ?? []).map((question) => ({
                    header: question.header,
                    question: question.question,
                    options: question.options ?? [],
                    multiple: question.multiple,
                    custom: question.custom,
                  }));
              return (
                <Tool key={index} defaultOpen>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <QuestionTool
                      questions={questions}
                      onReject={
                        pending ? () => onRejectQuestion(pending.requestID) : undefined
                      }
                      answers={parseQuestionAnswers(toolPart.metadata)}
                      answered={toolPart.state === 'output-available'}
                      pending={!!pending}
                      resetKey={toolPart.toolCallId}
                      onAnswer={
                        pending
                          ? (answers) => onAnswerQuestion(pending.requestID, answers)
                          : undefined
                      }
                    />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            // The todo tool is a checklist; showing its JSON input/output is
            // noise, so render the items with their status instead.
            if (toolPart.toolName === 'todowrite') {
              return (
                <Tool key={index}>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <TodoTool todos={parseTodoInput(toolPart.input)} />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            // Subagent, fetch, file and shell tools get purpose-built rows
            // instead of a raw JSON parameter dump.
            if (toolPart.toolName === 'task') {
              return (
                <Tool key={index}>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <TaskTool
                      input={toolPart.input}
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                      state={toolPart.state}
                    />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            if (toolPart.toolName === 'webfetch') {
              return (
                <Tool key={index}>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <WebfetchTool
                      input={toolPart.input}
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                      state={toolPart.state}
                    />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            if (toolPart.toolName === 'read') {
              return (
                <Tool key={index}>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <ReadTool
                      input={toolPart.input}
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                      state={toolPart.state}
                    />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            if (toolPart.toolName === 'write') {
              return (
                <Tool key={index}>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <WriteTool
                      input={toolPart.input}
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                      state={toolPart.state}
                    />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            if (toolPart.toolName === 'bash') {
              return (
                <Tool key={index}>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <BashTool
                      input={toolPart.input}
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                      state={toolPart.state}
                    />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            if (toolPart.toolName === 'edit') {
              return (
                <Tool key={index}>
                  <ToolHeader
                    title={toolPart.title}
                    toolName={toolPart.toolName}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <EditTool
                      input={toolPart.input}
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                      state={toolPart.state}
                    />
                    {permissionCard}
                  </ToolContent>
                </Tool>
              );
            }
            return (
              <Tool key={index}>
                <ToolHeader
                  title={toolPart.title}
                  toolName={toolPart.toolName}
                  state={toolPart.state}
                />
                <ToolContent>
                  <ToolInput input={toolPart.input} />
                  <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
                                    {permissionCard}
</ToolContent>
              </Tool>
            );
          }

          return null;
        })}

        {message.error ? (
          <View className="pt-2">
            <ErrorState
              compact
              kind={
                message.error.statusCode && message.error.statusCode >= 500
                  ? 'server'
                  : 'unknown'
              }
              title={
                message.error.statusCode
                  ? `Request failed (${message.error.statusCode})`
                  : 'Request failed'
              }
              message={message.error.message ?? message.error.name}
              retryLabel="Retry"
              onRetry={() => onRetry(message.id)}
            />
          </View>
        ) : null}
      </MessageContent>

      {!isUser ? (
        <MessageToolbar>
          <View className="flex-row items-center gap-2">
            {message.model ? (
              <Text className="text-xs text-muted" numberOfLines={1}>
                {message.model}
              </Text>
            ) : null}
            {message.durationMs ? (
              <Text className="text-xs text-muted">· {formatDuration(message.durationMs)}</Text>
            ) : null}
          </View>
          <MessageActions>
            {messageText.length > 0 ? (
              <MessageAction label="Copy response" onPress={copyResponse}>
                {copied ? (
                  <CheckIcon size={14} color={colors.success} />
                ) : (
                  <CopyIcon size={14} color={colors.muted} />
                )}
              </MessageAction>
            ) : null}
            {forkAction}
          </MessageActions>
        </MessageToolbar>
      ) : null}
      {isUser ? (
        <MessageToolbar>
          <View className="flex-1" />
          <MessageActions>
            {messageText.length > 0 ? (
              <MessageAction label="Copy message" onPress={copyResponse}>
                {copied ? (
                  <CheckIcon size={14} color={colors.success} />
                ) : (
                  <CopyIcon size={14} color={colors.muted} />
                )}
              </MessageAction>
            ) : null}
            <MessageAction label="Delete message" onPress={() => onDeleteMessage(message.id)}>
              <Trash2Icon size={14} color={colors.muted} />
            </MessageAction>
            {forkAction}
          </MessageActions>
        </MessageToolbar>
      ) : null}
    </Message>
  );
});

/**
 * Full-screen 404/500 for view-fatal load failures (initial bootstrap or
 * session select with nothing to show). Transient failures keep the inline
 * banner below the conversation instead.
 */
export function ConversationLoadError({
  loadError,
  onRetry,
  onOpenSessions,
}: {
  loadError: string;
  onRetry: () => void;
  onOpenSessions: () => void;
}) {
  const kind = classifyError(loadError);

  if (kind === 'not-found') {
    return (
      <NotFoundState
        title="Session not found"
        message="It may have been deleted."
        onRetry={onRetry}
        secondaryLabel="Open sessions"
        onSecondary={onOpenSessions}
      />
    );
  }

  return (
    <ServerErrorState
      kind={kind === 'network' ? 'network' : 'server'}
      title={kind === 'network' ? undefined : 'Could not load session'}
      message={kind === 'network' ? undefined : loadError}
      onRetry={onRetry}
      secondaryLabel="Open sessions"
      onSecondary={onOpenSessions}
    />
  );
}
