import {
  AtSignIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  SlashIcon,
  TerminalIcon,
  XIcon,
} from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Clipboard, Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pickDocuments, pickImages, type PendingAttachment } from '@/chat/attachments';
import { useChatSettings } from '@/chat/settings';
import type { UIMessage } from '@/chat/types';
import type { PermissionReply } from '@/chat/opencode';
import { useOpencodeChat } from '@/chat/use-opencode-chat';
import { useProviderCatalog } from '@/chat/use-opencode-provider-management';
import {
  Conversation,
  PromptInput,
  PromptInputFooter,
  Suggestion,
  Suggestions,
} from '@/components/ai-elements';
import { ConversationLoadError, MessageItem } from '@/components/chat/message-item';
import { HamburgerButton, SessionsDrawer, type SessionsDrawerHandle } from '@/components/chat/sessions-drawer';
import { ComposerSuggestions } from '@/components/chat/composer-suggestions';
import { QuickOpenSheet } from '@/components/chat/quick-open-sheet';
import { useCommands } from '@/chat/use-workspace';
import { ModelPicker } from '@/components/chat/model-picker';
import { ProvidersSheet } from '@/components/chat/providers-sheet';
import { FullScreenFileViewer } from '@/components/chat/file-panel';
import { FullScreenDiffViewer } from '@/components/chat/review-panel';
import {
  ChildSessionsSheet,
  SessionMenuSheet,
  SessionPanelSheet,
  useSessionPanels,
} from '@/components/chat/session-panels';
import { ShellSheet } from '@/components/chat/shell-sheet';
import { useSessionChildren } from '@/chat/use-workspace';
import { NewSessionSheet } from '@/components/chat/new-session-sheet';
import { useDialog } from '@/components/ui/dialog';
import { SettingsForm } from '@/components/chat/settings-form';
import { SystemBars } from '@/components/system-bars';
import { useThemeColors } from '@/hooks/use-theme-colors';




const STARTER_SUGGESTIONS = [
  'What can you do?',
  'Explain this project',
  'List the files here',
];

export function ChatScreen() {
  const {
    messages,
    status,
    error,
    isLoading,
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    selectSession,
    deleteSession,
    forkSession,
    forkTarget,
    isForking,
    refreshSessions,
    retryLoad,
    loadError,
    isLoadingOlder,
    hasMoreOlder,
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
  } = useOpencodeChat();
  const { activeServer } = useChatSettings();
  const { confirm, notify } = useDialog();
  const colors = useThemeColors();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [selectionOverride, setSelectionOverride] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [shellOpen, setShellOpen] = useState(false);
  const commandsQuery = useCommands(activeServer, !!activeSessionId);
  const drawerRef = useRef<SessionsDrawerHandle>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
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
  const forkDisabled = isBusy || isForking;

  const [childrenOpen, setChildrenOpen] = useState(false);
  const sessionChildren = useSessionChildren(
    activeServer,
    activeSessionId,
    menuOpen || childrenOpen,
  );
  const historyDisabled = isBusy || isForking || !activeSessionId;

  const handleUndo = useCallback(async () => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    if (!lastUser) {
      return;
    }
    const confirmed = await confirm({
      title: 'Undo last message',
      message: 'Truncate the history back to the last message? This cannot be undone.',
      confirmLabel: 'Undo',
      destructive: true,
    });
    if (confirmed) {
      setMenuOpen(false);
      void revertSession(lastUser.id);
    }
  }, [confirm, messages, revertSession, setMenuOpen]);

  const handleRedo = useCallback(() => {
    setMenuOpen(false);
    void unrevertSession();
  }, [setMenuOpen, unrevertSession]);

  const handleShare = useCallback(async () => {
    setMenuOpen(false);
    const existing = activeSession?.share?.url;
    if (existing) {
      Clipboard.setString(existing);
      await notify({ title: 'Share link copied', message: existing });
      return;
    }
    const session = await shareSession();
    if (session?.share?.url) {
      Clipboard.setString(session.share.url);
      await notify({ title: 'Session shared', message: session.share.url });
    }
  }, [activeSession, notify, setMenuOpen, shareSession]);

  const handleUnshare = useCallback(async () => {
    setMenuOpen(false);
    await unshareSession();
    await notify({ title: 'Session unshared', message: 'The public link is down.' });
  }, [notify, setMenuOpen, unshareSession]);

  const handleSummarize = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Summarize session',
      message: 'Compact this session into a summary with the current model?',
      confirmLabel: 'Summarize',
    });
    if (confirmed) {
      setMenuOpen(false);
      void summarizeSession();
    }
  }, [confirm, setMenuOpen, summarizeSession]);

  const handleForkMessage = useCallback(
    async (messageId: string) => {
      const confirmed = await confirm({
        title: 'Fork session',
        message: 'Create a new session starting from this message?',
        confirmLabel: 'Fork',
      });
      if (confirmed) {
        void forkSession(messageId);
      }
    },
    [confirm, forkSession],
  );

  const handleForkSession = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Fork session',
      message: 'Duplicate this session into a new one?',
      confirmLabel: 'Fork',
    });
    if (confirmed) {
      setMenuOpen(false);
      void forkSession();
    }
  }, [confirm, forkSession]);

  const handleAnswerQuestion = useCallback(
    (requestID: string, answers: string[][]) => answerQuestion(requestID, answers),
    [answerQuestion],
  );

  const handleRejectQuestion = useCallback(
    (requestID: string) => rejectQuestion(requestID),
    [rejectQuestion],
  );

  const handleReplyPermission = useCallback(
    (requestID: string, reply: PermissionReply) => replyToPermission(requestID, reply),
    [replyToPermission],
  );

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      void retryMessage(messageId);
    },
    [retryMessage],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      const confirmed = await confirm({
        title: 'Delete message',
        message: 'Remove this message from the session?',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (confirmed) {
        void deleteMessage(messageId);
      }
    },
    [confirm, deleteMessage],
  );

  const renderMessage = useCallback(
    ({ item }: { item: UIMessage }) => (
      <MessageItem
        message={item}
        isLast={item.id === lastMessageId}
        status={status}
        onFork={handleForkMessage}
        forkTarget={forkTarget}
        forkDisabled={forkDisabled}
        pendingQuestions={pendingQuestions}
        onAnswerQuestion={handleAnswerQuestion}
        onRejectQuestion={handleRejectQuestion}
        pendingPermissions={pendingPermissions}
        onReplyPermission={handleReplyPermission}
        onDeleteMessage={handleDeleteMessage}
        onRetry={handleRetryMessage}
      />
    ),
    [lastMessageId, status, handleForkMessage, forkTarget, forkDisabled, pendingQuestions, handleAnswerQuestion, handleRejectQuestion, pendingPermissions, handleReplyPermission, handleDeleteMessage, handleRetryMessage],
  );

  const openDrawer = useCallback(() => {
    drawerRef.current?.open();
  }, []);

  const placeCursor = useCallback((position: number) => {
    const next = { start: position, end: position };
    setSelection(next);
    setSelectionOverride(next);
  }, []);

  const insertText = useCallback(
    (text: string) => {
      const next = input.slice(0, selection.start) + text + input.slice(selection.end);
      setInput(next);
      placeCursor(selection.start + text.length);
    },
    [input, selection, placeCursor],
  );

  const applySuggestion = useCallback(
    (next: string, cursor: number) => {
      setInput(next);
      placeCursor(cursor);
    },
    [placeCursor],
  );

  // Messages composed while a run is in flight wait in the queue and are
  // sent automatically, in order, once the session goes idle again.
  const queuedForSession = messageQueue.filter((entry) => entry.sessionID === activeSessionId);

  const handleSubmit = () => {
    if (!input.trim() && attachments.length === 0) {
      return;
    }
    // A leading /known-command routes to the command endpoint so agent and
    // model overrides apply; anything else is sent as a plain prompt.
    const match = input.match(/^\s*\/([A-Za-z0-9_-]+)([\s\S]*)$/);
    const commandName = match?.[1];
    const knownCommand =
      commandName && commandsQuery.data?.some((command) => command.name === commandName)
        ? commandName
        : undefined;
    const args = (match?.[2] ?? '').trim();
    // A leading ! runs a shell command (TUI parity); attachments can't ride
    // along, so those fall back to a plain prompt.
    const shellMatch = attachments.length === 0 ? input.match(/^\s*!(\S[\s\S]*)$/) : null;
    const shellCommand = shellMatch?.[1]?.trim();
    if (isBusy) {
      queueMessage({
        kind: knownCommand ? 'command' : shellCommand ? 'shell' : 'message',
        text: knownCommand
          ? `/${knownCommand}${args ? ` ${args}` : ''}`
          : (shellCommand ? `!${shellCommand}` : input),
        command: knownCommand ?? shellCommand,
        args,
        attachments,
      });
    } else if (knownCommand) {
      sendCommand(knownCommand, args, attachments);
    } else if (shellCommand) {
      sendShell(shellCommand);
    } else {
      sendMessage(input, attachments);
    }
    setInput('');
    setAttachments([]);
  };

  const handleRunShell = useCallback(
    (command: string) => {
      if (isBusy) {
        queueMessage({ kind: 'shell', text: `!${command}`, command, args: '', attachments: [] });
      } else {
        sendShell(command);
      }
    },
    [isBusy, queueMessage, sendShell],
  );

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

  const lastMessage = messages.at(-1);
  const lastError =
    lastMessage?.role === 'assistant' && lastMessage.error ? lastMessage.error : undefined;
  const statusText = isForking
    ? 'Forking...'
    : isBusy
      ? 'Generating...'
      : isLoading
        ? 'Loading...'
        : lastError
          ? `Error${lastError.statusCode ? ` (${lastError.statusCode})` : ''}`
          : 'Ready';
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
        projectDirectory={activeServer.directory}
        onSelect={selectSession}
        onNewSession={() => setNewSessionOpen(true)}
        onDeleteSession={deleteSession}
        onRenameSession={(sessionId, title) => void renameSession(sessionId, title)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpen={() => {
          void refreshSessions();
        }}
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
                onPress={() => setMenuOpen(true)}
              >
                <EllipsisVerticalIcon size={20} color={colors.foreground} />
              </Pressable>
            </View>

            {loadError && messages.length === 0 && !isLoading ? (
              <ConversationLoadError
                loadError={loadError}
                onRetry={() => void retryLoad()}
                onOpenSessions={openDrawer}
              />
            ) : (
              <Conversation
                messages={messages}
                renderItem={renderMessage}
                onStartReached={hasMoreOlder ? loadOlderMessages : undefined}
                isLoadingOlder={isLoadingOlder}
                hasMoreOlder={hasMoreOlder}
              />
            )}

            {error ? (
              <Text className="px-4 pb-2 text-xs text-danger">{error}</Text>
            ) : null}

            {messages.length === 0 && !loadError ? (
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

            <ComposerSuggestions
              server={activeServer}
              enabled={!!activeSessionId && !isBusy}
              value={input}
              selection={selection}
              onInsert={applySuggestion}
            />

            {queuedForSession.length > 0 ? (
              <View className="border-t border-border px-4 py-2">
                <Text className="pb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Queued · sends when the run finishes
                </Text>
                {queuedForSession.map((entry) => (
                  <View key={entry.id} className="flex-row items-center gap-2 py-1">
                    <ClockIcon size={14} color={colors.muted} />
                    <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                      {entry.text || `${entry.attachments.length} attachment(s)`}
                    </Text>
                    <Pressable
                      accessibilityLabel="Remove queued message"
                      hitSlop={8}
                      onPress={() => removeQueuedMessage(entry.id)}
                    >
                      <XIcon size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
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
                selection={selectionOverride ?? undefined}
                onSelectionChange={(next) => {
                  setSelection(next);
                  setSelectionOverride(null);
                }}
                footer={
                  <PromptInputFooter>
                    <Pressable
                      accessibilityLabel="Insert slash command"
                      className="h-8 w-8 items-center justify-center rounded-full"
                      onPress={() => insertText('/')}
                    >
                      <SlashIcon size={18} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Find file to mention"
                      className="h-8 w-8 items-center justify-center rounded-full"
                      onPress={() => setQuickOpen(true)}
                    >
                      <AtSignIcon size={18} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Run shell command"
                      className="h-8 w-8 items-center justify-center rounded-full"
                      onPress={() => setShellOpen(true)}
                    >
                      <TerminalIcon size={18} color={colors.muted} />
                    </Pressable>
                  </PromptInputFooter>
                }
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SessionsDrawer>

      <NewSessionSheet
        visible={newSessionOpen}
        onClose={() => setNewSessionOpen(false)}
        server={activeServer}
        currentDirectory={activeServer.directory}
        busy={isLoading}
        onCreate={(directory) => {
          setNewSessionOpen(false);
          void createSession(directory);
        }}
      />
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
      <QuickOpenSheet
        visible={quickOpen}
        onClose={() => setQuickOpen(false)}
        server={activeServer}
        onInsertMention={(path) => insertText(`@${path} `)}
      />
      <ShellSheet
        visible={shellOpen}
        onClose={() => setShellOpen(false)}
        directoryLabel={activeServer.directory || 'server default folder'}
        isBusy={isBusy}
        onRun={handleRunShell}
      />
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
        onForkSession={handleForkSession}
        isForking={isForking}
        forkDisabled={isBusy}
        onUndo={handleUndo}
        onRedo={handleRedo}
        historyDisabled={historyDisabled}
        onShare={handleShare}
        shareHint={activeSession?.share?.url ?? 'Publish a link'}
        shared={!!activeSession?.share?.url}
        onUnshare={handleUnshare}
        onSummarize={handleSummarize}
        onOpenChildren={() => {
          setMenuOpen(false);
          setChildrenOpen(true);
        }}
        childCount={sessionChildren.data?.length}
        onOpenParent={
          activeSession?.parentID
            ? () => {
                const parentID = activeSession?.parentID;
                setMenuOpen(false);
                if (parentID) {
                  void selectSession(parentID);
                }
              }
            : undefined
        }
      />
      <ChildSessionsSheet
        visible={childrenOpen}
        onClose={() => setChildrenOpen(false)}
        children={sessionChildren.data ?? []}
        isLoading={sessionChildren.isLoading}
        onSelect={(sessionId) => void selectSession(sessionId)}
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
