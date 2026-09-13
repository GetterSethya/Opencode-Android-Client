import { ScrollView, Text, View } from 'react-native';

import { HighlightedCode, normalizeLanguage } from '@/components/ui/highlighted-code';
import { cn } from '@/lib/utils';

export type CodeBlockProps = {
  code: string;
  language?: string;
  className?: string;
};

export function CodeBlock({ code, language = 'text', className }: CodeBlockProps) {
  return (
    <View className={cn('overflow-hidden rounded-md bg-surface-secondary', className)}>
      <View className="border-b border-border px-3 py-1.5">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted">{language}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="p-3">
          <HighlightedCode code={code} language={normalizeLanguage(language)} selectable />
        </View>
      </ScrollView>
    </View>
  );
}
