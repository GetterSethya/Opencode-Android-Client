import { BookmarkIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CheckpointProps = ViewProps & {
  children?: ReactNode;
};

function Separator({ className }: { className?: string }) {
  return <View className={cn('h-px flex-1 bg-zinc-200', className)} />;
}

export function Checkpoint({ className, children, ...props }: CheckpointProps) {
  return (
    <View className={cn('flex-row items-center gap-0.5 overflow-hidden', className)} {...props}>
      {children}
      <Separator />
    </View>
  );
}

export type CheckpointIconProps = {
  children?: ReactNode;
  className?: string;
  size?: number;
  color?: string;
};

export function CheckpointIcon({
  className,
  children,
  size = 16,
  color = '#71717a',
}: CheckpointIconProps) {
  if (children) {
    return <>{children}</>;
  }

  return (
    <View className={cn('shrink-0', className)}>
      <BookmarkIcon size={size} color={color} />
    </View>
  );
}

export type CheckpointTriggerProps = ButtonProps & {
  tooltip?: string;
};

export function CheckpointTrigger({
  children,
  variant = 'ghost',
  size = 'sm',
  tooltip,
  ...props
}: CheckpointTriggerProps) {
  return (
    <Button accessibilityLabel={tooltip} size={size} variant={variant} {...props}>
      {children}
    </Button>
  );
}
