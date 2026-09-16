import { ArrowDownIcon, DownloadIcon } from 'lucide-react-native';
import {
  createContext,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItem,
  Pressable,
  Share,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { UIMessage } from '@/chat/types';
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
  renderItem: ListRenderItem<UIMessage>;
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
  const listRef = useRef<FlatList<UIMessage> | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // FlatList has no onStartReached, so latch the callback until the user
  // scrolls away from the top and back to avoid firing it on every scroll event.
  const startReachedRef = useRef(false);
  // Auto-follow is active whenever the user is near the bottom.
  // Scrolling up unpins; scrolling back to the bottom re-pins.
  const pinnedToBottomRef = useRef(true);
  // While the user is actively dragging the screen, auto-scroll is completely
  // disabled so it never fights the user's finger.
  const isDraggingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    isDraggingRef.current = false;
    pinnedToBottomRef.current = true;
    setIsAtBottom(true);
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const scrollToEndIfPinned = useCallback((animated = false) => {
    if (pinnedToBottomRef.current && !isDraggingRef.current) {
      listRef.current?.scrollToEnd({ animated });
    }
  }, []);

  // Returns true when the list is scrolled within ~one row of the end.
  const computeAtBottom = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    return contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const atBottom = computeAtBottom(event);
      setIsAtBottom(atBottom);
      if (atBottom && !isDraggingRef.current) {
        pinnedToBottomRef.current = true;
      }

      // Only trigger loading older messages when the user has explicitly
      // scrolled up to the top and the list actually has scrollable content.
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      if (!onStartReached || pinnedToBottomRef.current || contentSize.height <= layoutMeasurement.height) {
        return;
      }

      const distanceFromTop = contentOffset.y;
      if (distanceFromTop <= 0) {
        if (!startReachedRef.current) {
          startReachedRef.current = true;
          onStartReached();
        }
      } else if (distanceFromTop > 100) {
        startReachedRef.current = false;
      }
    },
    [computeAtBottom, onStartReached],
  );

  const handleScrollBeginDrag = useCallback(() => {
    // Immediately unpin and lock out programmatic scrolling while user drags.
    isDraggingRef.current = true;
    pinnedToBottomRef.current = false;
  }, []);

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDraggingRef.current = false;
      const atBottom = computeAtBottom(event);
      pinnedToBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    },
    [computeAtBottom],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDraggingRef.current = false;
      const atBottom = computeAtBottom(event);
      pinnedToBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    },
    [computeAtBottom],
  );

  const handleContentSizeChange = useCallback(() => {
    scrollToEndIfPinned();
  }, [scrollToEndIfPinned]);

  useEffect(() => {
    scrollToEndIfPinned();
  }, [messages, scrollToEndIfPinned]);

  const contextValue = useMemo(
    () => ({ isAtBottom, scrollToBottom }),
    [isAtBottom, scrollToBottom],
  );

  return (
    <ConversationContext.Provider value={contextValue}>
      <View className={cn('relative flex-1', className)}>
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onContentSizeChange={handleContentSizeChange}
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
