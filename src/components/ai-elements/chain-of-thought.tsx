import { BrainIcon, ChevronDownIcon, DotIcon, type LucideIcon } from 'lucide-react-native';
import { createContext, memo, type ReactNode, useContext, useMemo } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  type CollapsibleContentProps,
  CollapsibleTrigger,
  type CollapsibleTriggerProps,
} from '@/components/ui/collapsible';
import { useControllableState } from '@/hooks/use-controllable-state';
import { cn } from '@/lib/utils';

type ChainOfThoughtContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThought() {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error('ChainOfThought components must be used within ChainOfThought');
  }
  return context;
}

export type ChainOfThoughtProps = ViewProps & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
};

export const ChainOfThought = memo(function ChainOfThought({
  className,
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: ChainOfThoughtProps) {
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    defaultProp: defaultOpen,
    onChange: onOpenChange,
    prop: open,
  });

  const chainOfThoughtContext = useMemo(() => ({ isOpen, setIsOpen }), [isOpen, setIsOpen]);

  return (
    <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
      <View className={cn('w-full gap-4', className)} {...props}>
        {children}
      </View>
    </ChainOfThoughtContext.Provider>
  );
});

ChainOfThought.displayName = 'ChainOfThought';

export type ChainOfThoughtHeaderProps = CollapsibleTriggerProps;

export const ChainOfThoughtHeader = memo(function ChainOfThoughtHeader({
  className,
  children,
  ...props
}: ChainOfThoughtHeaderProps) {
  const { isOpen, setIsOpen } = useChainOfThought();

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <CollapsibleTrigger className={cn('flex-row items-center gap-2', className)} {...props}>
        <BrainIcon size={16} color="#71717a" />
        <Text className="flex-1 text-sm text-zinc-500">{children ?? 'Chain of Thought'}</Text>
        <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
          <ChevronDownIcon size={16} color="#71717a" />
        </View>
      </CollapsibleTrigger>
    </Collapsible>
  );
});

ChainOfThoughtHeader.displayName = 'ChainOfThoughtHeader';

type ChainOfThoughtStatus = 'complete' | 'active' | 'pending';

export type ChainOfThoughtStepProps = ViewProps & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: ChainOfThoughtStatus;
  children?: ReactNode;
};

const stepStatusText: Record<ChainOfThoughtStatus, string> = {
  active: 'text-zinc-900',
  complete: 'text-zinc-500',
  pending: 'text-zinc-400',
};

const stepStatusColor: Record<ChainOfThoughtStatus, string> = {
  active: '#18181b',
  complete: '#71717a',
  pending: '#a1a1aa',
};

export const ChainOfThoughtStep = memo(function ChainOfThoughtStep({
  className,
  icon: Icon = DotIcon,
  label,
  description,
  status = 'complete',
  children,
  ...props
}: ChainOfThoughtStepProps) {
  return (
    <View className={cn('flex-row gap-2', className)} {...props}>
      <View style={{ marginTop: 2 }}>
        <Icon size={16} color={stepStatusColor[status]} />
        <View
          style={{
            position: 'absolute',
            top: 28,
            bottom: 0,
            left: '50%',
            width: 1,
            marginLeft: -0.5,
            backgroundColor: '#e4e4e7',
          }}
        />
      </View>
      <View className="flex-1 gap-2 overflow-hidden">
        {typeof label === 'string' || typeof label === 'number' ? (
          <Text className={cn('text-sm', stepStatusText[status])}>{label}</Text>
        ) : (
          label
        )}
        {description ? (
          typeof description === 'string' || typeof description === 'number' ? (
            <Text className="text-xs text-zinc-500">{description}</Text>
          ) : (
            description
          )
        ) : null}
        {children}
      </View>
    </View>
  );
});

ChainOfThoughtStep.displayName = 'ChainOfThoughtStep';

export type ChainOfThoughtSearchResultsProps = ViewProps & {
  children?: ReactNode;
};

export const ChainOfThoughtSearchResults = memo(function ChainOfThoughtSearchResults({
  className,
  ...props
}: ChainOfThoughtSearchResultsProps) {
  return <View className={cn('flex-row flex-wrap items-center gap-2', className)} {...props} />;
});

ChainOfThoughtSearchResults.displayName = 'ChainOfThoughtSearchResults';

export type ChainOfThoughtSearchResultProps = BadgeProps;

export const ChainOfThoughtSearchResult = memo(function ChainOfThoughtSearchResult({
  className,
  children,
  ...props
}: ChainOfThoughtSearchResultProps) {
  return (
    <Badge className={cn('gap-1 px-2 py-0.5', className)} variant="secondary" {...props}>
      {typeof children === 'string' ? (
        <Text className="text-xs text-zinc-700">{children}</Text>
      ) : (
        children
      )}
    </Badge>
  );
});

ChainOfThoughtSearchResult.displayName = 'ChainOfThoughtSearchResult';

export type ChainOfThoughtContentProps = CollapsibleContentProps;

export const ChainOfThoughtContent = memo(function ChainOfThoughtContent({
  className,
  children,
  ...props
}: ChainOfThoughtContentProps) {
  const { isOpen } = useChainOfThought();

  return (
    <Collapsible open={isOpen}>
      <CollapsibleContent className={cn('mt-2 gap-3', className)} {...props}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
});

ChainOfThoughtContent.displayName = 'ChainOfThoughtContent';

export type ChainOfThoughtImageProps = ViewProps & {
  caption?: string;
  children?: ReactNode;
};

export const ChainOfThoughtImage = memo(function ChainOfThoughtImage({
  className,
  children,
  caption,
  ...props
}: ChainOfThoughtImageProps) {
  return (
    <View className={cn('mt-2 gap-2', className)} {...props}>
      <View
        className="items-center justify-center overflow-hidden rounded-lg bg-zinc-100 p-3"
        style={{ maxHeight: 352 }}
      >
        {children}
      </View>
      {caption ? <Text className="text-xs text-zinc-500">{caption}</Text> : null}
    </View>
  );
});

ChainOfThoughtImage.displayName = 'ChainOfThoughtImage';
