import { BookIcon, ChevronDownIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  return (
    <CollapsibleTrigger className={cn('flex-row items-center gap-2', className)}>
      {children ?? (
        <>
          <Text className="font-medium text-blue-600">Used {count} sources</Text>
          <ChevronDownIcon size={14} color="#2563eb" />
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
  return (
    <View className={cn('flex-row items-center gap-2', className)}>
      {children ?? (
        <>
          <BookIcon size={14} color="#71717a" />
          <Text
            className="font-medium text-blue-600"
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
