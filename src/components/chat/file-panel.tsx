import {
  ChevronLeftIcon,
  FileIcon,
  FolderIcon,
  Maximize2Icon,
  XIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ServerConfig } from '@/chat/settings';
import { useFileContent, useFileList } from '@/chat/use-workspace';
import { Button } from '@/components/ui/button';
import { HighlightedCode, languageForPath } from '@/components/ui/highlighted-code';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export function parentPath(path: string): string {
  if (path === '.' || path === '') {
    return '.';
  }
  const trimmed = path.replace(/\/$/, '');
  const index = trimmed.lastIndexOf('/');
  return index <= 0 ? '.' : trimmed.slice(0, index);
}

export type FilePanelState = {
  dir: string;
  setDir: (dir: string) => void;
  file: string | undefined;
  setFile: (file: string | undefined) => void;
};

export function useFilePanelState(): FilePanelState {
  const [dir, setDir] = useState('.');
  const [file, setFile] = useState<string | undefined>(undefined);
  return { dir, setDir, file, setFile };
}

const PREVIEW_LINE_LIMIT = 50;
const CODE_ROW_HEIGHT = 18;

/**
 * Non-scrolling preview for the bottom sheet. Nesting scroll views inside the
 * sheet's own ScrollView breaks measurement, so the preview is capped and the
 * full file is read in the full-screen viewer instead.
 */
function FilePreview({
  server,
  path,
  onOpenFullScreen,
}: {
  server: ServerConfig;
  path: string;
  onOpenFullScreen: () => void;
}) {
  const query = useFileContent(server, path, true);

  const { preview, total } = useMemo(() => {
    const all = (query.data?.content ?? '').split('\n');
    return { preview: all.slice(0, PREVIEW_LINE_LIMIT), total: all.length };
  }, [query.data]);

  if (query.isLoading) {
    return (
      <View className="items-center py-10">
        <Spinner size={20} />
      </View>
    );
  }

  if (query.error) {
    return (
      <View className="gap-2">
        <Text className="text-sm text-danger">
          {query.error instanceof Error ? query.error.message : 'Request failed'}
        </Text>
        <Button variant="outline" size="sm" onPress={() => query.refetch()}>
          Retry
        </Button>
      </View>
    );
  }

  if (query.data?.type === 'binary') {
    return <Text className="py-8 text-center text-sm text-muted">Binary file not shown</Text>;
  }

  const truncated = total > PREVIEW_LINE_LIMIT;

  return (
    <View>
      <View className="overflow-hidden">
        <HighlightedCode
          code={preview.join('\n')}
          language={languageForPath(path)}
          showLineNumbers
          selectable
        />
      </View>
      {truncated ? (
        <Text className="px-1 py-2 text-xs text-muted">
          Showing first {PREVIEW_LINE_LIMIT} of {total} lines
        </Text>
      ) : null}
      <View className="pt-2">
        <Button onPress={onOpenFullScreen}>
          {truncated ? 'View full file' : 'Open full screen'}
        </Button>
      </View>
    </View>
  );
}

/**
 * Full-screen file viewer. The file is split into chunks so the list stays
 * virtualized (rendering every line at once hangs on large files) while each
 * visible chunk is syntax highlighted.
 */
const CHUNK_SIZE = 50;

function FullFileContent({ server, path }: { server: ServerConfig; path: string }) {
  const query = useFileContent(server, path, true);
  const language = useMemo(() => languageForPath(path), [path]);

  const chunks = useMemo(() => {
    const lines = (query.data?.content ?? '').split('\n');
    const out: { start: number; code: string }[] = [];
    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      out.push({ start: i, code: lines.slice(i, i + CHUNK_SIZE).join('\n') });
    }
    return out;
  }, [query.data]);

  if (query.isLoading) {
    return (
      <View className="items-center py-10">
        <Spinner size={20} />
      </View>
    );
  }

  if (query.error) {
    return (
      <View className="gap-2 px-3 py-4">
        <Text className="text-sm text-danger">
          {query.error instanceof Error ? query.error.message : 'Request failed'}
        </Text>
        <Button variant="outline" size="sm" onPress={() => query.refetch()}>
          Retry
        </Button>
      </View>
    );
  }

  if (query.data?.type === 'binary') {
    return <Text className="py-8 text-center text-sm text-muted">Binary file not shown</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <FlatList
        data={chunks}
        keyExtractor={(chunk) => String(chunk.start)}
        renderItem={({ item }) => (
          <HighlightedCode
            code={item.code}
            language={language}
            showLineNumbers
            startLine={item.start + 1}
            lineHeight={CODE_ROW_HEIGHT}
            selectable
          />
        )}
        getItemLayout={(_, index) => ({
          length: CODE_ROW_HEIGHT * CHUNK_SIZE,
          offset: CODE_ROW_HEIGHT * CHUNK_SIZE * index,
          index,
        })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        removeClippedSubviews
      />
    </ScrollView>
  );
}

/** Full-screen file viewer presented as its own screen. */
export function FullScreenFileViewer({
  server,
  path,
  onClose,
}: {
  server: ServerConfig;
  path: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <Modal
      visible={path !== null}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2.5">
          <Pressable
            accessibilityLabel="Close file"
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full"
            onPress={onClose}
          >
            <XIcon size={20} color={colors.foreground} />
          </Pressable>
          <Text
            className="flex-1 text-sm font-medium text-foreground"
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {path ?? ''}
          </Text>
        </View>
        <View className="flex-1">
          {path ? <FullFileContent server={server} path={path} /> : null}
        </View>
      </View>
    </Modal>
  );
}

export function FilePanel({
  server,
  state,
  onOpenFullScreen,
}: {
  server: ServerConfig;
  state: FilePanelState;
  onOpenFullScreen: (path: string) => void;
}) {
  const colors = useThemeColors();
  const { dir, setDir, file, setFile } = state;
  const query = useFileList(server, dir, !file);

  if (file) {
    return (
      <View>
        <View className="mb-3 flex-row items-center gap-2">
          <Pressable
            accessibilityLabel="Back to files"
            hitSlop={8}
            onPress={() => setFile(undefined)}
          >
            <ChevronLeftIcon size={18} color={colors.muted} />
          </Pressable>
          <Text
            className="flex-1 text-sm text-foreground"
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {file}
          </Text>
          <Pressable
            accessibilityLabel="Open full screen"
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-full border border-border"
            onPress={() => onOpenFullScreen(file)}
          >
            <Maximize2Icon size={14} color={colors.foreground} />
          </Pressable>
        </View>
        <FilePreview
          server={server}
          path={file}
          onOpenFullScreen={() => onOpenFullScreen(file)}
        />
      </View>
    );
  }

  const entries = (query.data ?? []).slice().sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <View>
      <View className="mb-2 flex-row items-center gap-2">
        {dir !== '.' ? (
          <Pressable
            accessibilityLabel="Parent directory"
            hitSlop={8}
            onPress={() => setDir(parentPath(dir))}
          >
            <ChevronLeftIcon size={18} color={colors.muted} />
          </Pressable>
        ) : null}
        <Text className="flex-1 text-sm text-muted" numberOfLines={1} ellipsizeMode="head">
          {dir === '.' ? 'Project root' : dir}
        </Text>
      </View>

      {query.isLoading ? (
        <View className="items-center py-10">
          <Spinner size={20} />
        </View>
      ) : query.error ? (
        <View className="gap-2">
          <Text className="text-sm text-danger">
            {query.error instanceof Error ? query.error.message : 'Request failed'}
          </Text>
          <Button variant="outline" size="sm" onPress={() => query.refetch()}>
            Retry
          </Button>
        </View>
      ) : entries.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">Empty directory</Text>
      ) : (
        <View>
          {entries.map((entry) => (
            <Pressable
              key={entry.path}
              className="flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-surface-secondary"
              onPress={() => {
                if (entry.type === 'directory') {
                  setDir(entry.path.replace(/\/$/, ''));
                  return;
                }
                setFile(entry.path);
              }}
            >
              {entry.type === 'directory' ? (
                <FolderIcon size={16} color={colors.muted} />
              ) : (
                <FileIcon size={16} color={colors.muted} />
              )}
              <Text
                className={cn('flex-1 text-sm', entry.ignored ? 'text-muted' : 'text-foreground')}
                numberOfLines={1}
              >
                {entry.name}
              </Text>
              {entry.ignored ? <Text className="text-xs text-muted">ignored</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
