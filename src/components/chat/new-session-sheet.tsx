import { CheckIcon, FolderIcon, FolderOpenIcon } from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ServerConfig } from '@/chat/settings';
import { useProjects } from '@/chat/use-workspace';
import { Button } from '@/components/ui/button';
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
}: {
  visible: boolean;
  onClose: () => void;
  server: ServerConfig;
  currentDirectory: string;
  busy?: boolean;
  onCreate: (directory: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const colors = useThemeColors();
  const keyboardHeight = useKeyboardHeight();
  const listMaxHeight =
    keyboardHeight > 0
      ? Math.max(120, height - keyboardHeight - 380)
      : Math.min(height * 0.45, 260);
  const projects = useProjects(server, visible);
  const [manualPath, setManualPath] = useState('');

  const known = projects.data ?? [];
  const trimmedPath = manualPath.trim();
  const canUseManual = trimmedPath.startsWith('/') && trimmedPath.length > 1;

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
              <Text className="text-lg font-semibold text-foreground">New session</Text>
              <Pressable hitSlop={8} onPress={onClose}>
                <Text className="text-sm text-muted">Cancel</Text>
              </Pressable>
            </View>
            <Text className="mb-3 text-xs text-muted">Choose the project folder for this session</Text>

            <Button disabled={busy} onPress={() => onCreate(currentDirectory)}>
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
                    <Pressable
                      key={project.id}
                      className={cn(
                        'mb-1 flex-row items-center gap-3 rounded-xl px-3 py-2.5',
                        isCurrent ? 'bg-surface-secondary' : 'bg-transparent',
                      )}
                      disabled={busy}
                      onPress={() => onCreate(project.worktree)}
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
                      {isCurrent ? <CheckIcon size={16} color={colors.success} /> : null}
                    </Pressable>
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
              </View>
              <Button
                variant="outline"
                disabled={!canUseManual || busy}
                onPress={() => onCreate(trimmedPath)}
              >
                Use
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
