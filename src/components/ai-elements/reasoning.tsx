import { BrainIcon, ChevronDownIcon } from 'lucide-react-native';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, View } from 'react-native';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useControllableState } from '@/hooks/use-controllable-state';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import { Response } from './response';
import { Shimmer } from './shimmer';

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration?: number;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export function useReasoning() {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
}

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export type ReasoningProps = {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  children?: ReactNode;
  className?: string;
};

export function Reasoning({
  className,
  isStreaming = false,
  open,
  defaultOpen,
  onOpenChange,
  duration: durationProp,
  children,
}: ReasoningProps) {
  const isExplicitlyClosed = defaultOpen === false;
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    defaultProp: defaultOpen ?? isStreaming,
    onChange: onOpenChange,
    prop: open,
  });
  const [duration, setDuration] = useControllableState<number | undefined>({
    defaultProp: undefined,
    prop: durationProp,
  });

  const hasEverStreamedRef = useRef(isStreaming);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming) {
      hasEverStreamedRef.current = true;
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
    } else if (startTimeRef.current !== null) {
      setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
      startTimeRef.current = null;
    }
  }, [isStreaming, setDuration]);

  useEffect(() => {
    if (isStreaming && !isOpen && !isExplicitlyClosed) {
      setIsOpen(true);
    }
  }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

  useEffect(() => {
    if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setIsOpen(newOpen);
    },
    [setIsOpen],
  );

  const contextValue = useMemo(
    () => ({ duration, isOpen, isStreaming, setIsOpen }),
    [duration, isOpen, isStreaming, setIsOpen],
  );

  return (
    <ReasoningContext.Provider value={contextValue}>
      <Collapsible
        className={cn('mb-4', className)}
        open={isOpen}
        onOpenChange={handleOpenChange}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

export type ReasoningTriggerProps = {
  children?: ReactNode;
  className?: string;
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

function defaultGetThinkingMessage(isStreaming: boolean, duration?: number) {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>Thinking...</Shimmer>;
  }
  if (duration === undefined) {
    return <Text className="text-sm text-muted">Thought for a few seconds</Text>;
  }
  return (
    <Text className="text-sm text-muted">
      Thought for {duration} seconds
    </Text>
  );
}

export function ReasoningTrigger({
  className,
  children,
  getThinkingMessage = defaultGetThinkingMessage,
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning();
  const colors = useThemeColors();

  return (
    <CollapsibleTrigger className={cn('flex-row items-center gap-2', className)}>
      {children ?? (
        <>
          <BrainIcon size={16} color={colors.muted} />
          {getThinkingMessage(isStreaming, duration)}
          <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
            <ChevronDownIcon size={16} color={colors.muted} />
          </View>
        </>
      )}
    </CollapsibleTrigger>
  );
}

export type ReasoningContentProps = {
  children: string;
  className?: string;
};

export function ReasoningContent({ className, children }: ReasoningContentProps) {
  return (
    <CollapsibleContent className={cn('mt-3', className)}>
      <Response>{children}</Response>
    </CollapsibleContent>
  );
}
