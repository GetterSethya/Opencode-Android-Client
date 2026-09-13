import { CheckIcon, CopyIcon, EllipsisVerticalIcon, FileIcon } from 'lucide-react-native';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Clipboard, Image, Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pickDocuments, pickImages, type PendingAttachment } from '@/chat/attachments';
import { useChatSettings } from '@/chat/settings';
import type { ChatStatus, UIMessage } from '@/chat/types';
import { useOpencodeChat } from '@/chat/use-opencode-chat';
import { useProviderCatalog } from '@/chat/use-opencode-provider-management';
import {
  Conversation,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageText,
  MessageToolbar,
  PromptInput,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  Suggestion,
  Suggestions,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements';
import { HamburgerButton, SessionsDrawer, type SessionsDrawerHandle } from '@/components/chat/sessions-drawer';
import { ModelPicker } from '@/components/chat/model-picker';
import { ProvidersSheet } from '@/components/chat/providers-sheet';
import { FullScreenFileViewer } from '@/components/chat/file-panel';
import { FullScreenDiffViewer } from '@/components/chat/review-panel';
import {
  SessionMenuSheet,
  SessionPanelSheet,
  useSessionPanels,
} from '@/components/chat/session-panels';
import { SettingsForm } from '@/components/chat/settings-form';
import { SystemBars } from '@/components/system-bars';
import { useThemeColors } from '@/hooks/use-theme-colors';

const STARTER_SUGGESTIONS = [
  'What can you do?',
  'Explain this project',
  'List the files here',
];

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

const MessageItem = memo(function MessageItem({
  message,
  isLast,
  status,
}: {
  message: UIMessage;
  isLast: boolean;
  status: ChatStatus;
}) {
  const colors = useThemeColors();
  const isUser = message.role === 'user';
  const isStreaming = isLast && (status === 'streaming' || status === 'submitted');
  const [copied, setCopied] = useState(false);
  const responseText = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');

  const copyResponse = () => {
    Clipboard.setString(responseText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
                </ToolContent>
              </Tool>
            );
          }

          return null;
        })}
      </MessageContent>

      {!isUser && responseText.length > 0 ? (
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
            <MessageAction label="Copy response" onPress={copyResponse}>
              {copied ? (
                <CheckIcon size={14} color={colors.success} />
              ) : (
                <CopyIcon size={14} color={colors.muted} />
              )}
            </MessageAction>
          </MessageActions>
        </MessageToolbar>
      ) : null}
    </Message>
  );
});

export function ChatScreen() {
  const {
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
    loadOlderMessages,
    sendMessage,
    stop,
  } = useOpencodeChat();
  const { activeServer } = useChatSettings();
  const colors = useThemeColors();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const drawerRef = useRef<SessionsDrawerHandle>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const {
    menuOpen,
    setMenuOpen,
    panel,
    setPanel,
    fullScreenFile,
    setFullScreenFile,
    fullScreenDiff,
    setFullScreenDiff,
    fileState,
  } = useSessionPanels();

  const isBusy = status === 'submitted' || status === 'streaming';
  const lastMessageId = messages.at(-1)?.id;

  const renderMessage = useCallback(
    ({ item }: { item: UIMessage }) => (
      <MessageItem message={item} isLast={item.id === lastMessageId} status={status} />
    ),
    [lastMessageId, status],
  );

  const openDrawer = useCallback(() => {
    drawerRef.current?.open();
  }, []);

  const handleSubmit = () => {
    if ((!input.trim() && attachments.length === 0) || isBusy) {
      return;
    }
    sendMessage(input, attachments);
    setInput('');
    setAttachments([]);
  };

  const handleAddImage = async () => {
    const picked = await pickImages();
    if (picked.length) {
      setAttachments((prev) => [...prev, ...picked]);
    }
  };

  const handleAddFile = async () => {
    const picked = await pickDocuments();
    if (picked.length) {
      setAttachments((prev) => [...prev, ...picked]);
    }
  };

  const statusText = isBusy ? 'Generating...' : isLoading ? 'Loading...' : 'Ready';
  const modelLabel = activeServer.model?.modelID ?? 'Default model';

  const providerCatalog = useProviderCatalog(activeServer, panel === 'context');
  const contextLimit = useMemo(() => {
    const selected = activeServer.model;
    if (!selected) {
      return undefined;
    }
    const provider = providerCatalog.data?.all.find((item) => item.id === selected.providerID);
    const model = provider?.models?.[selected.modelID] as
      | { limit?: { context?: number } }
      | undefined;
    const limit = model?.limit?.context;
    return limit && limit > 0 ? limit : undefined;
  }, [providerCatalog.data, activeServer.model]);

  return (
    <>
      <SessionsDrawer
        ref={drawerRef}
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeServerName={activeServer.name}
        onSelect={selectSession}
        onNewSession={createSession}
        onDeleteSession={deleteSession}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.background }}
          edges={['top', 'bottom', 'left', 'right']}
        >
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <View className="flex-row items-center gap-1 border-b border-border px-2 py-1.5">
              <HamburgerButton onPress={openDrawer} />
              <View className="flex-1">
                <Text
                  className="text-base font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {activeSession?.title || 'opencode'}
                </Text>
                <Text className="text-xs text-muted">{statusText}</Text>
              </View>
              <Pressable
                accessibilityLabel="Session options"
                className="h-9 w-9 items-center justify-center rounded-full"
                onPressOut={() => setMenuOpen(true)}
              >
                <EllipsisVerticalIcon size={20} color={colors.foreground} />
              </Pressable>
            </View>

            <Conversation
              messages={messages}
              onStartReached={hasMoreOlder ? loadOlderMessages : undefined}
              isLoadingOlder={isLoadingOlder}
              renderItem={renderMessage}
            />

            {error ? (
              <Text className="px-4 pb-2 text-xs text-danger">{error}</Text>
            ) : null}

            {messages.length === 0 ? (
              <View className="px-4 pb-2">
                <Suggestions>
                  {STARTER_SUGGESTIONS.map((suggestion) => (
                    <Suggestion
                      key={suggestion}
                      suggestion={suggestion}
                      onPress={(value) => {
                        sendMessage(value, []);
                      }}
                    />
                  ))}
                </Suggestions>
              </View>
            ) : null}

            <View className="border-t border-border p-3">
              <PromptInput
                value={input}
                onChangeText={setInput}
                onSubmit={handleSubmit}
                onStop={stop}
                onAddImage={handleAddImage}
                onAddFile={handleAddFile}
                onRemoveAttachment={(id) =>
                  setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
                }
                attachments={attachments}
                status={status}
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SessionsDrawer>

      <ModelPicker
        visible={modelOpen}
        onClose={() => setModelOpen(false)}
        onManageProviders={() => {
          setModelOpen(false);
          setProvidersOpen(true);
        }}
      />
      <SettingsForm
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenProviders={() => {
          setSettingsOpen(false);
          setProvidersOpen(true);
        }}
      />
      <ProvidersSheet visible={providersOpen} onClose={() => setProvidersOpen(false)} />
      <SessionMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        modelLabel={modelLabel}
        onSelectModel={() => {
          setMenuOpen(false);
          setModelOpen(true);
        }}
        onOpenPanel={(next) => {
          setMenuOpen(false);
          setPanel(next);
        }}
      />
      <SessionPanelSheet
        panel={panel}
        onClose={() => setPanel(null)}
        onBack={() => {
          setPanel(null);
          setMenuOpen(true);
        }}
        session={activeSession ?? null}
        messages={messages}
        contextLimit={contextLimit}
        modelLabel={modelLabel}
        fileState={fileState}
        onOpenFullScreen={(path) => setFullScreenFile(path)}
        onOpenDiffFullScreen={(diff) => setFullScreenDiff(diff)}
      />
      <FullScreenFileViewer
        server={activeServer}
        path={fullScreenFile}
        onClose={() => setFullScreenFile(null)}
      />
      <FullScreenDiffViewer diff={fullScreenDiff} onClose={() => setFullScreenDiff(null)} />
      <SystemBars />
    </>
  );
}
