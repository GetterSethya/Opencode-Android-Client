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
  ListEmptyComponent?: ComponentType<unknown> | ReactElement | null;
};

export function Conversation({
  messages,
  renderItem,
  className,
  onStartReached,
  isLoadingOlder = false,
  hasMoreOlder = false,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
}: ConversationProps) {
  const listRef = useRef<FlatList<UIMessage> | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Inverted data: newest messages are at index 0 (bottom of screen)
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const scrollToBottom = useCallback(() => {
    setIsAtBottom(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = event.nativeEvent;
      // In an inverted list, offset < 48 is at the bottom (newest items).
      const atBottom = contentOffset.y < 48;
      setIsAtBottom(atBottom);
    },
    [],
  );

  const handleEndReached = useCallback(() => {
    if (hasMoreOlder && !isLoadingOlder && onStartReached) {
      onStartReached();
    }
  }, [hasMoreOlder, isLoadingOlder, onStartReached]);

  const contextValue = useMemo(
    () => ({ isAtBottom, scrollToBottom }),
    [isAtBottom, scrollToBottom],
  );

  if (messages.length === 0) {
    return (
      <ConversationContext.Provider value={contextValue}>
        <View className={cn('relative flex-1', className)}>
          {ListEmptyComponent ? (
            typeof ListEmptyComponent === 'function' ? (
              <ListEmptyComponent />
            ) : (
              ListEmptyComponent
            )
          ) : (
            <ConversationEmptyState />
          )}
        </View>
      </ConversationContext.Provider>
    );
  }

  return (
    <ConversationContext.Provider value={contextValue}>
      <View className={cn('relative flex-1', className)}>
        <FlatList
          ref={listRef}
          data={reversedMessages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          inverted
          onScroll={handleScroll}
          scrollEventThrottle={16}
          windowSize={7}
          maxToRenderPerBatch={5}
          removeClippedSubviews
          contentContainerStyle={{ gap: 24, padding: 16 }}
          style={{ flex: 1 }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={ListFooterComponent}
          ListFooterComponent={
            isLoadingOlder ? (
              <View className="flex-row items-center justify-center gap-2 py-4">
                <Spinner size={14} />
                <Text className="text-xs text-muted">Loading older messages…</Text>
              </View>
            ) : hasMoreOlder ? (
              <View className="py-4" />
            ) : null
          }
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
