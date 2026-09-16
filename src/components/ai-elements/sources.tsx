import { BookIcon, ChevronDownIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export type SourcesProps = {
  children?: ReactNode;
  className?: string;
};

export function Sources({ children, className }: SourcesProps) {
  return <Collapsible className={cn('mb-4 text-xs', className)}>{children}</Collapsible>;
}

export type SourcesTriggerProps = {
  count: number;
  children?: ReactNode;
  className?: string;
};

export function SourcesTrigger({ count, children, className }: SourcesTriggerProps) {
  const colors = useThemeColors();
  return (
    <CollapsibleTrigger className={cn('flex-row items-center gap-2', className)}>
      {children ?? (
        <>
          <Text className="font-medium text-accent">Used {count} sources</Text>
          <ChevronDownIcon size={14} color={colors.muted} />
        </>
      )}
    </CollapsibleTrigger>
  );
}

export type SourcesContentProps = {
  children?: ReactNode;
  className?: string;
};

export function SourcesContent({ children, className }: SourcesContentProps) {
  return (
    <CollapsibleContent className={cn('mt-3 gap-2', className)}>{children}</CollapsibleContent>
  );
}

export type SourceProps = {
  href: string;
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function Source({ href, title, children, className }: SourceProps) {
  const colors = useThemeColors();
  return (
    <View className={cn('flex-row items-center gap-2', className)}>
      {children ?? (
        <>
          <BookIcon size={14} color={colors.muted} />
          <Text
            className="font-medium text-accent"
            numberOfLines={1}
            onPress={() => Linking.openURL(href)}
          >
            {title ?? href}
          </Text>
        </>
      )}
    </View>
  );
}
