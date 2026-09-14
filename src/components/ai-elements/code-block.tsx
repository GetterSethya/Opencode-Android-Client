import { XIcon } from 'lucide-react-native';
import type { Language } from 'prism-react-renderer';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HighlightedCode,
  normalizeLanguage,
  truncateLongLines,
} from '@/components/ui/highlighted-code';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export type CodeBlockProps = {
  code: string;
  language?: string;
  className?: string;
};

/**
 * Renders short snippets in full. Longer than LONG_CODE_LINE_LIMIT, only a
 * preview is rendered inline and the rest opens in a virtualized full-screen
 * viewer: rendering every line (and its syntax tokens) as views hangs the UI
 * thread on long outputs such as tool results.
 */
const LONG_CODE_LINE_LIMIT = 100;
const PREVIEW_LINE_LIMIT = 40;
const CODE_ROW_HEIGHT = 18;
const CHUNK_SIZE = 50;

export function CodeBlock({ code, language = 'text', className }: CodeBlockProps) {
  const [fullOpen, setFullOpen] = useState(false);

  const { preview, lineCount, truncated } = useMemo(() => {
    const lines = code.split('\n');
    const isTruncated = lines.length > LONG_CODE_LINE_LIMIT;
    const shown = isTruncated ? lines.slice(0, PREVIEW_LINE_LIMIT).join('\n') : code;
    return {
      preview: truncateLongLines(shown),
      lineCount: lines.length,
      truncated: isTruncated,
    };
  }, [code]);

  const normalized = normalizeLanguage(language);

  return (
    <View className={cn('overflow-hidden rounded-md bg-surface-secondary', className)}>
      <View className="border-b border-border px-3 py-1.5">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted">{language}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="p-3">
          <HighlightedCode code={preview} language={normalized} selectable />
        </View>
      </ScrollView>
      {truncated ? (
        <View className="border-t border-border px-3 py-2">
          <Button variant="outline" size="sm" onPress={() => setFullOpen(true)}>
            {`View all ${lineCount} lines`}
          </Button>
        </View>
      ) : null}
      {truncated ? (
        <FullScreenCodeViewer
          visible={fullOpen}
          code={code}
          language={normalized}
          title={language}
          onClose={() => setFullOpen(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * Full-screen viewer for long code. Content is split into chunks so the list
 * stays virtualized with exact row offsets (fixed row height + getItemLayout).
 */
function FullScreenCodeViewer({
  visible,
  code,
  language,
  title,
  onClose,
}: {
  visible: boolean;
  code: string;
  language: Language;
  title: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const chunks = useMemo(() => {
    const lines = truncateLongLines(code).split('\n');
    const out: { start: number; code: string }[] = [];
    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      out.push({ start: i, code: lines.slice(i, i + CHUNK_SIZE).join('\n') });
    }
    return out;
  }, [code]);

  return (
    <Modal
      visible={visible}
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
            accessibilityLabel="Close code viewer"
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full"
            onPress={onClose}
          >
            <XIcon size={20} color={colors.foreground} />
          </Pressable>
          <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
            {title} · {code.split('\n').length} lines
          </Text>
        </View>
        <View className="flex-1 p-3">
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <FlatList
              data={chunks}
              keyExtractor={(chunk) => String(chunk.start)}
              renderItem={({ item }) => (
                <HighlightedCode code={item.code} language={language} lineHeight={CODE_ROW_HEIGHT} />
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
        </View>
      </View>
    </Modal>
  );
}
