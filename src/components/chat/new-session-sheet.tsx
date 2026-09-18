import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, FolderIcon, FolderOpenIcon, XIcon } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/bottom-sheet';

import { useDismissedProjects } from '@/chat/dismissed-projects';
import type { OpencodeProject } from '@/chat/opencode';
import type { ServerConfig } from '@/chat/settings';
import { useDirectoryAutocomplete, useProjects } from '@/chat/use-workspace';
import { createClientFromServer } from '@/chat/use-opencode-providers';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export function folderName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed) {
    return 'server default folder';
  }
  const index = trimmed.lastIndexOf('/');
  return index <= 0 ? trimmed : trimmed.slice(index + 1);
}

/**
 * Folder chooser shown when starting a new session. Sessions are scoped to a
 * project folder on the server, so this is where that folder is picked —
 * either one the server already knows about or a new absolute path.
 */
export function NewSessionSheet({
  visible,
  onClose,
  server,
  currentDirectory,
  busy = false,
  onCreate,
  onCloseProject,
}: {
  visible: boolean;
  onClose: () => void;
  server: ServerConfig;
  currentDirectory: string;
  busy?: boolean;
  onCreate: (directory: string) => void;
  onCloseProject?: (project?: OpencodeProject) => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const colors = useThemeColors();
  const { confirm } = useDialog();
  const queryClient = useQueryClient();
  const keyboardHeight = useKeyboardHeight();
  const listMaxHeight =
    keyboardHeight > 0
      ? Math.max(100, height - keyboardHeight - 420)
      : Math.min(height * 0.35, 220);
  const projects = useProjects(server, visible);
  const { dismissed, dismissProject, undismissProject } = useDismissedProjects(server);
  const [manualPath, setManualPath] = useState('');
  const { suggestions, isLoading: isCompleting } = useDirectoryAutocomplete(
    server,
    manualPath,
    visible,
  );

  const known = useMemo(
    () => (projects.data ?? []).filter((project) => !dismissed.has(project.id)),
    [projects.data, dismissed],
  );
  const trimmedPath = manualPath.trim();
  const canUseManual = trimmedPath.startsWith('/') && trimmedPath.length > 1;

  const handleCreate = useCallback(
    (directory: string) => {
      const matching = (projects.data ?? []).find((p) => p.worktree === directory);
      if (matching) {
        undismissProject(matching.id);
      }
      onCreate(directory);
    },
    [onCreate, projects.data, undismissProject],
  );

  const handleCloseProject = useCallback(
    async (project: OpencodeProject) => {
      const isCurrent = project.worktree === currentDirectory;
      const name = folderName(project.worktree);
      const confirmed = await confirm({
        title: 'Close project',
        message: isCurrent
          ? `Close "${name}"? This will unload the active workspace and reset to the server default.`
          : `Close "${name}"? This will unload and remove this project from the workspace list.`,
        confirmLabel: 'Close project',
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      dismissProject(project.id);
      try {
        const client = createClientFromServer(server);
        await client.disposeInstance(project.worktree);
      } catch {
        // Best effort
      }
      if (isCurrent && onCloseProject) {
        await onCloseProject(project);
      }
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    [confirm, currentDirectory, dismissProject, onCloseProject, queryClient, server],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior="padding">
          <View
            style={{
              paddingBottom: insets.bottom + 16,
              paddingLeft: insets.left + 16,
              paddingRight: insets.right + 16,
            }}
          >
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-foreground">New session</Text>
              <Pressable hitSlop={8} onPress={onClose}>
                <Text className="text-sm text-muted">Cancel</Text>
              </Pressable>
            </View>
            <Text className="mb-3 text-xs text-muted">Choose the project folder for this session</Text>

            <Button disabled={busy} onPress={() => handleCreate(currentDirectory)}>
              {busy
                ? 'Creating…'
                : currentDirectory
                  ? `New session in ${folderName(currentDirectory)}`
                  : 'New session in server default folder'}
            </Button>

            <Text className="pb-2 pt-4 text-xs font-medium uppercase tracking-wide text-muted">
              Project folders
            </Text>

            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              keyboardShouldPersistTaps="handled"
            >
              {projects.isLoading ? (
                <View className="items-center py-6">
                  <Spinner size={18} />
                </View>
              ) : known.length === 0 ? (
                <Text className="py-4 text-sm text-muted">No project folders found</Text>
              ) : (
                known.map((project) => {
                  const isCurrent = project.worktree === currentDirectory;
                  return (
                    <View
                      key={project.id}
                      className={cn(
                        'mb-1 flex-row items-center gap-3 rounded-xl px-3 py-2',
                        isCurrent ? 'bg-surface-secondary' : 'bg-transparent',
                      )}
                    >
                      <Pressable
                        className="flex-1 flex-row items-center gap-3 py-0.5"
                        disabled={busy}
                        onPress={() => handleCreate(project.worktree)}
                      >
                        <FolderIcon size={16} color={colors.muted} />
                        <View className="flex-1">
                          <Text className="text-sm text-foreground" numberOfLines={1}>
                            {folderName(project.worktree)}
                          </Text>
                          <Text className="text-xs text-muted" numberOfLines={1} ellipsizeMode="head">
                            {project.worktree}
                          </Text>
                        </View>
                      </Pressable>
                      {isCurrent ? <CheckIcon size={16} color={colors.success} /> : null}
                      <Pressable
                        accessibilityLabel={`Close ${folderName(project.worktree)} project`}
                        accessibilityRole="button"
                        hitSlop={8}
                        className="rounded-lg p-1 active:bg-surface"
                        disabled={busy}
                        onPress={() => void handleCloseProject(project)}
                      >
                        <XIcon size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <Text className="pb-2 pt-4 text-xs font-medium uppercase tracking-wide text-muted">
              Other folder
            </Text>
            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3">
                <FolderOpenIcon size={16} color={colors.muted} />
                <TextInput
                  className="flex-1 py-2.5 text-sm text-foreground"
                  placeholder="/home/user/projects/app"
                  placeholderTextColor={colors.muted}
                  value={manualPath}
                  onChangeText={setManualPath}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {manualPath ? (
                  <Pressable hitSlop={8} onPress={() => setManualPath('')}>
                    <XIcon size={16} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
              <Button
                variant="outline"
                disabled={!canUseManual || busy}
                onPress={() => handleCreate(trimmedPath)}
              >
                Use
              </Button>
            </View>

            {suggestions.length > 0 ? (
              <View className="mt-2 overflow-hidden rounded-xl border border-border bg-surface-secondary">
                {suggestions.map((item, index) => (
                  <Pressable
                    key={item.absolute}
                    className={cn(
                      'flex-row items-center gap-2.5 px-3 py-2 active:bg-surface',
                      index < suggestions.length - 1 && 'border-b border-border/40',
                    )}
                    onPress={() => {
                      setManualPath(`${item.absolute}/`);
                    }}
                  >
                    <FolderIcon size={14} color={colors.muted} />
                    <Text className="flex-1 text-xs text-foreground" numberOfLines={1}>
                      <Text className="text-muted">
                        {item.absolute.slice(0, item.absolute.lastIndexOf('/') + 1)}
                      </Text>
                      <Text className="font-semibold text-foreground">{item.name}</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : isCompleting && manualPath.startsWith('/') ? (
              <View className="mt-2 items-center py-2">
                <Spinner size={14} />
              </View>
            ) : null}
          </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
