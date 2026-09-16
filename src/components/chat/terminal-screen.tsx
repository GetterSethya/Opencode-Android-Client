import {
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  SquareTerminalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ServerConfig } from '@/chat/settings';
import { usePtyTerminal, type PtyTab } from '@/chat/use-pty-tabs';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { Spinner } from '@/components/ui/spinner';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

const ETX = String.fromCharCode(3);
const EOT = String.fromCharCode(4);
const ESC = String.fromCharCode(27);

function statusLabel(tab: PtyTab): string {
  switch (tab.status) {
    case 'open':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'exited':
      return 'Session ended';
    case 'error':
      return tab.error ?? 'Connection lost';
  }
}

function TabChip({
  tab,
  selected,
  onSelect,
  onKill,
}: {
  tab: PtyTab;
  selected: boolean;
  onSelect: () => void;
  onKill: () => void;
}) {
  const colors = useThemeColors();
  const dot =
    tab.status === 'open'
      ? colors.success
      : tab.status === 'error'
        ? colors.danger
        : colors.muted;
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-1.5',
        selected ? 'border-accent bg-accent-soft' : 'border-border',
      )}
    >
      <Pressable className="flex-row items-center gap-1.5" onPress={onSelect}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text
          className={cn(
            'text-sm',
            selected
              ? 'font-semibold text-accent-soft-foreground'
              : 'text-muted',
          )}
          numberOfLines={1}
        >
          {tab.title}
          {tab.exited ? ' · ended' : ''}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={`Close ${tab.title}`}
        hitSlop={8}
        className="h-6 w-6 items-center justify-center rounded-full"
        onPress={onKill}
      >
        <XIcon
          size={13}
          color={selected ? colors.foreground : colors.muted}
        />
      </Pressable>
    </View>
  );
}

function Transcript({ text, placeholder }: { text: string; placeholder: string }) {
  const scrollRef = useRef<ScrollView>(null);
  const stickRef = useRef(true);

  const handleScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      const distance =
        nativeEvent.contentSize.height -
        nativeEvent.layoutMeasurement.height -
        nativeEvent.contentOffset.y;
      stickRef.current = distance < 48;
    },
    [],
  );

  const handleContentSizeChange = useCallback(() => {
    if (stickRef.current) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 px-3 py-2"
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      scrollEventThrottle={100}
    >
      <Text selectable className="font-mono text-[13px] leading-[19px] text-foreground">
        {text || placeholder}
      </Text>
    </ScrollView>
  );
}

const EXTRA_KEYS = [
  { label: 'Tab', send: '\t' },
  { label: '^C', send: ETX },
  { label: '^D', send: EOT },
  { label: 'Esc', send: ESC },
  { label: '↑', send: `${ESC}[A` },
  { label: '↓', send: `${ESC}[B` },
] as const;

/**
 * Multi-command terminal over the server's PTY service: persistent shells in
 * tabs, live output over one WebSocket per active tab. The run-once
 * ShellSheet stays for single commands whose output belongs in the chat.
 */
export function TerminalScreen({
  visible,
  server,
  onClose,
}: {
  visible: boolean;
  server: ServerConfig;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { confirm } = useDialog();
  const keyboardHeight = useKeyboardHeight();
  const [input, setInput] = useState('');

  const terminal = usePtyTerminal({ server, enabled: visible });
  const {
    tabs,
    active,
    activeId,
    selectTab,
    activeText,
    canSend,
    creating,
    listState,
    send,
    submit,
    createTab,
    removeTab,
    retry,
  } = terminal;

  const handleSubmit = useCallback(() => {
    const line = input;
    if (!line.trim() || !submit(line)) {
      return;
    }
    setInput('');
  }, [input, submit]);

  const handleNewTab = useCallback(() => {
    void createTab().catch(() => {
      // Surfaced through the list query error state below.
    });
  }, [createTab]);

  const handleKill = useCallback(
    (tab: PtyTab) => {
      if (!tab.exited) {
        void confirm({
          title: `Kill ${tab.title}?`,
          message: 'This ends the shell session and its processes.',
          confirmLabel: 'Kill',
          destructive: true,
        }).then((ok) => {
          if (ok) {
            void removeTab(tab.id);
          }
        });
        return;
      }
      void removeTab(tab.id);
    },
    [confirm, removeTab],
  );

  const handleRestart = useCallback(
    (tab: PtyTab) => {
      void removeTab(tab.id).then(() => handleNewTab());
    },
    [handleNewTab, removeTab],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background"
        // RN Modals live in their own Android window, which does NOT resize for
        // the IME (the activity uses adjustResize, the modal window does not),
        // so the padding must be applied manually. The reported keyboard height
        // excludes the navigation bar while the modal spans it, hence the sum:
        // on this device 233.8dp + 47.3dp = 281dp, matching the IME frame.
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + keyboardHeight,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <View className="flex-row items-center gap-1 border-b border-border px-2 py-1.5">
          <Pressable
            accessibilityLabel="Close terminal"
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full"
            onPress={onClose}
          >
            <XIcon size={20} color={colors.foreground} />
          </Pressable>
          <SquareTerminalIcon size={18} color={colors.muted} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
              {active ? active.title : 'Terminal'}
            </Text>
            <Text className="text-xs text-muted" numberOfLines={1}>
              {active
                ? `${statusLabel(active)} · ${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'}`
                : server.directory || 'server folder'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="New terminal"
            hitSlop={8}
            disabled={creating}
            className="h-9 w-9 items-center justify-center rounded-full"
            onPress={handleNewTab}
          >
            {creating ? (
              <Spinner size={18} />
            ) : (
              <PlusIcon size={20} color={colors.foreground} />
            )}
          </Pressable>
        </View>

        {tabs.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // RN's ScrollView defaults to flexGrow: 1, which would stretch this
            // strip over the whole column and starve the transcript.
            style={{ flexGrow: 0, flexShrink: 0 }}
            className="border-b border-border"
            contentContainerClassName="flex-row items-center gap-2 px-3 py-2"
          >
            {tabs.map((tab) => (
              <TabChip
                key={tab.id}
                tab={tab}
                selected={tab.id === activeId}
                onSelect={() => selectTab(tab.id)}
                onKill={() => handleKill(tab)}
              />
            ))}
          </ScrollView>
        ) : null}

        <View className="flex-1">
          <View className="flex-1">
            {listState.isLoading && tabs.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <Spinner size={24} />
              </View>
            ) : listState.unsupported ? (
              <View className="flex-1 items-center justify-center px-8">
                <ErrorState
                  kind="not-found"
                  title="Terminals need a newer server"
                  message="This opencode server has no PTY API. Update the server, then reopen the terminal."
                />
                <View className="w-full pt-4">
                  <Button onPress={onClose}>Back to chat</Button>
                </View>
              </View>
            ) : listState.error ? (
              <View className="flex-1 items-center justify-center px-8">
                <ErrorState
                  kind="network"
                  title="Terminal unavailable"
                  message={
                    listState.error instanceof Error
                      ? listState.error.message
                      : 'Request failed'
                  }
                  onRetry={() => listState.refetch()}
                />
              </View>
            ) : tabs.length === 0 ? (
              <View className="flex-1 items-center justify-center gap-3 px-8">
                <Text className="text-center text-sm text-muted">
                  No terminal sessions. Start one to run commands in{' '}
                  {server.directory || 'the server folder'}.
                </Text>
                <Button onPress={handleNewTab}>New terminal</Button>
              </View>
            ) : active?.exited ? (
              <View className="flex-1 items-center justify-center gap-3 px-8">
                <Text className="text-center text-sm text-muted">
                  {active.title} ended. Output is kept above only while this screen stays open.
                </Text>
                <View className="w-full gap-2">
                  <Button onPress={() => handleRestart(active)}>Restart session</Button>
                  <Button variant="secondary" onPress={() => handleKill(active)}>
                    Remove
                  </Button>
                </View>
              </View>
            ) : (
              <>
                <Transcript
                  text={activeText}
                  placeholder={
                    active?.status === 'open'
                      ? 'Connected — type a command below.'
                      : 'Connecting…'
                  }
                />
                {active?.status === 'error' ? (
                  <View className="flex-row items-center gap-2 border-t border-border px-3 py-2">
                    <Text className="flex-1 text-xs text-danger">
                      {active.error ?? 'Connection lost'}
                    </Text>
                    <Pressable
                      accessibilityLabel="Retry connection"
                      hitSlop={8}
                      className="flex-row items-center gap-1 rounded-full border border-border px-3 py-1.5"
                      onPress={retry}
                    >
                      <RotateCcwIcon size={14} color={colors.foreground} />
                      <Text className="text-xs text-foreground">Retry</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {active && !active.exited && tabs.length > 0 ? (
            <>
              <View className="flex-row gap-1.5 border-t border-border px-3 pt-2">
                {EXTRA_KEYS.map((key) => (
                  <Pressable
                    key={key.label}
                    accessibilityLabel={`Send ${key.label}`}
                    disabled={!canSend}
                    className="flex-1 items-center rounded-lg bg-surface-secondary py-2 disabled:opacity-50"
                    onPress={() => send(key.send)}
                  >
                    <Text className="font-mono text-xs text-foreground">{key.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View className="flex-row items-center gap-2 px-3 py-2">
                <Text className="font-mono text-sm text-muted">❯</Text>
                <TextInput
                  className="flex-1 rounded-xl bg-surface-secondary px-3 py-2.5 font-mono text-sm text-foreground"
                  placeholder="ls -la"
                  placeholderTextColor={colors.muted}
                  value={input}
                  onChangeText={setInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmit}
                />
                <Pressable
                  accessibilityLabel="Send command"
                  hitSlop={8}
                  disabled={!canSend || !input.trim()}
                  className="h-10 w-10 items-center justify-center rounded-full bg-surface-secondary disabled:opacity-50"
                  onPress={handleSubmit}
                >
                  <SendIcon size={17} color={colors.foreground} />
                </Pressable>
              </View>
              <View className="flex-row items-center gap-2 px-3 pb-1">
                <Pressable
                  accessibilityLabel="Interrupt (Ctrl+C)"
                  hitSlop={8}
                  disabled={!canSend}
                  className="flex-row items-center gap-1 disabled:opacity-50"
                  onPress={() => send(ETX)}
                >
                  <Text className="text-xs text-muted">Interrupt</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Remove ended sessions"
                  hitSlop={8}
                  onPress={() => {
                    for (const tab of tabs) {
                      if (tab.exited) {
                        void removeTab(tab.id);
                      }
                    }
                  }}
                >
                  <View className="flex-row items-center gap-1">
                    <Trash2Icon size={13} color={colors.muted} />
                    <Text className="text-xs text-muted">Clear ended</Text>
                  </View>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
