import { ChevronDownIcon, SearchIcon } from 'lucide-react-native';
import { createContext, type ReactNode, useContext } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import {
  Collapsible,
  type CollapsibleProps,
  CollapsibleContent,
  type CollapsibleContentProps,
  CollapsibleTrigger,
  type CollapsibleTriggerProps,
} from '@/components/ui/collapsible';
import { useControllableState } from '@/hooks/use-controllable-state';
import { cn } from '@/lib/utils';

const TaskContext = createContext(false);

function renderTextChildren(children: ReactNode, textClassName: string) {
  if (typeof children === 'string' || typeof children === 'number') {
    return <Text className={textClassName}>{children}</Text>;
  }
  if (Array.isArray(children)) {
    return children.map((child, index) =>
      typeof child === 'string' || typeof child === 'number' ? (
        <Text key={index} className={textClassName}>
          {child}
        </Text>
      ) : (
        child
      ),
    );
  }
  return children;
}

export type TaskItemFileProps = ViewProps & {
  children?: ReactNode;
};

export function TaskItemFile({ children, className, ...props }: TaskItemFileProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 self-start rounded-md border border-border bg-surface-secondary px-1.5 py-0.5',
        className,
      )}
      {...props}
    >
      {renderTextChildren(children, 'text-xs text-foreground')}
    </View>
  );
}

export type TaskItemProps = ViewProps & {
  children?: ReactNode;
};

export function TaskItem({ children, className, ...props }: TaskItemProps) {
  return (
    <View className={cn('flex-row flex-wrap items-center', className)} {...props}>
      {renderTextChildren(children, 'text-sm text-muted')}
    </View>
  );
}

export type TaskProps = CollapsibleProps & {
  children?: ReactNode;
};

export function Task({
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  children,
  ...props
}: TaskProps) {
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    defaultProp: defaultOpen,
    onChange: onOpenChange,
    prop: open,
  });

  return (
    <TaskContext.Provider value={isOpen}>
      <Collapsible className={cn(className)} open={isOpen} onOpenChange={setIsOpen} {...props}>
        {children}
      </Collapsible>
    </TaskContext.Provider>
  );
}

export type TaskTriggerProps = CollapsibleTriggerProps & {
  title: string;
};

export function TaskTrigger({ children, className, title, ...props }: TaskTriggerProps) {
  const isOpen = useContext(TaskContext);

  return (
    <CollapsibleTrigger className={cn('flex-row items-center gap-2', className)} {...props}>
      {children ?? (
        <>
          <SearchIcon size={16} color="#71717a" />
          <Text className="flex-1 text-sm text-muted">{title}</Text>
          <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
            <ChevronDownIcon size={16} color="#71717a" />
          </View>
        </>
      )}
    </CollapsibleTrigger>
  );
}

export type TaskContentProps = CollapsibleContentProps;

export function TaskContent({ children, className, ...props }: TaskContentProps) {
  return (
    <CollapsibleContent className={cn(className)} {...props}>
      <View className="mt-4 gap-2 border-l-2 border-border pl-4">{children}</View>
    </CollapsibleContent>
  );
}
