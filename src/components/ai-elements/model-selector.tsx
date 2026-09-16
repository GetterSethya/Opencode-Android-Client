import { SearchIcon } from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ImageStyle,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';

import { useControllableState } from '@/hooks/use-controllable-state';
import { cn } from '@/lib/utils';

type ModelSelectorContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  matchCount: number;
  registerMatch: (id: string, matches: boolean) => void;
  unregisterMatch: (id: string) => void;
};

const ModelSelectorContext = createContext<ModelSelectorContextValue | null>(null);

export function useModelSelector() {
  const context = useContext(ModelSelectorContext);
  if (!context) {
    throw new Error('ModelSelector components must be used within <ModelSelector>');
  }
  return context;
}

export type ModelSelectorProps = ViewProps & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
};

export function ModelSelector({
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
  ...props
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const matchesRef = useRef<Map<string, boolean>>(new Map());

  const registerMatch = useCallback((id: string, matches: boolean) => {
    if (matchesRef.current.get(id) === matches) {
      return;
    }
    matchesRef.current.set(id, matches);
    setMatchCount(Array.from(matchesRef.current.values()).filter(Boolean).length);
  }, []);

  const unregisterMatch = useCallback((id: string) => {
    if (matchesRef.current.delete(id)) {
      setMatchCount(Array.from(matchesRef.current.values()).filter(Boolean).length);
    }
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setIsOpen(next);
      if (!next) {
        setQuery('');
      }
    },
    [setIsOpen],
  );

  const contextValue = useMemo<ModelSelectorContextValue>(
    () => ({
      matchCount,
      open: isOpen,
      query,
      registerMatch,
      setOpen: handleOpenChange,
      setQuery,
      unregisterMatch,
    }),
    [handleOpenChange, isOpen, matchCount, query, registerMatch, unregisterMatch],
  );

  return (
    <ModelSelectorContext.Provider value={contextValue}>
      <View className={className} {...props}>
        {children}
      </View>
    </ModelSelectorContext.Provider>
  );
}

export type ModelSelectorTriggerProps = PressableProps & {
  children?: ReactNode;
};

export function ModelSelectorTrigger({
  className,
  children,
  onPress,
  ...props
}: ModelSelectorTriggerProps) {
  const { setOpen } = useModelSelector();

  return (
    <Pressable
      accessibilityRole="button"
      className={cn('flex-row items-center gap-2', className)}
      onPress={(event) => {
        onPress?.(event);
        setOpen(true);
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
}

export type ModelSelectorContentProps = {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  onRequestClose?: () => void;
};

export function ModelSelectorContent({
  title = 'Model Selector',
  className,
  children,
  onRequestClose,
}: ModelSelectorContentProps) {
  const { open, setOpen } = useModelSelector();

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        onRequestClose?.();
        setOpen(false);
      }}
      transparent
      visible={open}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
        <Pressable
          accessibilityViewIsModal
          className={cn('max-h-[75%] rounded-t-2xl bg-surface p-2', className)}
          onPress={() => {
            // Keep taps inside the panel from dismissing the modal.
          }}
        >
          <Text style={{ display: 'none' }}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export type ModelSelectorDialogProps = ModelSelectorContentProps;

export function ModelSelectorDialog(props: ModelSelectorDialogProps) {
  return <ModelSelectorContent {...props} />;
}

export type ModelSelectorInputProps = TextInputProps & {
  className?: string;
};

export function ModelSelectorInput({
  className,
  value,
  onChangeText,
  placeholder = 'Search models...',
  ...props
}: ModelSelectorInputProps) {
  const { query, setQuery } = useModelSelector();

  return (
    <View className="flex-row items-center gap-2 border-b border-border px-3">
      <SearchIcon size={16} color="#71717a" />
      <TextInput
        className={cn('h-11 flex-1 text-sm text-foreground', className)}
        onChangeText={(text) => {
          setQuery(text);
          onChangeText?.(text);
        }}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value ?? query}
        {...props}
      />
    </View>
  );
}

export type ModelSelectorListProps = {
  children?: ReactNode;
  className?: string;
};

export function ModelSelectorList({ className, children }: ModelSelectorListProps) {
  return (
    <ScrollView
      className={cn('max-h-80', className)}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export type ModelSelectorEmptyProps = {
  children?: ReactNode;
  className?: string;
};

export function ModelSelectorEmpty({ className, children }: ModelSelectorEmptyProps) {
  const { matchCount, query } = useModelSelector();

  if (query.trim().length === 0 || matchCount > 0) {
    return null;
  }

  return (
    <View className={cn('items-center justify-center p-4', className)}>
      {children ?? <Text className="text-sm text-muted">No results found.</Text>}
    </View>
  );
}

export type ModelSelectorGroupProps = {
  heading?: string;
  children?: ReactNode;
  className?: string;
};

export function ModelSelectorGroup({ heading, className, children }: ModelSelectorGroupProps) {
  return (
    <View className={cn('py-1', className)}>
      {heading ? (
        <Text className="px-3 py-1 text-xs font-medium uppercase text-muted">{heading}</Text>
      ) : null}
      {children}
    </View>
  );
}

export type ModelSelectorItemProps = PressableProps & {
  value?: string;
  keywords?: string[];
  onSelect?: (value: string) => void;
  children?: ReactNode;
};

export function ModelSelectorItem({
  value,
  keywords,
  onSelect,
  className,
  children,
  onPress,
  ...props
}: ModelSelectorItemProps) {
  const { query, registerMatch, unregisterMatch, setOpen } = useModelSelector();
  const id = useId();

  const searchText = useMemo(() => {
    const parts = [...(keywords ?? [])];
    if (value) {
      parts.push(value);
    }
    if (typeof children === 'string') {
      parts.push(children);
    }
    return parts.join(' ').toLowerCase();
  }, [children, keywords, value]);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = trimmedQuery.length === 0 || searchText.length === 0 || searchText.includes(trimmedQuery);

  useEffect(() => {
    registerMatch(id, matches);
    return () => unregisterMatch(id);
  }, [id, matches, registerMatch, unregisterMatch]);

  if (!matches) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        'flex-row items-center gap-2 rounded-md px-3 py-2.5',
        props.disabled && 'opacity-50',
        className,
      )}
      onPress={(event) => {
        onPress?.(event);
        onSelect?.(value ?? '');
        setOpen(false);
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
}

export type ModelSelectorShortcutProps = TextProps & {
  className?: string;
  children?: ReactNode;
};

export function ModelSelectorShortcut({ className, children, ...props }: ModelSelectorShortcutProps) {
  return (
    <Text className={cn('text-xs text-muted', className)} {...props}>
      {children}
    </Text>
  );
}

export type ModelSelectorSeparatorProps = ViewProps & {
  className?: string;
};

export function ModelSelectorSeparator({ className, ...props }: ModelSelectorSeparatorProps) {
  return <View className={cn('h-px bg-border', className)} {...props} />;
}

export type ModelSelectorNameProps = TextProps & {
  className?: string;
  children?: ReactNode;
};

export function ModelSelectorName({ className, children, ...props }: ModelSelectorNameProps) {
  return (
    <Text className={cn('flex-1 truncate text-left', className)} numberOfLines={1} {...props}>
      {children}
    </Text>
  );
}

export type ModelSelectorLogoProps = {
  provider: string;
  size?: number;
  className?: string;
  style?: StyleProp<ImageStyle>;
};

export function ModelSelectorLogo({ provider, size = 12, style }: ModelSelectorLogoProps) {
  return (
    <Image
      accessibilityLabel={`${provider} logo`}
      source={{ uri: `https://models.dev/logos/${provider}.svg` }}
      style={[{ width: size, height: size }, style]}
    />
  );
}

export type ModelSelectorLogoGroupProps = ViewProps & {
  children?: ReactNode;
};

export function ModelSelectorLogoGroup({ className, children, ...props }: ModelSelectorLogoGroupProps) {
  return (
    <View className={cn('shrink-0 flex-row items-center', className)} {...props}>
      {children}
    </View>
  );
}
