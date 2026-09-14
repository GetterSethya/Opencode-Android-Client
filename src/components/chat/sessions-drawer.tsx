import {
  FolderIcon,
  MenuIcon,
  MessageSquareIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react-native';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  BackHandler,
  DrawerLayoutAndroid,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OpencodeSession } from '@/chat/opencode';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

const DRAWER_WIDTH = 320;
const RECENT_LIMIT = 10;

function relativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}

export type SessionsDrawerHandle = {
  open: () => void;
  close: () => void;
};

export type SessionsDrawerProps = {
  sessions: OpencodeSession[];
  activeSessionId: string | null;
  activeServerName?: string;
  /** Project folder the sessions belong to (shown under the header). */
  projectDirectory?: string;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onOpen?: () => void;
  children: ReactNode;
};

export const SessionsDrawer = forwardRef<SessionsDrawerHandle, SessionsDrawerProps>(
  function SessionsDrawer(
    {
      sessions,
      activeSessionId,
      activeServerName,
      projectDirectory,
      onSelect,
      onNewSession,
      onDeleteSession,
      onOpenSettings,
      onOpen,
      children,
    },
    ref,
  ) {
    const insets = useSafeAreaInsets();
    const colors = useThemeColors();
    const drawerRef = useRef<DrawerLayoutAndroid>(null);
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);

    const close = useCallback(() => {
      drawerRef.current?.closeDrawer();
    }, []);

    // Tracks whether the native drawer is open so the hardware back button
    // closes it instead of exiting the app.
    const openRef = useRef(false);

    useEffect(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (openRef.current) {
          drawerRef.current?.closeDrawer();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        open: () => drawerRef.current?.openDrawer(),
        close,
      }),
      [close],
    );

    const filtered = useMemo(() => {
      const search = query.trim().toLowerCase();
      if (!search) {
        return sessions;
      }
      return sessions.filter((session) => session.title.toLowerCase().includes(search));
    }, [sessions, query]);

    const visibleSessions = showAll ? filtered : filtered.slice(0, RECENT_LIMIT);

    const confirmDelete = useCallback(
      (session: OpencodeSession) => {
        Alert.alert('Delete session', `Delete "${session.title}"?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => onDeleteSession(session.id),
          },
        ]);
      },
      [onDeleteSession],
    );

    const renderNavigationView = useCallback(
      () => (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
            paddingLeft: insets.left,
          }}
        >
          <View className="flex-row items-center justify-between px-4 pb-2">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-foreground">Sessions</Text>
              {activeServerName ? (
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {activeServerName}
                </Text>
              ) : null}
            </View>
            <Pressable hitSlop={8} onPress={close}>
              <XIcon size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View className="gap-2 px-3 pb-2">
            <View className="flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3 py-2.5">
              <FolderIcon size={16} color={colors.muted} />
              <View className="flex-1">
                <Text className="text-xs text-muted">Project folder</Text>
                <Text className="text-sm text-foreground" numberOfLines={1} ellipsizeMode="head">
                  {projectDirectory || 'Server default'}
                </Text>
              </View>
            </View>
            <Pressable
              className="flex-row items-center justify-center gap-2 rounded-xl bg-foreground py-3"
              onPress={() => {
                onNewSession();
                close();
              }}
            >
              <PlusIcon size={18} color={colors.background} />
              <Text className="font-medium text-background">New session</Text>
            </Pressable>
          </View>

          <View className="mx-3 mb-2 flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3">
            <SearchIcon size={16} color={colors.muted} />
            <TextInput
              className="flex-1 py-2.5 text-sm text-foreground"
              placeholder="Search sessions"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
          </View>

          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
            <Text className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
              Recent
            </Text>
            {visibleSessions.length === 0 ? (
              <Text className="px-4 py-6 text-sm text-muted">No sessions found</Text>
            ) : (
              visibleSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <Pressable
                    key={session.id}
                    className={cn(
                      'mx-2 flex-row items-center gap-3 rounded-xl px-3 py-2.5',
                      isActive ? 'bg-surface-secondary' : 'bg-transparent',
                    )}
                    onPress={() => {
                      onSelect(session.id);
                      close();
                    }}
                    onLongPress={() => confirmDelete(session)}
                  >
                    <MessageSquareIcon size={18} color={isActive ? colors.foreground : colors.muted} />
                    <View className="flex-1">
                      <Text
                        className={cn(
                          'text-sm',
                          isActive ? 'font-semibold text-foreground' : 'text-foreground',
                        )}
                        numberOfLines={1}
                      >
                        {session.title || 'Untitled session'}
                      </Text>
                      <Text className="text-xs text-muted">
                        {relativeTime(session.time.updated)}
                      </Text>
                    </View>
                    {isActive ? (
                      <Trash2Icon size={16} color={colors.muted} onPress={() => confirmDelete(session)} />
                    ) : null}
                  </Pressable>
                );
              })
            )}

            {!showAll && filtered.length > RECENT_LIMIT ? (
              <Pressable
                className="mx-3 my-3 items-center rounded-xl border border-border py-2.5"
                onPress={() => setShowAll(true)}
              >
                <Text className="text-sm font-medium text-foreground">
                  Show more ({filtered.length - RECENT_LIMIT})
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <Pressable
            className="mx-3 flex-row items-center gap-2 rounded-xl border border-border px-3 py-3"
            onPressOut={() => {
              close();
              onOpenSettings();
            }}
          >
            <SettingsIcon size={18} color={colors.muted} />
            <Text className="text-sm font-medium text-foreground">Server settings</Text>
          </Pressable>
        </View>
      ),
      [
        colors.surface,
        colors.muted,
        colors.foreground,
        colors.background,
        insets.top,
        insets.bottom,
        insets.left,
        activeServerName,
        projectDirectory,
        visibleSessions,
        filtered.length,
        showAll,
        query,
        activeSessionId,
        confirmDelete,
        close,
        onNewSession,
        onSelect,
        onOpenSettings,
      ],
    );

    return (
      <DrawerLayoutAndroid
        ref={drawerRef}
        style={{ flex: 1 }}
        drawerWidth={DRAWER_WIDTH}
        drawerPosition="left"
        drawerBackgroundColor={colors.surface}
        keyboardDismissMode="on-drag"
        onDrawerOpen={() => {
          openRef.current = true;
          onOpen?.();
        }}
        onDrawerClose={() => {
          openRef.current = false;
        }}
        renderNavigationView={renderNavigationView}
      >
        {children}
      </DrawerLayoutAndroid>
    );
  },
);

export function HamburgerButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityLabel="Open sessions"
      className="h-9 w-9 items-center justify-center rounded-full"
      onPressOut={onPress}
    >
      <MenuIcon size={22} color={colors.foreground} />
    </Pressable>
  );
}
