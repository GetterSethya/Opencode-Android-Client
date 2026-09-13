import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SuggestionsProps = {
  children?: ReactNode;
  className?: string;
};

export function Suggestions({ children, className }: SuggestionsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn('w-full', className)}
      contentContainerClassName="flex-row items-center gap-2"
    >
      {children}
    </ScrollView>
  );
}

export type SuggestionProps = {
  suggestion: string;
  onPress?: (suggestion: string) => void;
  children?: ReactNode;
  className?: string;
};

export function Suggestion({ suggestion, onPress, children, className }: SuggestionProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('rounded-full', className)}
      onPress={() => onPress?.(suggestion)}
    >
      {children ?? suggestion}
    </Button>
  );
}

export function SuggestionsContainer({ children, className }: SuggestionsProps) {
  return <View className={cn('flex-row flex-wrap gap-2', className)}>{children}</View>;
}
