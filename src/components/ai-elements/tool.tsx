import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react-native';
import { isValidElement, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { ToolState } from '@/chat/types';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import { CodeBlock } from './code-block';

export type ToolProps = {
  children?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

export function Tool({ className, children, defaultOpen }: ToolProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn('mb-4 w-full rounded-md border border-border', className)}
    >
      {children}
    </Collapsible>
  );
}

export type ToolHeaderProps = {
  title?: string;
  toolName: string;
  state: ToolState;
  className?: string;
};

export const statusLabels: Record<ToolState, string> = {
  'input-streaming': 'Pending',
  'input-available': 'Running',
  'output-available': 'Completed',
  'output-error': 'Error',
};

function StatusIcon({ state }: { state: ToolState }) {
  const colors = useThemeColors();

  switch (state) {
    case 'input-streaming':
      return <CircleIcon size={14} color={colors.muted} />;
    case 'input-available':
      return <ClockIcon size={14} color={colors.muted} />;
    case 'output-available':
      return <CheckCircleIcon size={14} color={colors.success} />;
    case 'output-error':
      return <XCircleIcon size={14} color={colors.danger} />;
  }
}

export function getStatusBadge(status: ToolState) {
  return (
    <Badge className="gap-1" variant="secondary">
      <StatusIcon state={status} />
      <Text className="text-xs text-foreground">{statusLabels[status]}</Text>
    </Badge>
  );
}

export function ToolHeader({ className, title, toolName, state }: ToolHeaderProps) {
  const colors = useThemeColors();

  return (
    <CollapsibleTrigger
      className={cn('w-full flex-row items-center justify-between gap-3 p-3', className)}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <WrenchIcon size={15} color={colors.muted} />
        <Text
          className="shrink text-sm font-medium text-foreground"
          numberOfLines={1}
        >
          {title || toolName}
        </Text>
        <View className="shrink-0">{getStatusBadge(state)}</View>
      </View>
      <ChevronDownIcon size={16} color={colors.muted} />
    </CollapsibleTrigger>
  );
}

export type ToolContentProps = {
  children?: ReactNode;
  className?: string;
};

export function ToolContent({ className, children }: ToolContentProps) {
  return (
    <CollapsibleContent className={cn('gap-4 p-4', className)}>{children}</CollapsibleContent>
  );
}

export type ToolInputProps = {
  input?: unknown;
  className?: string;
};

export function ToolInput({ className, input }: ToolInputProps) {
  return (
    <View className={cn('gap-2', className)}>
      <Text className="text-xs font-medium uppercase tracking-wide text-muted">
        Parameters
      </Text>
      <CodeBlock code={safeStringify(input)} language="json" />
    </View>
  );
}

export type ToolOutputProps = {
  output?: unknown;
  errorText?: string;
  className?: string;
};

export function ToolOutput({ className, output, errorText }: ToolOutputProps) {
  if (!(output || errorText)) {
    return null;
  }

  let content: ReactNode;

  if (typeof output === 'object' && output !== null && !isValidElement(output)) {
    content = <CodeBlock code={safeStringify(output)} language="json" />;
  } else if (typeof output === 'string') {
    content = <CodeBlock code={output} language="text" />;
  } else {
    content = <Text className="text-sm text-foreground">{safeStringify(output)}</Text>;
  }

  return (
    <View className={cn('gap-2', className)}>
      <Text className="text-xs font-medium uppercase tracking-wide text-muted">
        {errorText ? 'Error' : 'Result'}
      </Text>
      <View
        className={cn(
          'overflow-hidden rounded-md p-2',
          errorText ? 'bg-danger-soft' : 'bg-surface-secondary',
        )}
      >
        {errorText ? (
          <Text className="text-sm text-danger">{errorText}</Text>
        ) : (
          content
        )}
      </View>
    </View>
  );
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
