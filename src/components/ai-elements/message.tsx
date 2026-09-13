import { memo, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { UIMessage } from '@/chat/types';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { Response } from './response';

export type MessageProps = {
  from: UIMessage['role'];
  children?: ReactNode;
  className?: string;
};

export function Message({ className, from, children }: MessageProps) {
  return (
    <View
      className={cn(
        'w-full max-w-[95%] flex-col gap-2',
        from === 'user' ? 'ml-auto items-end' : 'items-start',
        className,
      )}
    >
      {children}
    </View>
  );
}

export type MessageContentProps = {
  from?: UIMessage['role'];
  children?: ReactNode;
  className?: string;
};

export function MessageContent({ className, children }: MessageContentProps) {
  return (
    <View className={cn('min-w-0 max-w-full gap-2 overflow-hidden rounded-2xl px-4 py-3', className)}>
      {children}
    </View>
  );
}

export type MessageActionsProps = {
  children?: ReactNode;
  className?: string;
};

export function MessageActions({ className, children }: MessageActionsProps) {
  return <View className={cn('flex-row items-center gap-1', className)}>{children}</View>;
}

export type MessageActionProps = Omit<ButtonProps, 'children'> & {
  label: string;
  children?: ReactNode;
};

export function MessageAction({ label, children, className, ...props }: MessageActionProps) {
  return (
    <Button
      accessibilityLabel={label}
      variant="ghost"
      size="icon-sm"
      className={cn('rounded-full', className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export type MessageToolbarProps = {
  children?: ReactNode;
  className?: string;
};

export function MessageToolbar({ className, children }: MessageToolbarProps) {
  return (
    <View
      className={cn('mt-2 w-full flex-row items-center justify-between gap-4', className)}
    >
      {children}
    </View>
  );
}

export type MessageResponseProps = {
  children: string;
  className?: string;
};

export const MessageResponse = memo(
  ({ className, children }: MessageResponseProps) => (
    <Response className={cn('w-full', className)}>{children}</Response>
  ),
  (prev, next) => prev.children === next.children,
);

MessageResponse.displayName = 'MessageResponse';

export function MessageText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text className={cn('text-[15px] leading-6 text-foreground', className)}>
      {children}
    </Text>
  );
}
