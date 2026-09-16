import { createContext, type ReactNode, useContext } from 'react';
import { Pressable, type PressableProps, View, type ViewProps } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useControllableState } from '@/hooks/use-controllable-state';
import { cn } from '@/lib/utils';

type CollapsibleContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

function useCollapsibleContext() {
  const context = useContext(CollapsibleContext);
  if (!context) {
    throw new Error('Collapsible components must be used within <Collapsible>');
  }
  return context;
}

export type CollapsibleProps = ViewProps & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
};

export function Collapsible({
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
  ...props
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });

  return (
    <CollapsibleContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      <View className={className} {...props}>
        {children}
      </View>
    </CollapsibleContext.Provider>
  );
}

export type CollapsibleTriggerProps = PressableProps & {
  children?: ReactNode;
};

export function CollapsibleTrigger({ className, children, ...props }: CollapsibleTriggerProps) {
  const { open, setOpen } = useCollapsibleContext();

  return (
    <Pressable accessibilityState={{ expanded: open }} className={className} onPress={() => setOpen(!open)} {...props}>
      {children}
    </Pressable>
  );
}

export type CollapsibleContentProps = ViewProps & {
  children?: ReactNode;
};

export function CollapsibleContent({ className, children, ...props }: CollapsibleContentProps) {
  const { open } = useCollapsibleContext();

  if (!open) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn.duration(150)}>
      <View className={cn(className)} {...props}>
        {children}
      </View>
    </Animated.View>
  );
}
