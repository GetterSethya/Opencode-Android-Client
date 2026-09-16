import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CornerUpLeftIcon,
  CpuIcon,
  FolderOpenIcon,
  GitCompareIcon,
  GitForkIcon,
  Link2OffIcon,
  ListTreeIcon,
  Redo2Icon,
  Share2Icon,
  ShrinkIcon,
  SparklesIcon,
  Undo2Icon,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OpencodeSession, VcsFileDiff } from '@/chat/opencode';
import { useChatSettings } from '@/chat/settings';
import type { UIMessage } from '@/chat/types';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ContextPanel } from './context-panel';
import { FilePanel, useFilePanelState, type FilePanelState } from './file-panel';
import { ReviewPanel } from './review-panel';
import { relativeTime } from './sessions-drawer';

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
          <View
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
          </View>
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
  onUndo,
  onRedo,
  historyDisabled,
  onShare,
  shareHint,
  shared,
  onUnshare,
  onSummarize,
  onOpenChildren,
  childCount,
  onOpenParent,
}: {
  visible: boolean;
  onClose: () => void;
  modelLabel: string;
  onSelectModel: () => void;
  onOpenPanel: (panel: SessionPanel) => void;
  onForkSession: () => void;
  isForking: boolean;
  forkDisabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
  historyDisabled: boolean;
  onShare: () => void;
  shareHint: string;
  shared: boolean;
  onUnshare: () => void;
  onSummarize: () => void;
  onOpenChildren: () => void;
  childCount: number | undefined;
  onOpenParent?: () => void;
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

          <ScrollView
            style={{ maxHeight: 480 }}
            contentContainerStyle={{ gap: 8 }}
            keyboardShouldPersistTaps="handled"
          >
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
            <MenuRow
              icon={Undo2Icon}
              label="Undo last message"
              hint="Truncate history"
              onPress={onUndo}
              disabled={historyDisabled}
            />
            <MenuRow
              icon={Redo2Icon}
              label="Redo"
              hint="Restore undone messages"
              onPress={onRedo}
              disabled={historyDisabled}
            />
            <MenuRow
              icon={Share2Icon}
              label={shared ? 'Copy share link' : 'Share session'}
              hint={shareHint}
              onPress={onShare}
            />
            {shared ? (
              <MenuRow
                icon={Link2OffIcon}
                label="Unshare session"
                hint="Take the link down"
                onPress={onUnshare}
              />
            ) : null}
            <MenuRow
              icon={ShrinkIcon}
              label="Summarize"
              hint="Compact into a summary"
              onPress={onSummarize}
              disabled={historyDisabled}
            />
            <MenuRow
              icon={ListTreeIcon}
              label="Sub-sessions"
              hint={
                childCount === undefined
                  ? 'Forks and subagent runs'
                  : childCount === 0
                    ? 'None yet'
                    : `${childCount} session${childCount === 1 ? '' : 's'}`
              }
              onPress={onOpenChildren}
            />
            {onOpenParent ? (
              <MenuRow
                icon={CornerUpLeftIcon}
                label="Parent session"
                hint="Back to the spawning session"
                onPress={onOpenParent}
              />
            ) : null}
          </ScrollView>
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
      onPress={onPress}
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

/** Lists the sub-sessions spawned from the active session. */
export function ChildSessionsSheet({
  visible,
  onClose,
  children,
  isLoading,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  children: OpencodeSession[];
  isLoading: boolean;
  onSelect: (sessionId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

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
            <Text className="text-lg font-semibold text-foreground">Sub-sessions</Text>
            <Pressable hitSlop={8} onPress={onClose}>
              <Text className="text-sm text-muted">Done</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
            {isLoading ? (
              <View className="items-center py-6">
                <Text className="text-sm text-muted">Loading…</Text>
              </View>
            ) : children.length === 0 ? (
              <Text className="px-1 py-4 text-sm text-muted">
                No sub-sessions yet. Forks and subagent runs appear here.
              </Text>
            ) : (
              children.map((session) => (
                <Pressable
                  key={session.id}
                  className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
                  onPress={() => {
                    onClose();
                    onSelect(session.id);
                  }}
                >
                  <GitForkIcon size={16} color={colors.muted} />
                  <View className="flex-1">
                    <Text className="text-sm text-foreground" numberOfLines={1}>
                      {session.title || 'Untitled session'}
                    </Text>
                    <Text className="text-xs text-muted">
                      {relativeTime(session.time.updated)}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
