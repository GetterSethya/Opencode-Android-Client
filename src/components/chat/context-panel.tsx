import { useMemo } from 'react';
import { Text, View } from 'react-native';

import {
  estimateContextBreakdown,
  formatTokens,
  type ContextBreakdownKey,
} from '@/chat/context-breakdown';
import type { OpencodeSession } from '@/chat/opencode';
import type { UIMessage } from '@/chat/types';
import { cn } from '@/lib/utils';

const SEGMENT_STYLE: Record<ContextBreakdownKey, { bar: string; dot: string }> = {
  user: { bar: 'bg-foreground', dot: 'bg-foreground' },
  assistant: { bar: 'bg-success', dot: 'bg-success' },
  tool: { bar: 'bg-warning', dot: 'bg-warning' },
  other: { bar: 'bg-border', dot: 'bg-border' },
};

export function ContextPanel({
  session,
  messages,
  contextLimit,
  modelLabel,
}: {
  session: OpencodeSession | null;
  messages: UIMessage[];
  contextLimit?: number;
  modelLabel?: string;
}) {
  const tokens = session?.tokens;
  const input = tokens?.input ?? 0;
  const output = tokens?.output ?? 0;
  const reasoning = tokens?.reasoning ?? 0;
  const cacheRead = tokens?.cache?.read ?? 0;
  const cacheWrite = tokens?.cache?.write ?? 0;

  const segments = useMemo(
    () => estimateContextBreakdown({ messages, input }),
    [messages, input],
  );

  const usedPercent =
    contextLimit && contextLimit > 0 ? Math.min(100, (input / contextLimit) * 100) : undefined;

  if (!session) {
    return (
      <View className="items-center py-10">
        <Text className="text-sm text-muted">No active session</Text>
      </View>
    );
  }

  return (
    <View className="gap-5">
      <View className="gap-2">
        <View className="flex-row items-end justify-between">
          <Text className="text-sm text-muted">Context used</Text>
          <Text className="font-mono text-sm text-foreground">
            {formatTokens(input)}
            {contextLimit ? ` / ${formatTokens(contextLimit)}` : ''}
          </Text>
        </View>
        {usedPercent !== undefined ? (
          <>
            <View className="h-2 overflow-hidden rounded-full bg-surface-secondary">
              <View
                className={cn('h-full rounded-full', usedPercent > 90 ? 'bg-danger' : 'bg-foreground')}
                style={{ width: `${Math.max(1, usedPercent)}%` }}
              />
            </View>
            <Text className="text-xs text-muted">
              {usedPercent.toFixed(1)}% of the context window
              {modelLabel ? ` · ${modelLabel}` : ''}
            </Text>
          </>
        ) : (
          <Text className="text-xs text-muted">
            {modelLabel ? `${modelLabel} · ` : ''}context window unknown for this model
          </Text>
        )}
      </View>

      {segments.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-muted">
            Breakdown (estimated)
          </Text>
          <View className="h-2 flex-row overflow-hidden rounded-full bg-surface-secondary">
            {segments.map((segment) => (
              <View
                key={segment.key}
                className={SEGMENT_STYLE[segment.key].bar}
                style={{ width: `${segment.width}%` }}
              />
            ))}
          </View>
          <View className="gap-1.5 pt-1">
            {segments.map((segment) => (
              <View key={segment.key} className="flex-row items-center gap-2">
                <View className={cn('h-2 w-2 rounded-full', SEGMENT_STYLE[segment.key].dot)} />
                <Text className="flex-1 text-sm text-foreground">{segment.label}</Text>
                <Text className="font-mono text-xs text-muted">
                  {formatTokens(segment.tokens)} · {segment.percent}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted">Session totals</Text>
        <Row label="Input" value={formatTokens(input)} />
        <Row label="Output" value={formatTokens(output)} />
        {reasoning > 0 ? <Row label="Reasoning" value={formatTokens(reasoning)} /> : null}
        {cacheRead > 0 ? <Row label="Cache read" value={formatTokens(cacheRead)} /> : null}
        {cacheWrite > 0 ? <Row label="Cache write" value={formatTokens(cacheWrite)} /> : null}
        {typeof session.cost === 'number' && session.cost > 0 ? (
          <Row label="Cost" value={`$${session.cost.toFixed(4)}`} />
        ) : null}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-foreground">{label}</Text>
      <Text className="font-mono text-xs text-muted">{value}</Text>
    </View>
  );
}
