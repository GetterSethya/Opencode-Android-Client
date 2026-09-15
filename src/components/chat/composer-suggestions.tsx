import { FileIcon, TerminalIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ServerConfig } from '@/chat/settings';
import { useCommands, useFileSearch } from '@/chat/use-workspace';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';

export type ComposerTrigger =
  | { kind: 'command'; start: number; query: string }
  | { kind: 'file'; start: number; query: string };

/**
 * Finds an in-progress `/command` or `@file` token ending at the cursor.
 * Slash tokens start at a word boundary; mentions run to the next space.
 */
export function detectComposerTrigger(value: string, cursor: number): ComposerTrigger | null {
  const before = value.slice(0, cursor);
  const slash = before.match(/(^|\s)\/([A-Za-z0-9_-]*)$/);
  if (slash) {
    return { kind: 'command', start: cursor - slash[2].length - 1, query: slash[2] };
  }
  const mention = before.match(/@([^\s@]*)$/);
  if (mention) {
    return { kind: 'file', start: cursor - mention[1].length - 1, query: mention[1] };
  }
  return null;
}

export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index < 0 ? trimmed : trimmed.slice(index + 1);
}

/**
 * Inline picker for `/` slash commands and `@` file mentions, rendered
 * above the composer while the token is being typed. This is the mobile
 * equivalent of the TUI's `/` menu and ctrl+p file finder: picking a row
 * completes the token as text and the server expands it on submit.
 */
export function ComposerSuggestions({
  server,
  enabled,
  value,
  selection,
  onInsert,
}: {
  server: ServerConfig;
  enabled: boolean;
  value: string;
  selection: { start: number; end: number };
  onInsert: (next: string, cursor: number) => void;
}) {
  const colors = useThemeColors();
  // Tapping one of the composer's toolbar buttons blurs the input, after
  // which Android reports the selection as {0,0}. Fall back to the end of the
  // text so a `/` or `@` just inserted still opens the picker.
  const cursor = selection.end > 0 || value.length === 0 ? selection.end : value.length;
  const trigger = useMemo(
    () => (enabled ? detectComposerTrigger(value, cursor) : null),
    [enabled, value, cursor],
  );

  const commands = useCommands(server, trigger?.kind === 'command');

  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    if (trigger?.kind !== 'file') {
      setDebouncedQuery('');
      return;
    }
    const query = trigger.query;
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [trigger]);
  const files = useFileSearch(server, debouncedQuery, trigger?.kind === 'file');

  if (!trigger) {
    return null;
  }

  const pick = (replacement: string) => {
    const next = `${value.slice(0, trigger.start)}${replacement} ${value.slice(selection.end)}`;
    onInsert(next, trigger.start + replacement.length + 1);
  };

  if (trigger.kind === 'command') {
    const query = trigger.query.toLowerCase();
    const matches = (commands.data ?? []).filter(
      (command) => !query || command.name.toLowerCase().includes(query),
    );
    return (
      <View className="mb-2 overflow-hidden rounded-2xl border border-border bg-surface">
        <ScrollView
          style={{ maxHeight: 240 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          {commands.isLoading ? (
            <View className="items-center py-4">
              <Spinner size={16} />
            </View>
          ) : matches.length === 0 ? (
            <Text className="px-4 py-3 text-sm text-muted">
              {commands.isError ? 'Could not load commands' : 'No commands match'}
            </Text>
          ) : (
            matches.map((command) => (
              <Pressable
                key={command.name}
                className="flex-row items-center gap-3 px-3 py-2.5"
                onPress={() => pick(`/${command.name}`)}
              >
                <TerminalIcon size={16} color={colors.muted} />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground">/{command.name}</Text>
                  {command.description ? (
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {command.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  if (!trigger.query) {
    return (
      <View className="mb-2 rounded-2xl border border-border bg-surface px-4 py-3">
        <Text className="text-sm text-muted">Type to search files…</Text>
      </View>
    );
  }

  const results = files.data ?? [];
  return (
    <View className="mb-2 overflow-hidden rounded-2xl border border-border bg-surface">
      <ScrollView
        style={{ maxHeight: 240 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        {files.isFetching && results.length === 0 ? (
          <View className="items-center py-4">
            <Spinner size={16} />
          </View>
        ) : results.length === 0 ? (
          <Text className="px-4 py-3 text-sm text-muted">
            {files.isError ? 'Could not search files' : 'No files match'}
          </Text>
        ) : (
          results.map((path) => (
            <Pressable
              key={path}
              className="flex-row items-center gap-3 px-3 py-2.5"
              onPress={() => pick(`@${path}`)}
            >
              <FileIcon size={16} color={colors.muted} />
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {baseName(path)}
                </Text>
                <Text className="text-xs text-muted" numberOfLines={1} ellipsizeMode="head">
                  {path}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
