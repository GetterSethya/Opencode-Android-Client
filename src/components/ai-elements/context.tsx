import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { Modal, Pressable, Text, View, type ViewProps } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Button, type ButtonProps } from '@/components/ui/button';
import { useControllableState } from '@/hooks/use-controllable-state';
import { cn } from '@/lib/utils';

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

type ModelId = string;

export interface LanguageModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
}

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  usage?: LanguageModelUsage;
  modelId?: ModelId;
}

type ContextContextValue = ContextSchema & {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const ContextContext = createContext<ContextContextValue | null>(null);

const useContextValue = () => {
  const context = useContext(ContextContext);

  if (!context) {
    throw new Error('Context components must be used within Context');
  }

  return context;
};

type ModelPricing = {
  input: number;
  output: number;
  cacheRead?: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075 },
  'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5 },
  o3: { input: 2, output: 8, cacheRead: 0.5 },
  'claude-3-5-sonnet': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-3-7-sonnet': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10, cacheRead: 0.31 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5, cacheRead: 0.075 },
};

function lookupPricing(modelId: string): ModelPricing | undefined {
  if (MODEL_PRICING[modelId]) {
    return MODEL_PRICING[modelId];
  }
  const key = modelId.split('/').pop() ?? modelId;
  if (MODEL_PRICING[key]) {
    return MODEL_PRICING[key];
  }
  const match = Object.keys(MODEL_PRICING).find((candidate) => key.startsWith(candidate));
  return match ? MODEL_PRICING[match] : undefined;
}

type UsageInput = {
  input?: number;
  output?: number;
  cacheReads?: number;
  reasoningTokens?: number;
};

function getUsage({
  modelId,
  usage,
}: {
  modelId: string;
  usage: UsageInput;
}): { costUSD?: { totalUSD?: number } } {
  const pricing = lookupPricing(modelId);
  if (!pricing) {
    return { costUSD: undefined };
  }
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const cacheReads = usage.cacheReads ?? 0;
  const reasoning = usage.reasoningTokens ?? 0;
  const totalUSD =
    (input * pricing.input +
      output * pricing.output +
      cacheReads * (pricing.cacheRead ?? pricing.input) +
      reasoning * pricing.output) /
    1_000_000;
  return { costUSD: { totalUSD } };
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

export type ContextProps = ContextSchema & {
  children?: ReactNode;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const Context = ({
  usedTokens,
  maxTokens,
  usage,
  modelId,
  open,
  defaultOpen = false,
  onOpenChange,
  children,
}: ContextProps) => {
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });

  const contextValue = useMemo(
    () => ({ maxTokens, modelId, open: isOpen, setOpen: setIsOpen, usage, usedTokens }),
    [maxTokens, modelId, isOpen, setIsOpen, usage, usedTokens],
  );

  return <ContextContext.Provider value={contextValue}>{children}</ContextContext.Provider>;
};

const ContextIcon = () => {
  const { usedTokens, maxTokens } = useContextValue();
  const circumference = 2 * Math.PI * ICON_RADIUS;
  const usedPercent = maxTokens > 0 ? Math.min(usedTokens / maxTokens, 1) : 0;
  const dashOffset = circumference * (1 - usedPercent);

  return (
    <Svg width={20} height={20} viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}>
      <Circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity={0.25}
        r={ICON_RADIUS}
        stroke="#71717a"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <Circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity={0.7}
        r={ICON_RADIUS}
        stroke="#71717a"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        originX={ICON_CENTER}
        originY={ICON_CENTER}
        rotation={-90}
      />
    </Svg>
  );
};

export type ContextTriggerProps = ButtonProps;

export const ContextTrigger = ({ children, className, ...props }: ContextTriggerProps) => {
  const { usedTokens, maxTokens, setOpen } = useContextValue();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const renderedPercent = formatPercent(usedPercent);

  return (
    <Button
      variant="ghost"
      className={cn('gap-1.5', className)}
      onPress={() => setOpen(true)}
      {...props}
    >
      {children ?? (
        <>
          <Text className="font-medium text-muted">{renderedPercent}</Text>
          <ContextIcon />
        </>
      )}
    </Button>
  );
};

export type ContextContentProps = {
  children?: ReactNode;
  className?: string;
};

export const ContextContent = ({ className, children }: ContextContentProps) => {
  const { open, setOpen } = useContextValue();

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => setOpen(false)}
    >
      <View className="flex-1 items-center justify-center bg-black/30 p-4">
        <Pressable
          accessibilityLabel="Close context details"
          className="absolute inset-0"
          onPress={() => setOpen(false)}
        />
        <View
          className={cn('w-[280px] overflow-hidden rounded-lg border border-border bg-surface', className)}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
};

export type ContextContentHeaderProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ContextContentHeader = ({
  children,
  className,
  ...props
}: ContextContentHeaderProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const displayPct = formatPercent(usedPercent);
  const used = formatCompact(usedTokens);
  const total = formatCompact(maxTokens);

  return (
    <View className={cn('w-full gap-2 p-3', className)} {...props}>
      {children ?? (
        <>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-xs text-foreground">{displayPct}</Text>
            <Text className="font-mono text-xs text-muted">
              {used} / {total}
            </Text>
          </View>
          <View className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
            <View
              className="h-full rounded-full bg-foreground"
              style={{ width: `${Math.min(usedPercent, 1) * PERCENT_MAX}%` }}
            />
          </View>
        </>
      )}
    </View>
  );
};

export type ContextContentBodyProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ContextContentBody = ({ children, className, ...props }: ContextContentBodyProps) => (
  <View className={cn('w-full p-3', className)} {...props}>
    {children}
  </View>
);

export type ContextContentFooterProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => {
  const { modelId, usage } = useContextValue();
  const costUSD = modelId
    ? getUsage({
        modelId,
        usage: {
          input: usage?.inputTokens ?? 0,
          output: usage?.outputTokens ?? 0,
        },
      }).costUSD?.totalUSD
    : undefined;
  const totalCost = formatUSD(costUSD ?? 0);

  return (
    <View
      className={cn('w-full flex-row items-center justify-between gap-3 bg-surface-secondary p-3', className)}
      {...props}
    >
      {children ?? (
        <>
          <Text className="text-xs text-muted">Total cost</Text>
          <Text className="text-xs text-foreground">{totalCost}</Text>
        </>
      )}
    </View>
  );
};

const TokensWithCost = ({
  tokens,
  costText,
}: {
  tokens?: number;
  costText?: string;
}) => (
  <Text className="text-xs text-foreground">
    {tokens === undefined ? '—' : formatCompact(tokens)}
    {costText ? <Text className="text-muted"> • {costText}</Text> : null}
  </Text>
);

export type ContextInputUsageProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ContextInputUsage = ({
  className,
  children,
  ...props
}: ContextInputUsageProps) => {
  const { usage, modelId } = useContextValue();
  const inputTokens = usage?.inputTokens ?? 0;

  if (children) {
    return <>{children}</>;
  }

  if (!inputTokens) {
    return null;
  }

  const inputCost = modelId
    ? getUsage({ modelId, usage: { input: inputTokens, output: 0 } }).costUSD?.totalUSD
    : undefined;
  const inputCostText = formatUSD(inputCost ?? 0);

  return (
    <View className={cn('flex-row items-center justify-between', className)} {...props}>
      <Text className="text-xs text-muted">Input</Text>
      <TokensWithCost costText={inputCostText} tokens={inputTokens} />
    </View>
  );
};

export type ContextOutputUsageProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ContextOutputUsage = ({
  className,
  children,
  ...props
}: ContextOutputUsageProps) => {
  const { usage, modelId } = useContextValue();
  const outputTokens = usage?.outputTokens ?? 0;

  if (children) {
    return <>{children}</>;
  }

  if (!outputTokens) {
    return null;
  }

  const outputCost = modelId
    ? getUsage({ modelId, usage: { input: 0, output: outputTokens } }).costUSD?.totalUSD
    : undefined;
  const outputCostText = formatUSD(outputCost ?? 0);

  return (
    <View className={cn('flex-row items-center justify-between', className)} {...props}>
      <Text className="text-xs text-muted">Output</Text>
      <TokensWithCost costText={outputCostText} tokens={outputTokens} />
    </View>
  );
};

export type ContextReasoningUsageProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ContextReasoningUsage = ({
  className,
  children,
  ...props
}: ContextReasoningUsageProps) => {
  const { usage, modelId } = useContextValue();
  const reasoningTokens = usage?.reasoningTokens ?? 0;

  if (children) {
    return <>{children}</>;
  }

  if (!reasoningTokens) {
    return null;
  }

  const reasoningCost = modelId
    ? getUsage({ modelId, usage: { reasoningTokens } }).costUSD?.totalUSD
    : undefined;
  const reasoningCostText = formatUSD(reasoningCost ?? 0);

  return (
    <View className={cn('flex-row items-center justify-between', className)} {...props}>
      <Text className="text-xs text-muted">Reasoning</Text>
      <TokensWithCost costText={reasoningCostText} tokens={reasoningTokens} />
    </View>
  );
};

export type ContextCacheUsageProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ContextCacheUsage = ({
  className,
  children,
  ...props
}: ContextCacheUsageProps) => {
  const { usage, modelId } = useContextValue();
  const cacheTokens = usage?.cachedInputTokens ?? 0;

  if (children) {
    return <>{children}</>;
  }

  if (!cacheTokens) {
    return null;
  }

  const cacheCost = modelId
    ? getUsage({ modelId, usage: { cacheReads: cacheTokens, input: 0, output: 0 } }).costUSD
        ?.totalUSD
    : undefined;
  const cacheCostText = formatUSD(cacheCost ?? 0);

  return (
    <View className={cn('flex-row items-center justify-between', className)} {...props}>
      <Text className="text-xs text-muted">Cache</Text>
      <TokensWithCost costText={cacheCostText} tokens={cacheTokens} />
    </View>
  );
};
