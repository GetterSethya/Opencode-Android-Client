import { ListChecksIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import type { ToolUIPart, UIMessage } from '@/chat/types';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from './queue';
import { parseTodoInput, type TodoItem } from './tool';

/**
 * Returns the latest `todowrite` checklist that still has work left
 * (pending or in-progress items). Older lists are superseded by newer
 * ones; a fully completed list unpins the bar.
 */
export function latestActiveTodos(messages: UIMessage[]): TodoItem[] {
  let latest: TodoItem[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!part.type.startsWith('tool-')) {
        continue;
      }
      const toolPart = part as ToolUIPart;
      if (toolPart.toolName !== 'todowrite') {
        continue;
      }
      const todos = parseTodoInput(toolPart.input);
      if (todos.length > 0) {
        latest = todos;
      }
    }
  }
  const hasActive = latest.some(
    (todo) => todo.status === 'pending' || todo.status === 'in_progress',
  );
  return hasActive ? latest : [];
}

export type ActiveTodosBarProps = {
  todos: TodoItem[];
  className?: string;
};

/**
 * Pinned todo strip rendered below the navbar. Same Queue primitives and
 * card design as the message-queue UI, but fixed at the top: a collapsed
 * summary row (tap to expand) with the full checklist in a capped scroll
 * list.
 */
export function ActiveTodosBar({ todos, className }: ActiveTodosBarProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);

  if (todos.length === 0) {
    return null;
  }

  const done = todos.filter(
    (todo) => todo.status === 'completed' || todo.status === 'cancelled',
  ).length;
  const current =
    todos.find((todo) => todo.status === 'in_progress') ??
    todos.find((todo) => todo.status === 'pending');

  return (
    <View className={cn('border-b border-border px-4 py-2', className)}>
      <Queue>
        <QueueSection open={open} onOpenChange={setOpen}>
          <QueueSectionTrigger
            accessibilityRole="button"
            accessibilityLabel={`Todos, ${done} of ${todos.length} done. ${open ? 'Collapse' : 'Expand'}.`}
          >
            <QueueSectionLabel
              count={todos.length}
              label="Todos"
              icon={<ListChecksIcon size={16} color={colors.muted} />}
              open={open}
            />
            <View className="flex-1 flex-row items-center justify-end gap-2 pl-2">
              {!open && current ? (
                <Text className="flex-1 text-right text-xs text-muted" numberOfLines={1}>
                  {current.content}
                </Text>
              ) : null}
              <Text className="text-xs text-muted">
                {done}/{todos.length}
              </Text>
            </View>
          </QueueSectionTrigger>
          <QueueSectionContent>
            <QueueList>
              {todos.map((todo, index) => {
                const isDone = todo.status === 'completed' || todo.status === 'cancelled';
                return (
                  <QueueItem key={index} className="flex-row items-start">
                    <QueueItemIndicator completed={isDone} />
                    <QueueItemContent
                      completed={isDone}
                      className={todo.status === 'in_progress' ? 'font-medium text-foreground' : undefined}
                    >
                      {todo.content}
                    </QueueItemContent>
                  </QueueItem>
                );
              })}
            </QueueList>
          </QueueSectionContent>
        </QueueSection>
      </Queue>
    </View>
  );
}
