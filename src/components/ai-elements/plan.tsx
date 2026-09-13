import { ChevronsUpDownIcon } from 'lucide-react-native';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { Text, View, type TextProps, type ViewProps } from 'react-native';

import {
  Collapsible,
  type CollapsibleProps,
  CollapsibleContent,
  CollapsibleTrigger,
  type CollapsibleTriggerProps,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

import { Shimmer } from './shimmer';

type CardProps = ViewProps & {
  children?: ReactNode;
};

function Card({ className, children, ...props }: CardProps) {
  return (
    <View className={cn('rounded-xl border border-zinc-200 bg-white', className)} {...props}>
      {children}
    </View>
  );
}

function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <View className={cn('gap-1.5 p-4', className)} {...props}>
      {children}
    </View>
  );
}

type CardTitleProps = TextProps & {
  children?: ReactNode;
};

function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <Text className={cn('text-base font-semibold text-zinc-900', className)} {...props}>
      {children}
    </Text>
  );
}

function CardDescription({ className, children, ...props }: CardTitleProps) {
  return (
    <Text className={cn('text-sm text-zinc-500', className)} {...props}>
      {children}
    </Text>
  );
}

function CardAction({ className, children, ...props }: CardProps) {
  return (
    <View className={cn('items-end', className)} {...props}>
      {children}
    </View>
  );
}

function CardContent({ className, children, ...props }: CardProps) {
  return (
    <View className={cn('px-4 pb-4', className)} {...props}>
      {children}
    </View>
  );
}

function CardFooter({ className, children, ...props }: CardProps) {
  return (
    <View className={cn('flex-row items-center p-4', className)} {...props}>
      {children}
    </View>
  );
}

type PlanContextValue = {
  isStreaming: boolean;
};

const PlanContext = createContext<PlanContextValue | null>(null);

function usePlan() {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('Plan components must be used within Plan');
  }
  return context;
}

export type PlanProps = CollapsibleProps & {
  isStreaming?: boolean;
};

export function Plan({ className, isStreaming = false, children, ...props }: PlanProps) {
  const contextValue = useMemo(() => ({ isStreaming }), [isStreaming]);

  return (
    <PlanContext.Provider value={contextValue}>
      <Collapsible {...props}>
        <Card className={cn('shadow-none', className)}>{children}</Card>
      </Collapsible>
    </PlanContext.Provider>
  );
}

export type PlanHeaderProps = ViewProps & {
  children?: ReactNode;
};

export function PlanHeader({ className, ...props }: PlanHeaderProps) {
  return <CardHeader className={cn('items-start justify-between', className)} {...props} />;
}

export type PlanTitleProps = Omit<TextProps, 'children'> & {
  children: string;
};

export function PlanTitle({ children, ...props }: PlanTitleProps) {
  const { isStreaming } = usePlan();

  return (
    <CardTitle {...props}>{isStreaming ? <Shimmer>{children}</Shimmer> : children}</CardTitle>
  );
}

export type PlanDescriptionProps = Omit<TextProps, 'children'> & {
  children: string;
};

export function PlanDescription({ className, children, ...props }: PlanDescriptionProps) {
  const { isStreaming } = usePlan();

  return (
    <CardDescription className={cn(className)} {...props}>
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardDescription>
  );
}

export type PlanActionProps = ViewProps & {
  children?: ReactNode;
};

export function PlanAction({ className, ...props }: PlanActionProps) {
  return <CardAction className={cn('absolute right-3 top-3', className)} {...props} />;
}

export type PlanContentProps = ViewProps & {
  children?: ReactNode;
};

export function PlanContent(props: PlanContentProps) {
  return (
    <CollapsibleContent>
      <CardContent {...props} />
    </CollapsibleContent>
  );
}

export type PlanFooterProps = ViewProps;

export function PlanFooter(props: PlanFooterProps) {
  return <CardFooter {...props} />;
}

export type PlanTriggerProps = CollapsibleTriggerProps;

export function PlanTrigger({ className, children, ...props }: PlanTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn('h-8 w-8 items-center justify-center rounded-md', className)}
      {...props}
    >
      {children ?? <ChevronsUpDownIcon size={16} color="#71717a" />}
    </CollapsibleTrigger>
  );
}
