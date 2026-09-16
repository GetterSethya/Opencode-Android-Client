import {
  ArrowUpIcon,
  FileIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react-native';
import { type ReactNode, type Ref } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import type { PendingAttachment } from '@/chat/attachments';
import type { ChatStatus } from '@/chat/types';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/ui/dialog';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export type PromptInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onAddImage?: () => void;
  onAddFile?: () => void;
  onRemoveAttachment?: (id: string) => void;
  attachments?: PendingAttachment[];
  status?: ChatStatus;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  footer?: ReactNode;
  inputRef?: Ref<TextInput>;
  /** Controlled cursor, used to place it after programmatic inserts. */
  selection?: { start: number; end: number };
  onSelectionChange?: (selection: { start: number; end: number }) => void;
};

export function PromptInput({
  value,
  onChangeText,
  onSubmit,
  onStop,
  onAddImage,
  onAddFile,
  onRemoveAttachment,
  attachments = [],
  status = 'ready',
  placeholder = 'Send a message...',
  disabled = false,
  className,
  footer,
  inputRef,
  selection,
  onSelectionChange,
}: PromptInputProps) {
  const colors = useThemeColors();
  const { choose } = useDialog();
  const isBusy = status === 'submitted' || status === 'streaming';
  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const canSubmit = hasContent && !disabled;

  const handleAdd = async () => {
    await choose({
      title: 'Add attachment',
      actions: [
        { label: 'Photo', onPress: () => onAddImage?.() },
        { label: 'Document', onPress: () => onAddFile?.() },
      ],
    });
  };

  return (
    <View className={cn('rounded-2xl border border-border bg-surface p-2', className)}>
      {attachments.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 pb-2">
          {attachments.map((attachment) => (
            <View
              key={attachment.id}
              className="overflow-hidden rounded-xl border border-border"
            >
              {attachment.kind === 'image' ? (
                <Image
                  source={{ uri: attachment.uri }}
                  style={{ width: 64, height: 64 }}
                  resizeMode="cover"
                />
              ) : (
                <View className="h-16 w-40 flex-row items-center gap-2 px-2">
                  <FileIcon size={18} color={colors.muted} />
                  <Text
                    className="flex-1 text-xs text-foreground"
                    numberOfLines={2}
                  >
                    {attachment.name}
                  </Text>
                </View>
              )}
              <Pressable
                className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60"
                onPress={() => onRemoveAttachment?.(attachment.id)}
              >
                <XIcon size={12} color="#ffffff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <TextInput
        ref={inputRef}
        className="max-h-32 min-h-11 px-3 py-2 text-[15px] text-foreground"
        multiline
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        editable={!disabled}
        selection={selection}
        onSelectionChange={(event) => onSelectionChange?.(event.nativeEvent.selection)}
      />

      <View className="flex-row items-center justify-between px-1 pt-1">
        <View className="flex-1 flex-row items-center gap-1">
          <Pressable
            accessibilityLabel="Add attachment"
            className="h-8 w-8 items-center justify-center rounded-full"
            onPress={handleAdd}
          >
            <PlusIcon size={18} color={colors.muted} />
          </Pressable>
          {footer}
        </View>
        {isBusy ? (
          <View className="flex-row items-center gap-2">
            {canSubmit ? (
              <Button
                accessibilityLabel="Queue message"
                size="icon-sm"
                className="rounded-full"
                onPress={onSubmit}
              >
                <ArrowUpIcon size={16} color={colors.dark ? '#18181b' : '#ffffff'} />
              </Button>
            ) : null}
            <Button
              accessibilityLabel="Stop"
              size="icon-sm"
              variant="destructive"
              className="rounded-full"
              onPress={onStop}
            >
              <SquareIcon size={13} color="#ffffff" />
            </Button>
          </View>
        ) : (
          <Button
            accessibilityLabel="Send"
            size="icon-sm"
            className="rounded-full"
            disabled={!canSubmit}
            onPress={onSubmit}
          >
            <ArrowUpIcon size={16} color={colors.dark ? '#18181b' : '#ffffff'} />
          </Button>
        )}
      </View>
    </View>
  );
}

export type PromptInputFooterProps = {
  children?: ReactNode;
  className?: string;
};

export function PromptInputFooter({ children, className }: PromptInputFooterProps) {
  return <View className={cn('flex-row items-center gap-1', className)}>{children}</View>;
}
