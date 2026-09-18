import {
  ChevronLeftIcon,
  CornerUpLeftIcon,
  CpuIcon,
  FolderOpenIcon,
  FolderXIcon,
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
import Svg, { Path } from 'react-native-svg';
import {
  memo,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
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
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { markInteractionPaint } from '@/lib/interaction-perf';
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

export const SessionPanelSheet = memo(function SessionPanelSheet({
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
    <BottomSheet
      visible={panel !== null}
      onClose={handleRequestClose}
      interactionName={panel ? `menu_to_${panel}` : undefined}
    >
      <KeyboardAvoidingView behavior="padding">
        <View
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
    </BottomSheet>
  );
});

interface MenuItem {
  key: string;
  icon: typeof SparklesIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
}

const disabledRowStyle = { opacity: 0.5 };

/** Header overflow menu replacing the model pill. */
export type SessionMenuSheetHandle = {
  open: () => void;
  close: () => void;
  closeImmediate: () => void;
};

export const SessionMenuSheet = memo(forwardRef<
  SessionMenuSheetHandle,
  {
    onClose?: () => void;
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
    projectDirectory?: string;
    onCloseProject?: () => void;
  }
>(function SessionMenuSheet(
  {
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
    projectDirectory,
    onCloseProject,
  },
  ref,
) {
  // Drawer-style: visibility lives inside the sheet so opening it never
  // re-renders the parent chat tree (zero list reconciliation, like
  // DrawerLayoutAndroid's imperative openDrawer()).
  // NOTE: close() must not invoke onClose here — the parent's onClose
  // handler calls close() back, which would recurse infinitely.
  const [visible, setVisible] = useState(false);
  const [animated, setAnimated] = useState(true);
  const open = useCallback(() => {
    setAnimated(true);
    setVisible(true);
  }, []);
  const close = useCallback(() => {
    setAnimated(true);
    setVisible(false);
  }, []);
  const closeImmediate = useCallback(() => {
    setAnimated(false);
    setVisible(false);
  }, []);
  useImperativeHandle(ref, () => ({ open, close, closeImmediate }), [open, close, closeImmediate]);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const handleReview = useCallback(() => onOpenPanel('review'), [onOpenPanel]);
  const handleContext = useCallback(() => onOpenPanel('context'), [onOpenPanel]);
  const handleFiles = useCallback(() => onOpenPanel('files'), [onOpenPanel]);

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [
      {
        key: 'model',
        icon: SparklesIcon,
        label: 'Model',
        hint: modelLabel,
        onPress: onSelectModel,
      },
      {
        key: 'review',
        icon: GitCompareIcon,
        label: 'Review changes',
        hint: 'Working tree diff',
        onPress: handleReview,
      },
      {
        key: 'context',
        icon: CpuIcon,
        label: 'Context',
        hint: 'Token usage',
        onPress: handleContext,
      },
      {
        key: 'files',
        icon: FolderOpenIcon,
        label: 'Open file',
        hint: 'Browse project',
        onPress: handleFiles,
      },
      {
        key: 'fork',
        icon: GitForkIcon,
        label: 'Fork session',
        hint: isForking ? 'Forking…' : 'Duplicate this session',
        onPress: onForkSession,
        disabled: forkDisabled || isForking,
      },
      {
        key: 'undo',
        icon: Undo2Icon,
        label: 'Undo last message',
        hint: 'Truncate history',
        onPress: onUndo,
        disabled: historyDisabled,
      },
      {
        key: 'redo',
        icon: Redo2Icon,
        label: 'Redo',
        hint: 'Restore undone messages',
        onPress: onRedo,
        disabled: historyDisabled,
      },
      {
        key: 'share',
        icon: Share2Icon,
        label: shared ? 'Copy share link' : 'Share session',
        hint: shareHint,
        onPress: onShare,
      },
    ];

    if (shared) {
      items.push({
        key: 'unshare',
        icon: Link2OffIcon,
        label: 'Unshare session',
        hint: 'Take the link down',
        onPress: onUnshare,
      });
    }

    items.push(
      {
        key: 'summarize',
        icon: ShrinkIcon,
        label: 'Summarize',
        hint: 'Compact into a summary',
        onPress: onSummarize,
        disabled: historyDisabled,
      },
      {
        key: 'children',
        icon: ListTreeIcon,
        label: 'Sub-sessions',
        hint:
          childCount === undefined
            ? 'Forks and subagent runs'
            : childCount === 0
              ? 'None yet'
              : `${childCount} session${childCount === 1 ? '' : 's'}`,
        onPress: onOpenChildren,
      },
    );

    if (onOpenParent) {
      items.push({
        key: 'parent',
        icon: CornerUpLeftIcon,
        label: 'Parent session',
        hint: 'Back to the spawning session',
        onPress: onOpenParent,
      });
    }

    if (projectDirectory && onCloseProject) {
      items.push({
        key: 'close-project',
        icon: FolderXIcon,
        label: 'Close project',
        hint: 'Unload current workspace',
        onPress: onCloseProject,
      });
    }

    return items;
  }, [
    modelLabel,
    onSelectModel,
    handleReview,
    handleContext,
    handleFiles,
    isForking,
    onForkSession,
    forkDisabled,
    onUndo,
    historyDisabled,
    onRedo,
    shared,
    shareHint,
    onShare,
    onUnshare,
    onSummarize,
    childCount,
    onOpenChildren,
    onOpenParent,
    projectDirectory,
    onCloseProject,
  ]);

  const iconColor = colors.foreground;
  const chevronColor = colors.muted;

  return (
    <BottomSheet visible={visible} onClose={close} animated={animated}>
      <View
        style={{
          paddingBottom: insets.bottom + 16,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
        }}
      >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-foreground">Session</Text>
            <Pressable hitSlop={8} onPress={close}>
              <Text className="text-sm text-muted">Done</Text>
            </Pressable>
          </View>

        <ScrollView
          style={{ maxHeight: 480 }}
          contentContainerStyle={{ gap: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {menuItems.map((item) => (
            <MenuRow
              key={item.key}
              icon={item.icon}
              label={item.label}
              hint={item.hint}
              onPress={item.onPress}
              disabled={item.disabled}
              iconColor={iconColor}
              chevronColor={chevronColor}
            />
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}));

function MenuChevron({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

const MenuRow = memo(function MenuRow({
  icon: Icon,
  label,
  hint,
  onPress,
  disabled,
  iconColor,
  chevronColor,
}: {
  icon: typeof SparklesIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  iconColor: string;
  chevronColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      unstable_pressDelay={0}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3.5 active:bg-surface-secondary"
      onPress={onPress}
      disabled={disabled}
      style={disabled ? disabledRowStyle : undefined}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-secondary">
        <Icon size={18} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {hint ? (
          <Text className="text-xs text-muted" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <MenuChevron color={chevronColor} />
    </Pressable>
  );
});

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
export const ChildSessionsSheet = memo(function ChildSessionsSheet({
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
    <BottomSheet visible={visible} onClose={onClose}>
      <View
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
    </BottomSheet>
  );
});
