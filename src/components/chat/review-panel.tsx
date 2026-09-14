import { ChevronDownIcon, ChevronRightIcon, Maximize2Icon, XIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { VcsFileDiff } from '@/chat/opencode';
import type { ServerConfig } from '@/chat/settings';
import { useVcsDiff } from '@/chat/use-workspace';
import { Button } from '@/components/ui/button';
import { classifyError, ErrorState } from '@/components/ui/error-state';
import { MAX_RENDERED_LINE_LENGTH } from '@/components/ui/highlighted-code';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

/** Fixed row height lets the list virtualize with getItemLayout (no measurement). */
const DIFF_ROW_HEIGHT = 18;
const PREVIEW_LINE_LIMIT = 40;

type DiffLineKind = 'add' | 'del' | 'meta' | 'hunk' | 'context';

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('@@')) {
    return 'hunk';
  }
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename ')
  ) {
    return 'meta';
  }
  if (line.startsWith('+')) {
    return 'add';
  }
  if (line.startsWith('-')) {
    return 'del';
  }
  return 'context';
}

/** Strips the `diff --git`/`index`/`---`/`+++` preamble, keeping hunks. */
export function diffBodyLines(patch: string): string[] {
  const lines = patch.split('\n');
  const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
  return firstHunk === -1 ? lines : lines.slice(firstHunk);
}

function DiffLine({ line }: { line: string }) {
  const kind = classifyDiffLine(line);
  // Minified single-line files pack megabytes into one diff line; cap what a
  // row renders (same bound as highlighted code) so giant rows can't OOM us.
  const rendered =
    line.length > MAX_RENDERED_LINE_LENGTH ? `${line.slice(0, MAX_RENDERED_LINE_LENGTH)}…` : line;
  return (
    <View
      style={{ height: DIFF_ROW_HEIGHT }}
      className={cn(
        'justify-center px-2',
        kind === 'add' && 'bg-success/15',
        kind === 'del' && 'bg-danger/15',
        kind === 'hunk' && 'bg-surface-secondary',
      )}
    >
      <Text
        numberOfLines={1}
        className={cn(
          'font-mono text-xs',
          kind === 'add' && 'text-success',
          kind === 'del' && 'text-danger',
          kind === 'hunk' && 'text-muted',
          kind === 'meta' && 'text-muted',
          kind === 'context' && 'text-foreground',
        )}
      >
        {rendered.length > 0 ? rendered : ' '}
      </Text>
    </View>
  );
}

/**
 * Non-scrolling capped preview for the sheet. Rendering a whole patch inline
 * creates thousands of views and hangs the app, so long diffs open full screen.
 */
function DiffPreview({ patch, onOpenFullScreen }: { patch: string; onOpenFullScreen: () => void }) {
  const lines = useMemo(() => diffBodyLines(patch), [patch]);
  const preview = lines.slice(0, PREVIEW_LINE_LIMIT);
  const truncated = lines.length > PREVIEW_LINE_LIMIT;

  return (
    <View className="px-1 py-1">
      <View className="overflow-hidden">
        {preview.map((line, index) => (
          <DiffLine key={index} line={line} />
        ))}
      </View>
      {truncated ? (
        <Text className="px-2 py-2 text-xs text-muted">
          Showing first {PREVIEW_LINE_LIMIT} of {lines.length} lines
        </Text>
      ) : null}
      <View className="px-1 pt-2">
        <Button variant="outline" size="sm" onPress={onOpenFullScreen}>
          {truncated ? 'View full diff' : 'Open full screen'}
        </Button>
      </View>
    </View>
  );
}

/** Full-screen diff: virtualized with fixed row height + horizontal panning. */
export function FullScreenDiffViewer({
  diff,
  onClose,
}: {
  diff: VcsFileDiff | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();

  const lines = useMemo(() => (diff?.patch ? diffBodyLines(diff.patch) : []), [diff]);
  const longest = useMemo(
    () => lines.reduce((max, line) => Math.max(max, line.length), 0),
    [lines],
  );
  // Monospace ~7px/char at text-xs; keep at least full width. Rows render
  // truncated (see DiffLine), so width is computed on the capped length.
  const contentWidth = Math.max(width, Math.min(longest, MAX_RENDERED_LINE_LENGTH) * 7 + 24);

  return (
    <Modal
      visible={diff !== null}
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
            accessibilityLabel="Close diff"
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
            {diff?.file ?? ''}
          </Text>
          {diff && diff.additions > 0 ? (
            <Text className="font-mono text-xs text-success">+{diff.additions}</Text>
          ) : null}
          {diff && diff.deletions > 0 ? (
            <Text className="font-mono text-xs text-danger">-{diff.deletions}</Text>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ width: contentWidth }}>
            <FlatList
              data={lines}
              keyExtractor={(_, index) => String(index)}
              renderItem={({ item }) => <DiffLine line={item} />}
              getItemLayout={(_, index) => ({
                length: DIFF_ROW_HEIGHT,
                offset: DIFF_ROW_HEIGHT * index,
                index,
              })}
              initialNumToRender={60}
              maxToRenderPerBatch={40}
              windowSize={11}
              removeClippedSubviews
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function FileRow({
  diff,
  onOpenFullScreen,
}: {
  diff: VcsFileDiff;
  onOpenFullScreen: (diff: VcsFileDiff) => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const hasPatch = !!diff.patch && diff.patch.trim().length > 0;

  return (
    <View className="mb-2 overflow-hidden rounded-xl border border-border">
      <Pressable
        className="flex-row items-center gap-2 px-3 py-2.5"
        onPress={() => setExpanded((prev) => !prev)}
        disabled={!hasPatch}
      >
        {hasPatch ? (
          expanded ? (
            <ChevronDownIcon size={14} color={colors.muted} />
          ) : (
            <ChevronRightIcon size={14} color={colors.muted} />
          )
        ) : (
          <View style={{ width: 14 }} />
        )}
        <Text className="flex-1 text-sm text-foreground" numberOfLines={1} ellipsizeMode="head">
          {diff.file}
        </Text>
        {diff.additions > 0 ? (
          <Text className="font-mono text-xs text-success">+{diff.additions}</Text>
        ) : null}
        {diff.deletions > 0 ? (
          <Text className="font-mono text-xs text-danger">-{diff.deletions}</Text>
        ) : null}
        {hasPatch ? (
          <Pressable
            accessibilityLabel="Open diff full screen"
            hitSlop={8}
            className="h-7 w-7 items-center justify-center rounded-full"
            onPress={() => onOpenFullScreen(diff)}
          >
            <Maximize2Icon size={13} color={colors.muted} />
          </Pressable>
        ) : null}
      </Pressable>
      {expanded && hasPatch ? (
        <View className="border-t border-border bg-surface">
          <DiffPreview
            patch={diff.patch as string}
            onOpenFullScreen={() => onOpenFullScreen(diff)}
          />
        </View>
      ) : null}
    </View>
  );
}

export function ReviewPanel({
  server,
  onOpenFullScreen,
  listHeight,
}: {
  server: ServerConfig;
  onOpenFullScreen: (diff: VcsFileDiff) => void;
  listHeight: number;
}) {
  const query = useVcsDiff(server, true);

  const totals = useMemo(() => {
    const diffs = query.data ?? [];
    return diffs.reduce(
      (acc, diff) => ({
        additions: acc.additions + (diff.additions ?? 0),
        deletions: acc.deletions + (diff.deletions ?? 0),
      }),
      { additions: 0, deletions: 0 },
    );
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
      <ErrorState
        compact
        kind={classifyError(query.error)}
        message={query.error instanceof Error ? query.error.message : 'Request failed'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const diffs = query.data ?? [];

  if (diffs.length === 0) {
    return (
      <View className="items-center gap-1 py-10">
        <Text className="text-sm font-medium text-foreground">No changes</Text>
        <Text className="text-center text-sm text-muted">
          The working tree is clean for this project.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View className="mb-3 flex-row items-center gap-3">
        <Text className="text-sm text-muted">
          {diffs.length} {diffs.length === 1 ? 'file' : 'files'} changed
        </Text>
        <Text className="font-mono text-xs text-success">+{totals.additions}</Text>
        <Text className="font-mono text-xs text-danger">-{totals.deletions}</Text>
      </View>
      <FlatList
        style={{ height: listHeight }}
        data={diffs}
        keyExtractor={(diff) => diff.file}
        renderItem={({ item }) => (
          <FileRow diff={item} onOpenFullScreen={onOpenFullScreen} />
        )}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}
