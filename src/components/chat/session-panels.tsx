import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuIcon,
  FolderOpenIcon,
  GitCompareIcon,
  GitForkIcon,
  SparklesIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OpencodeSession, VcsFileDiff } from '@/chat/opencode';
import { useChatSettings } from '@/chat/settings';
import type { UIMessage } from '@/chat/types';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ContextPanel } from './context-panel';
import { FilePanel, useFilePanelState, type FilePanelState } from './file-panel';
import { ReviewPanel } from './review-panel';

export type SessionPanel = 'review' | 'context' | 'files';

const TITLES: Record<SessionPanel, string> = {
  review: 'Review changes',
  context: 'Context',
  files: 'Open file',
};

export function SessionPanelSheet({
  panel,
  onClose,
  onBack,
  session,
  messages,
  contextLimit,
  modelLabel,
  fileState,
  onOpenFullScreen,
  onOpenDiffFullScreen,
}: {
  panel: SessionPanel | null;
  onClose: () => void;
  onBack: () => void;
  session: OpencodeSession | null;
  messages: UIMessage[];
  contextLimit?: number;
  modelLabel?: string;
  fileState: FilePanelState;
  onOpenFullScreen: (path: string) => void;
  onOpenDiffFullScreen: (diff: VcsFileDiff) => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const { activeServer } = useChatSettings();
  const keyboardHeight = useKeyboardHeight();
  const scrollMaxHeight =
    keyboardHeight > 0
      ? Math.max(240, height - keyboardHeight - 320)
      : Math.min(height * 0.7, 560);

  // Back inside the file panel drills up before leaving the sheet.
  const handleRequestClose = () => {
    if (panel === 'files') {
      if (fileState.file) {
        fileState.setFile(undefined);
        return;
      }
      if (fileState.dir !== '.') {
        fileState.setDir('.');
        return;
      }
    }
    onBack();
  };

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={panel !== null}
      animationType="slide"
      onRequestClose={handleRequestClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <KeyboardAvoidingView behavior="padding">
          <Animated.View
            layout={LinearTransition.duration(240)}
            className="rounded-t-3xl bg-surface pt-4"
            style={{
              paddingBottom: insets.bottom + 16,
              paddingLeft: insets.left + 16,
              paddingRight: insets.right + 16,
            }}
          >
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1">
                <Pressable
                  accessibilityLabel="Back to session menu"
                  hitSlop={8}
                  className="pr-1"
                  onPress={onBack}
                >
                  <ChevronLeftIcon size={20} color={colors.muted} />
                </Pressable>
                <Text className="text-lg font-semibold text-foreground">
                  {panel ? TITLES[panel] : ''}
                </Text>
              </View>
              <Pressable hitSlop={8} onPress={onClose}>
                <Text className="text-sm text-muted">Done</Text>
              </Pressable>
            </View>

            {/* Review owns its own virtualized list; nesting it inside a
                ScrollView breaks measurement and clips the list. */}
            {panel === 'review' ? (
              <ReviewPanel
                server={activeServer}
                onOpenFullScreen={onOpenDiffFullScreen}
                listHeight={scrollMaxHeight}
              />
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: scrollMaxHeight }}
              >
                {panel === 'context' ? (
                  <ContextPanel
                    session={session}
                    messages={messages}
                    contextLimit={contextLimit}
                    modelLabel={modelLabel}
                  />
                ) : null}
                {panel === 'files' ? (
                  <FilePanel
                    server={activeServer}
                    state={fileState}
                    onOpenFullScreen={onOpenFullScreen}
                  />
                ) : null}
              </ScrollView>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Header overflow menu replacing the model pill. */
export function SessionMenuSheet({
  visible,
  onClose,
  modelLabel,
  onSelectModel,
  onOpenPanel,
  onForkSession,
  isForking,
  forkDisabled,
}: {
  visible: boolean;
  onClose: () => void;
  modelLabel: string;
  onSelectModel: () => void;
  onOpenPanel: (panel: SessionPanel) => void;
  onForkSession: () => void;
  isForking: boolean;
  forkDisabled: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <View
          className="rounded-t-3xl bg-surface pt-4"
          style={{
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-foreground">Session</Text>
            <Pressable hitSlop={8} onPress={onClose}>
              <Text className="text-sm text-muted">Done</Text>
            </Pressable>
          </View>

          <View className="gap-2">
            <MenuRow
              icon={SparklesIcon}
              label="Model"
              hint={modelLabel}
              onPress={onSelectModel}
            />
            <MenuRow
              icon={GitCompareIcon}
              label="Review changes"
              hint="Working tree diff"
              onPress={() => onOpenPanel('review')}
            />
            <MenuRow
              icon={CpuIcon}
              label="Context"
              hint="Token usage"
              onPress={() => onOpenPanel('context')}
            />
            <MenuRow
              icon={FolderOpenIcon}
              label="Open file"
              hint="Browse project"
              onPress={() => onOpenPanel('files')}
            />
            <MenuRow
              icon={GitForkIcon}
              label="Fork session"
              hint={isForking ? 'Forking…' : 'Duplicate this session'}
              onPress={onForkSession}
              disabled={forkDisabled || isForking}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({
  icon: Icon,
  label,
  hint,
  onPress,
  disabled,
}: {
  icon: typeof SparklesIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3.5 active:bg-surface-secondary"
      onPressOut={onPress}
      disabled={disabled}
      style={disabled ? { opacity: 0.5 } : undefined}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-secondary">
        <Icon size={18} color={colors.foreground} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {hint ? (
          <Text className="text-xs text-muted" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <ChevronRightIcon size={16} color={colors.muted} />
    </Pressable>
  );
}

export function useSessionPanels() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<SessionPanel | null>(null);
  const [fullScreenFile, setFullScreenFile] = useState<string | null>(null);
  const [fullScreenDiff, setFullScreenDiff] = useState<VcsFileDiff | null>(null);
  const fileState = useFilePanelState();
  return {
    menuOpen,
    setMenuOpen,
    panel,
    setPanel,
    fullScreenFile,
    setFullScreenFile,
    fullScreenDiff,
    setFullScreenDiff,
    fileState,
  };
}
