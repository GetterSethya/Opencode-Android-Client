import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { ArrowDownIcon, DownloadIcon } from 'lucide-react-native';
import {
  createContext,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  Share,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { UIMessage } from '@/chat/types';
import { setAdaptiveRenderMode } from '@/chat/adaptive-render';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

type ConversationContextValue = {
  isAtBottom: boolean;
  scrollToBottom: () => void;
};

const ConversationContext = createContext<ConversationContextValue | null>(null);

function useConversationContext() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('Conversation components must be used within <Conversation>');
  }
  return context;
}

export type ConversationProps = {
  messages: UIMessage[];
  renderItem: (props: LegendListRenderItemProps<UIMessage>) => ReactNode;
  className?: string;
  onStartReached?: () => void;
  isLoadingOlder?: boolean;
  hasMoreOlder?: boolean;
  ListHeaderComponent?: ComponentType<unknown> | ReactElement | null;
  ListFooterComponent?: ComponentType<unknown> | ReactElement | null;
};

export function Conversation({
  messages,
  renderItem,
  className,
  onStartReached,
  isLoadingOlder = false,
  hasMoreOlder = false,
  ListFooterComponent,
}: ConversationProps) {
  const listRef = useRef<LegendListRef | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    setIsAtBottom(distanceFromBottom < 48);
  }, []);

  const contextValue = useMemo(
    () => ({ isAtBottom, scrollToBottom }),
    [isAtBottom, scrollToBottom],
  );

  return (
    <ConversationContext.Provider value={contextValue}>
      <View className={cn('relative flex-1', className)}>
        <LegendList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={140}
          // Reusing item components keeps fast scrolling smooth; with it off
          // LegendList mounts every row from scratch, which drops frames badly
          // enough that rows appear blank until they finish rendering.
          recycleItems
          // LegendList's default pre-render buffer is only 250px. Chat rows are
          // tall, so a fast fling outruns rendering and rows show up blank
          // until they catch up. Render further ahead instead.
          drawDistance={2000}
          // Rows do markdown + syntax highlighting, which is far too slow to
          // render from scratch on every row a fast fling brings in. Tell rows
          // when we're flinging so they can render plain text instead.
          experimental_adaptiveRender={{
            enterVelocity: 2,
            exitVelocity: 0.5,
            exitDelay: 200,
            onChange: setAdaptiveRenderMode,
          }}
          maintainScrollAtEnd
          maintainVisibleContentPosition
          onStartReached={onStartReached}
          onStartReachedThreshold={0.2}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ gap: 24, padding: 16 }}
          style={{ flex: 1 }}
          ListHeaderComponent={
            isLoadingOlder ? (
              <View className="flex-row items-center justify-center gap-2 py-4">
                <Spinner size={14} />
                <Text className="text-xs text-muted">Loading older messages…</Text>
              </View>
            ) : hasMoreOlder ? (
              <View className="py-4" />
            ) : null
          }
          ListFooterComponent={ListFooterComponent}
          ListEmptyComponent={<ConversationEmptyState />}
        />
        <ConversationScrollButton />
      </View>
    </ConversationContext.Provider>
  );
}

export type ConversationEmptyStateProps = {
  title?: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
};

export function ConversationEmptyState({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
}: ConversationEmptyStateProps & { children?: ReactNode }) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-3 p-8', className)}>
      {children ?? (
        <>
          {icon}
          <Text className="text-sm font-medium text-foreground">{title}</Text>
          {description ? (
            <Text className="text-center text-sm text-muted">
              {description}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

export function ConversationScrollButton({ className }: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useConversationContext();
  const colors = useThemeColors();

  if (isAtBottom) {
    return null;
  }

  return (
    <View className="absolute bottom-4 left-0 right-0 items-center" pointerEvents="box-none">
      <Pressable
        accessibilityLabel="Scroll to bottom"
        className={cn(
          'h-9 w-9 items-center justify-center rounded-full border border-border bg-surface shadow',
          className,
        )}
        onPress={scrollToBottom}
      >
        <ArrowDownIcon size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function messagesToMarkdown(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
      return `**${role}:** ${getMessageText(message)}`;
    })
    .join('\n\n');
}

export type ConversationDownloadProps = {
  messages: UIMessage[];
  className?: string;
};

export function ConversationDownload({ messages, className }: ConversationDownloadProps) {
  const handleShare = useCallback(() => {
    Share.share({ message: messagesToMarkdown(messages) }).catch(() => undefined);
  }, [messages]);

  return (
    <Pressable
      accessibilityLabel="Share conversation"
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full border border-border bg-surface',
        className,
      )}
      onPress={handleShare}
    >
      <DownloadIcon size={16} color="#18181b" />
    </Pressable>
  );
}
