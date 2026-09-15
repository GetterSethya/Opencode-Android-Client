import { FileIcon, SearchIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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
import { useFileSearch } from '@/chat/use-workspace';
import { Spinner } from '@/components/ui/spinner';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';

import { baseName } from './composer-suggestions';

/**
 * Mobile equivalent of the TUI's ctrl+p file finder: a bottom sheet with a
 * search field backed by the server's fuzzy file search. Picking a file
 * inserts an `@path` mention into the composer; the server expands the
 * reference when the prompt is submitted.
 */
export function QuickOpenSheet({
  visible,
  onClose,
  server,
  onInsertMention,
}: {
  visible: boolean;
  onClose: () => void;
  server: ServerConfig;
  onInsertMention: (path: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const colors = useThemeColors();
  const keyboardHeight = useKeyboardHeight();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [visible]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useFileSearch(server, debouncedQuery, visible);
  const results = search.data ?? [];
  const listMaxHeight =
    keyboardHeight > 0
      ? Math.max(160, height - keyboardHeight - 300)
      : Math.min(height * 0.5, 400);

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
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-foreground">Find file</Text>
              <Pressable hitSlop={8} onPress={onClose}>
                <Text className="text-sm text-muted">Cancel</Text>
              </Pressable>
            </View>

            <View className="mb-2 flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3">
              <SearchIcon size={16} color={colors.muted} />
              <TextInput
                className="flex-1 py-2.5 text-sm text-foreground"
                placeholder="Search files by name…"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>

            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              keyboardShouldPersistTaps="handled"
            >
              {!debouncedQuery ? (
                <Text className="px-1 py-4 text-sm text-muted">
                  Type to search files in the project folder
                </Text>
              ) : search.isFetching && results.length === 0 ? (
                <View className="items-center py-6">
                  <Spinner size={18} />
                </View>
              ) : results.length === 0 ? (
                <Text className="px-1 py-4 text-sm text-muted">
                  {search.isError ? 'Could not search files' : 'No files match'}
                </Text>
              ) : (
                results.map((path) => (
                  <Pressable
                    key={path}
                    className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
                    onPress={() => {
                      onInsertMention(path);
                      onClose();
                    }}
                  >
                    <FileIcon size={16} color={colors.muted} />
                    <View className="flex-1">
                      <Text className="text-sm text-foreground" numberOfLines={1}>
                        {baseName(path)}
                      </Text>
                      <Text
                        className="text-xs text-muted"
                        numberOfLines={1}
                        ellipsizeMode="head"
                      >
                        {path}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Text className="px-1 pt-2 text-xs text-muted">
              Tap a file to mention it in your message
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
