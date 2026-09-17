import Markdown from '@ronradtke/react-native-markdown-display';
import { memo } from 'react';
import { Text, View } from 'react-native';

import { useAdaptiveRenderMode } from '@/chat/adaptive-render';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import { CodeBlock } from './code-block';

export type ResponseProps = {
  children: string;
  className?: string;
};

const DARK_STYLES = {
  body: {
    color: '#fafafa',
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
  link: { color: '#60a5fa' },
  blockquote: {
    backgroundColor: '#27272a',
    borderLeftColor: '#3f3f46',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: '#27272a',
    color: '#fda4af',
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginBottom: 4 },
} as const;

const LIGHT_STYLES = {
  body: {
    color: '#18181b',
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
  link: { color: '#2563eb' },
  blockquote: {
    backgroundColor: '#f4f4f5',
    borderLeftColor: '#d4d4d8',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: '#f4f4f5',
    color: '#be123c',
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginBottom: 4 },
} as const;

const MARKDOWN_RULES = {
  fence: (node: { key: string; content: string; sourceInfo?: string }) => (
    <CodeBlock key={node.key} code={node.content} language={node.sourceInfo || 'text'} />
  ),
  code_block: (node: { key: string; content: string; sourceInfo?: string }) => (
    <CodeBlock key={node.key} code={node.content} language={node.sourceInfo || 'text'} />
  ),
};

export const Response = memo(function Response({ children, className }: ResponseProps) {
  const { dark } = useThemeColors();
  const markdownStyles = dark ? DARK_STYLES : LIGHT_STYLES;
  const mode = useAdaptiveRenderMode();

  // While the list is flinging, skip markdown parsing (and the syntax
  // highlighting it triggers) entirely — it is the dominant per-row cost and
  // is why rows went blank before they could render. Plain text keeps roughly
  // the same height, so the list does not jump when the full version returns.
  if (mode === 'light') {
    return (
      <View className={cn('w-full', className)}>
        <Text
          style={{ color: dark ? '#fafafa' : '#18181b', fontSize: 15, lineHeight: 23 }}
        >
          {children}
        </Text>
      </View>
    );
  }

  return (
    <View className={cn('w-full', className)}>
      <Markdown style={markdownStyles as never} rules={MARKDOWN_RULES as never}>
        {children}
      </Markdown>
    </View>
  );
});
