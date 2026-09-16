import { ChevronDownIcon, PaperclipIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import {
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  ScrollView,
  type ScrollViewProps,
  Text,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';

import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  type CollapsibleContentProps,
  CollapsibleTrigger,
  type CollapsibleProps,
  type CollapsibleTriggerProps,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface QueueMessagePart {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
}

export interface QueueMessage {
  id: string;
  parts: QueueMessagePart[];
}

export interface QueueTodo {
  id: string;
  title: string;
  description?: string;
  status?: 'pending' | 'completed';
}

export type QueueItemProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const QueueItem = ({ className, ...props }: QueueItemProps) => (
  <View className={cn('gap-1 rounded-md px-3 py-1', className)} {...props} />
);

export type QueueItemIndicatorProps = ViewProps & {
  completed?: boolean;
  className?: string;
};

export const QueueItemIndicator = ({
  completed = false,
  className,
  ...props
}: QueueItemIndicatorProps) => (
  <View
    className={cn(
      'mt-0.5 h-2.5 w-2.5 rounded-full border',
      completed ? 'border-border bg-border' : 'border-border',
      className,
    )}
    {...props}
  />
);

export type QueueItemContentProps = TextProps & {
  completed?: boolean;
  children?: ReactNode;
  className?: string;
};

export const QueueItemContent = ({
  completed = false,
  className,
  ...props
}: QueueItemContentProps) => (
  <Text
    numberOfLines={1}
    className={cn(
      'flex-1',
      completed ? 'text-muted line-through' : 'text-muted',
      className,
    )}
    {...props}
  />
);

export type QueueItemDescriptionProps = TextProps & {
  completed?: boolean;
  children?: ReactNode;
  className?: string;
};

export const QueueItemDescription = ({
  completed = false,
  className,
  ...props
}: QueueItemDescriptionProps) => (
  <Text
    className={cn(
      'ml-6 text-xs',
      completed ? 'text-muted line-through' : 'text-muted',
      className,
    )}
    {...props}
  />
);

export type QueueItemActionsProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const QueueItemActions = ({ className, ...props }: QueueItemActionsProps) => (
  <View className={cn('flex-row gap-1', className)} {...props} />
);

export type QueueItemActionProps = Omit<ButtonProps, 'variant' | 'size'>;

export const QueueItemAction = ({ className, ...props }: QueueItemActionProps) => (
  <Button
    className={cn('rounded p-1', className)}
    size="icon"
    variant="ghost"
    {...props}
  />
);

export type QueueItemAttachmentProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const QueueItemAttachment = ({ className, ...props }: QueueItemAttachmentProps) => (
  <View className={cn('mt-1 flex-row flex-wrap gap-2', className)} {...props} />
);

export type QueueItemImageProps = {
  source: ImageSourcePropType;
  className?: string;
  style?: ImageStyle;
};

export const QueueItemImage = ({ className, source, style }: QueueItemImageProps) => (
  <View className={cn('h-8 w-8 overflow-hidden rounded border border-border', className)}>
    <Image source={source} style={[{ height: 32, width: 32 }, style]} />
  </View>
);

export type QueueItemFileProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const QueueItemFile = ({ children, className, ...props }: QueueItemFileProps) => (
  <View
    className={cn('flex-row items-center gap-1 rounded border border-border bg-surface-secondary px-2 py-1', className)}
    {...props}
  >
    <PaperclipIcon size={12} color="#71717a" />
    <Text className="max-w-[100px] text-xs text-foreground" numberOfLines={1}>
      {children}
    </Text>
  </View>
);

export type QueueListProps = ScrollViewProps & {
  children?: ReactNode;
  className?: string;
};

export const QueueList = ({ children, className, ...props }: QueueListProps) => (
  <ScrollView
    className={cn('mt-2 max-h-40', className)}
    showsVerticalScrollIndicator={false}
    {...props}
  >
    <View className="pr-4">{children}</View>
  </ScrollView>
);

export type QueueSectionProps = CollapsibleProps;

export const QueueSection = ({
  className,
  defaultOpen = true,
  ...props
}: QueueSectionProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type QueueSectionTriggerProps = CollapsibleTriggerProps & {
  children?: ReactNode;
  className?: string;
};

export const QueueSectionTrigger = ({
  children,
  className,
  ...props
}: QueueSectionTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      'flex-row items-center justify-between rounded-md bg-surface px-3 py-2',
      className,
    )}
    {...props}
  >
    {children}
  </CollapsibleTrigger>
);

export type QueueSectionLabelProps = ViewProps & {
  count?: number;
  label: string;
  icon?: ReactNode;
  open?: boolean;
  className?: string;
};

export const QueueSectionLabel = ({
  count,
  label,
  icon,
  open = true,
  className,
  ...props
}: QueueSectionLabelProps) => (
  <View className={cn('flex-row items-center gap-2', className)} {...props}>
    <View style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}>
      <ChevronDownIcon size={16} color="#71717a" />
    </View>
    {icon}
    <Text className="text-sm font-medium text-muted">
      {count} {label}
    </Text>
  </View>
);

export type QueueSectionContentProps = CollapsibleContentProps;

export const QueueSectionContent = ({ className, ...props }: QueueSectionContentProps) => (
  <CollapsibleContent className={cn(className)} {...props} />
);

export type QueueProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const Queue = ({ className, ...props }: QueueProps) => (
  <View
    className={cn(
      'gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm',
      className,
    )}
    {...props}
  />
);
