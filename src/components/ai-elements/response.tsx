import Markdown from '@ronradtke/react-native-markdown-display';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import { CodeBlock } from './code-block';

export type ResponseProps = {
  children: string;
  className?: string;
};

function buildStyles(dark: boolean) {
  return {
    body: {
      color: dark ? '#fafafa' : '#18181b',
      fontSize: 15,
      lineHeight: 23,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 10,
    },
    heading1: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
    heading2: { fontSize: 19, fontWeight: '700', marginBottom: 8 },
    heading3: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
    link: { color: dark ? '#60a5fa' : '#2563eb' },
    blockquote: {
      backgroundColor: dark ? '#27272a' : '#f4f4f5',
      borderLeftColor: dark ? '#3f3f46' : '#d4d4d8',
      borderLeftWidth: 3,
      paddingHorizontal: 12,
      paddingVertical: 4,
      marginVertical: 4,
    },
    code_inline: {
      backgroundColor: dark ? '#27272a' : '#f4f4f5',
      color: dark ? '#fda4af' : '#be123c',
      fontFamily: 'monospace',
      fontSize: 13,
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { marginBottom: 4 },
  } as const;
}

export function Response({ children, className }: ResponseProps) {
  const { dark } = useThemeColors();
  const markdownStyles = useMemo(() => buildStyles(dark), [dark]);

  const rules = useMemo(
    () => ({
      fence: (node: { key: string; content: string; sourceInfo?: string }) => (
        <CodeBlock key={node.key} code={node.content} language={node.sourceInfo || 'text'} />
      ),
      code_block: (node: { key: string; content: string; sourceInfo?: string }) => (
        <CodeBlock key={node.key} code={node.content} language={node.sourceInfo || 'text'} />
      ),
    }),
    [],
  );

  return (
    <View className={cn('w-full', className)}>
      <Markdown style={markdownStyles as never} rules={rules as never}>
        {children}
      </Markdown>
    </View>
  );
}
