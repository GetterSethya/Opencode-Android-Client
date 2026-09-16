import { TerminalIcon } from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Run-command sheet (the mobile equivalent of the TUI's `!` shell prefix):
 * executes a shell command in the session's project folder via
 * POST /session/:id/shell. Output streams back into the chat and renders
 * with the bash tool renderer.
 */
export function ShellSheet({
  visible,
  onClose,
  directoryLabel,
  isBusy,
  onRun,
}: {
  visible: boolean;
  onClose: () => void;
  directoryLabel: string;
  /** While a run streams, the command waits in the message queue instead. */
  isBusy: boolean;
  onRun: (command: string) => void;
}) {
  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Mounted only while open so each open starts from a fresh draft. */}
      {visible ? (
        <ShellSheetContent
          directoryLabel={directoryLabel}
          isBusy={isBusy}
          onClose={onClose}
          onRun={onRun}
        />
      ) : null}
    </Modal>
  );
}

function ShellSheetContent({
  onClose,
  directoryLabel,
  isBusy,
  onRun,
}: {
  onClose: () => void;
  directoryLabel: string;
  isBusy: boolean;
  onRun: (command: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const colors = useThemeColors();
  const keyboardHeight = useKeyboardHeight();
  const [command, setCommand] = useState('');

  const trimmed = command.trim();
  const inputMaxHeight =
    keyboardHeight > 0
      ? Math.max(120, height - keyboardHeight - 380)
      : Math.min(height * 0.3, 220);

  const run = () => {
    if (!trimmed) {
      return;
    }
    onRun(trimmed);
    onClose();
  };

  return (
    <View className="flex-1 justify-end">
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <KeyboardAvoidingView behavior="padding">
        <View
          className="rounded-t-3xl bg-surface pt-4"
          style={{
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          }}
        >
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-foreground">Run shell command</Text>
            <Pressable hitSlop={8} onPress={onClose}>
              <Text className="text-sm text-muted">Cancel</Text>
            </Pressable>
          </View>
          <Text className="mb-3 text-xs text-muted" numberOfLines={1} ellipsizeMode="head">
            Runs in {directoryLabel}
          </Text>

          <View className="flex-row items-start gap-2 rounded-xl bg-surface-secondary px-3">
            <View style={{ paddingTop: 12 }}>
              <TerminalIcon size={16} color={colors.muted} />
            </View>
            <TextInput
              className="flex-1 py-2.5 font-mono text-sm text-foreground"
              placeholder="git status"
              placeholderTextColor={colors.muted}
              value={command}
              onChangeText={setCommand}
              multiline
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={run}
              style={{ maxHeight: inputMaxHeight }}
            />
          </View>

          <View className="pt-3">
            <Button disabled={!trimmed} onPress={run}>
              {isBusy ? 'Queue command' : 'Run command'}
            </Button>
          </View>
          <Text className="px-1 pt-2 text-xs text-muted">
            Tip: messages starting with ! run as shell commands too.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
