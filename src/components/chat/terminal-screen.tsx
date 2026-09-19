import {
  CornerDownLeftIcon,
  KeyboardIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  SquareTerminalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
import {
  OpencodeTerminalView,
  type OpencodeTerminalViewRef,
  type TerminalTheme,
} from 'opencode-terminal';

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

const EXTRA_KEYS = [
  { label: 'Tab', send: '\t' },
  { label: 'Ctrl+C', send: ETX },
  { label: 'Ctrl+D', send: EOT },
  { label: 'Esc', send: ESC },
  { label: '↑', send: `${ESC}[A` },
  { label: '↓', send: `${ESC}[B` },
  { label: '←', send: `${ESC}[D` },
  { label: '→', send: `${ESC}[C` },
] as const;

/**
 * Multi-command native terminal powered by Termux terminal emulator:
 * persistent shells in tabs, live output over WebSocket, full ANSI colors and VT100/VT220 emulation.
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
  const terminalRef = useRef<OpencodeTerminalViewRef>(null);
  const [input, setInput] = useState('');

  const handleData = useCallback((tabId: string, chunk: string) => {
    terminalRef.current?.write(chunk);
  }, []);

  const terminal = usePtyTerminal({
    server,
    enabled: visible,
    onData: handleData,
  });

  const {
    tabs,
    active,
    activeId,
    selectTab,
    canSend,
    creating,
    listState,
    send,
    resize,
    createTab,
    removeTab,
    retry,
  } = terminal;

  const terminalTheme: TerminalTheme = useMemo(
    () => ({
      background: colors.background,
      foreground: colors.foreground,
      cursor: colors.foreground,
      color0: colors.dark ? '#18181b' : '#000000',
      color1: colors.danger,
      color2: colors.success,
      color3: colors.dark ? '#facc15' : '#ca8a04',
      color4: colors.dark ? '#60a5fa' : '#2563eb',
      color5: colors.dark ? '#c084fc' : '#9333ea',
      color6: colors.dark ? '#38bdf8' : '#0284c7',
      color7: colors.foreground,
      color8: colors.muted,
      color9: colors.danger,
      color10: colors.success,
      color11: colors.dark ? '#fde047' : '#eab308',
      color12: colors.dark ? '#93c5fd' : '#3b82f6',
      color13: colors.dark ? '#d8b4fe' : '#a855f7',
      color14: colors.dark ? '#7dd3fc' : '#0ea5e9',
      color15: colors.foreground,
    }),
    [colors],
  );

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

  const handleTerminalInput = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      send(event.nativeEvent.data);
    },
    [send],
  );

  const handleTerminalResize = useCallback(
    (event: { nativeEvent: { cols: number; rows: number } }) => {
      resize(event.nativeEvent.cols, event.nativeEvent.rows);
    },
    [resize],
  );

  const handleSendKey = useCallback(
    (keyStr: string) => {
      send(keyStr);
    },
    [send],
  );

  const handleSubmitInput = useCallback(() => {
    const line = input;
    if (!line.trim() || !canSend) {
      return;
    }
    send(`${line}\n`);
    setInput('');
  }, [input, canSend, send]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background"
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
                  {active.title} ended.
                </Text>
                <View className="w-full gap-2">
                  <Button onPress={() => handleRestart(active)}>Restart session</Button>
                  <Button variant="secondary" onPress={() => handleKill(active)}>
                    Remove
                  </Button>
                </View>
              </View>
            ) : (
              <View className="flex-1">
                <OpencodeTerminalView
                  ref={terminalRef}
                  style={{ flex: 1 }}
                  fontSize={13}
                  theme={terminalTheme}
                  cursorBlink={true}
                  onInput={handleTerminalInput}
                  onResize={handleTerminalResize}
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
              </View>
            )}
          </View>

          {active && !active.exited && tabs.length > 0 ? (
            <View className="border-t border-border bg-background">
              <View className="flex-row items-center gap-2 px-3 pt-2">
                <Pressable
                  accessibilityLabel="Focus terminal keyboard"
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-xl bg-surface-secondary"
                  onPress={() => terminalRef.current?.focus()}
                >
                  <KeyboardIcon size={18} color={colors.foreground} />
                </Pressable>
                <TextInput
                  className="flex-1 rounded-xl bg-surface-secondary px-3 py-2 font-mono text-sm text-foreground"
                  placeholder="Type a command…"
                  placeholderTextColor={colors.muted}
                  value={input}
                  onChangeText={setInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmitInput}
                />
                <Pressable
                  accessibilityLabel="Send command"
                  hitSlop={8}
                  disabled={!canSend || !input.trim()}
                  className="h-10 w-10 items-center justify-center rounded-full bg-surface-secondary disabled:opacity-50"
                  onPress={handleSubmitInput}
                >
                  <SendIcon size={16} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, flexShrink: 0 }}
                contentContainerClassName="flex-row items-center gap-1.5 px-3 py-2"
              >
                {EXTRA_KEYS.map((key) => (
                  <Pressable
                    key={key.label}
                    accessibilityLabel={`Send ${key.label}`}
                    disabled={!canSend}
                    className="items-center rounded-lg bg-surface-secondary px-3 py-2 disabled:opacity-50"
                    onPress={() => handleSendKey(key.send)}
                  >
                    <Text className="font-mono text-xs text-foreground">{key.label}</Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityLabel="Send Enter"
                  disabled={!canSend}
                  className="flex-row items-center gap-1 rounded-lg bg-surface-secondary px-3 py-2 disabled:opacity-50"
                  onPress={() => handleSendKey('\n')}
                >
                  <CornerDownLeftIcon size={12} color={colors.foreground} />
                  <Text className="font-mono text-xs text-foreground">Enter</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Clear screen"
                  disabled={!canSend}
                  className="rounded-lg bg-surface-secondary px-3 py-2 disabled:opacity-50"
                  onPress={() => {
                    terminalRef.current?.clear();
                    send('clear\n');
                  }}
                >
                  <Text className="font-mono text-xs text-foreground">Clear</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Remove ended sessions"
                  hitSlop={8}
                  className="flex-row items-center gap-1 px-2 py-2"
                  onPress={() => {
                    for (const tab of tabs) {
                      if (tab.exited) {
                        void removeTab(tab.id);
                      }
                    }
                  }}
                >
                  <Trash2Icon size={13} color={colors.muted} />
                  <Text className="text-xs text-muted">Clear ended</Text>
                </Pressable>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
