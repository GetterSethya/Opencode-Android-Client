import type { UIMessage } from './types';

export type ContextBreakdownKey = 'user' | 'assistant' | 'tool' | 'other';

export type ContextBreakdownSegment = {
  key: ContextBreakdownKey;
  label: string;
  tokens: number;
  width: number;
  percent: number;
};

const LABELS: Record<ContextBreakdownKey, string> = {
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tools',
  other: 'Other',
};

/** Web client uses a ~4 chars per token heuristic. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function charsFromPart(part: UIMessage['parts'][number]): { assistant: number; tool: number } {
  if (part.type === 'text') {
    return { assistant: part.text.length, tool: 0 };
  }
  if (part.type === 'reasoning') {
    return { assistant: part.text.length, tool: 0 };
  }
  if (part.type.startsWith('tool-')) {
    const tool = part as Extract<UIMessage['parts'][number], { type: `tool-${string}` }>;
    const input = tool.input ? JSON.stringify(tool.input).length : 0;
    const output = typeof tool.output === 'string' ? tool.output.length : 0;
    return { assistant: 0, tool: input + output };
  }
  return { assistant: 0, tool: 0 };
}

function build(
  tokens: Record<ContextBreakdownKey, number>,
  input: number,
): ContextBreakdownSegment[] {
  const keys: ContextBreakdownKey[] = ['user', 'assistant', 'tool', 'other'];
  return keys
    .map((key) => ({
      key,
      label: LABELS[key],
      tokens: tokens[key],
      width: input > 0 ? (tokens[key] / input) * 100 : 0,
      percent: input > 0 ? Math.round((tokens[key] / input) * 1000) / 10 : 0,
    }))
    .filter((segment) => segment.tokens > 0);
}

/**
 * Estimates how the context window is split across message roles.
 * Ported from the web client's `estimateSessionContextBreakdown`, scaled so the
 * estimate never exceeds the reported input tokens.
 */
export function estimateContextBreakdown(args: {
  messages: UIMessage[];
  input: number;
}): ContextBreakdownSegment[] {
  if (!args.input) {
    return [];
  }

  const counts = args.messages.reduce(
    (acc, message) => {
      if (message.role === 'user') {
        const user = message.parts.reduce(
          (sum, part) => sum + (part.type === 'text' ? part.text.length : 0),
          0,
        );
        return { ...acc, user: acc.user + user };
      }
      const totals = message.parts.reduce(
        (sum, part) => {
          const next = charsFromPart(part);
          return {
            assistant: sum.assistant + next.assistant,
            tool: sum.tool + next.tool,
          };
        },
        { assistant: 0, tool: 0 },
      );
      return {
        ...acc,
        assistant: acc.assistant + totals.assistant,
        tool: acc.tool + totals.tool,
      };
    },
    { user: 0, assistant: 0, tool: 0 },
  );

  const tokens = {
    user: estimateTokens(counts.user),
    assistant: estimateTokens(counts.assistant),
    tool: estimateTokens(counts.tool),
  };
  const estimated = tokens.user + tokens.assistant + tokens.tool;

  if (estimated <= args.input) {
    return build({ ...tokens, other: args.input - estimated }, args.input);
  }

  const scale = args.input / estimated;
  const scaled = {
    user: Math.floor(tokens.user * scale),
    assistant: Math.floor(tokens.assistant * scale),
    tool: Math.floor(tokens.tool * scale),
  };
  const total = scaled.user + scaled.assistant + scaled.tool;
  return build({ ...scaled, other: Math.max(0, args.input - total) }, args.input);
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}
