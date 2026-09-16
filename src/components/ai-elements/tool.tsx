import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  MessageCircleIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react-native';
import { isValidElement, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { ToolState } from '@/chat/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
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
    content = <CodeBlock code={output} language="plaintext" />;
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

export type QuestionToolOption = {
  label: string;
  description?: string;
};

export type QuestionToolItem = {
  header?: string;
  question: string;
  options: QuestionToolOption[];
  multiple?: boolean;
  /** Whether a free-form reply is accepted (defaults to true). */
  custom?: boolean;
};

/**
 * Reads the `question` tool's input. The shape is
 * `{ questions: [{ header, question, options: [{ label, description }], multiple }] }`
 * but comes straight off the wire, so every field is treated as optional.
 */
export function parseQuestionInput(input: unknown): QuestionToolItem[] {
  if (!input || typeof input !== 'object') {
    return [];
  }
  const raw = (input as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: QuestionToolItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const question = entry as Record<string, unknown>;
    if (typeof question.question !== 'string' || question.question.length === 0) {
      continue;
    }
    const options: QuestionToolOption[] = [];
    if (Array.isArray(question.options)) {
      for (const option of question.options) {
        if (option && typeof option === 'object') {
          const { label, description } = option as Record<string, unknown>;
          if (typeof label === 'string') {
            options.push({
              label,
              description: typeof description === 'string' ? description : undefined,
            });
          }
        }
      }
    }
    items.push({
      header: typeof question.header === 'string' ? question.header : undefined,
      question: question.question,
      options,
      multiple: question.multiple === true,
      custom: question.custom === false ? false : true,
    });
  }
  return items;
}

/** Selected labels per question, from the completed tool part's metadata. */
export function parseQuestionAnswers(metadata: unknown): string[][] {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }
  const raw = (metadata as { answers?: unknown }).answers;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) =>
    Array.isArray(entry) ? entry.filter((value): value is string => typeof value === 'string') : [],
  );
}

/**
 * Renders the `question` tool: the prompt, its options, and — once answered —
 * which option was picked. Answers that don't match an option (free-form
 * replies) are shown verbatim.
 *
 * When `pending` with an `onAnswer` callback the options become tappable and
 * the reply is submitted through POST /question/:id/reply, which resumes the
 * paused run server-side. Until then the only way to answer was typing in the
 * composer, which the server treats as a new prompt and leaves the run stuck.
 */
export function QuestionTool({
  questions,
  answers = [],
  answered = false,
  pending = false,
  resetKey,
  onAnswer,
  onReject,
  className,
}: {
  questions: QuestionToolItem[];
  answers?: string[][];
  answered?: boolean;
  pending?: boolean;
  /** Remounts the form so local selection is cleared for a new request. */
  resetKey?: string;
  /** Called with the per-question answers when the user submits. */
  onAnswer?: (answers: string[][]) => Promise<void>;
  /** Dismisses the request without answering (rejects it server-side). */
  onReject?: () => Promise<void>;
  className?: string;
}) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <QuestionToolBody
      key={`${resetKey ?? ''}:${pending}`}
      questions={questions}
      answers={answers}
      answered={answered}
      pending={pending}
      onAnswer={onAnswer}
      onReject={onReject}
      className={className}
    />
  );
}

function QuestionToolBody({
  questions,
  answers = [],
  answered = false,
  pending = false,
  onAnswer,
  onReject,
  className,
}: {
  questions: QuestionToolItem[];
  answers?: string[][];
  answered?: boolean;
  pending?: boolean;
  onAnswer?: (answers: string[][]) => Promise<void>;
  onReject?: () => Promise<void>;
  className?: string;
}) {
  const colors = useThemeColors();
  const interactive = pending && onAnswer !== undefined;
  const [selected, setSelected] = useState<string[][]>([]);
  const [customText, setCustomText] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleOption = (questionIndex: number, label: string) => {
    setSubmitError(null);
    setSelected((prev) => {
      const current = prev[questionIndex] ?? [];
      const next =
        questions[questionIndex]?.multiple === true
          ? current.includes(label)
            ? current.filter((value) => value !== label)
            : [...current, label]
          : [label];
      const copy = [...prev];
      copy[questionIndex] = next;
      return copy;
    });
  };

  const setCustom = (questionIndex: number, text: string) => {
    setSubmitError(null);
    setCustomText((prev) => {
      const copy = [...prev];
      copy[questionIndex] = text;
      return copy;
    });
  };

  const answersFor = (questionIndex: number): string[] => {
    const picked = selected[questionIndex] ?? [];
    const typed = (customText[questionIndex] ?? '').trim();
    return typed ? [...picked, typed] : picked;
  };

  const canSubmit =
    interactive &&
    !submitting &&
    !submitted &&
    questions.every((_, index) => answersFor(index).length > 0);

  const submit = async () => {
    if (!onAnswer || !canSubmit) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAnswer(questions.map((_, index) => answersFor(index)));
      setSubmitted(true);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className={cn('gap-2', className)}>
      {questions.map((item, questionIndex) => {
        const recorded = answers[questionIndex] ?? [];
        const picked = interactive ? (selected[questionIndex] ?? []) : recorded;
        const selectedSet = new Set(picked);
        const freeForm = picked.filter(
          (answer) => !item.options.some((option) => option.label === answer),
        );
        return (
          <View
            key={questionIndex}
            className="gap-2 rounded-xl border border-border bg-surface p-3"
          >
            {item.header ? (
              <Text className="text-xs font-medium uppercase tracking-wide text-muted">
                {item.header}
              </Text>
            ) : null}
            <Text className="text-sm text-foreground">{item.question}</Text>

            {item.options.length > 0 ? (
              <View className="gap-1.5 pt-0.5">
                {item.options.map((option, optionIndex) => {
                  const isSelected = selectedSet.has(option.label);
                  const row = (
                    <View
                      className={cn(
                        'flex-row items-start gap-2 rounded-lg border px-2.5 py-2',
                        isSelected
                          ? 'border-success bg-success/10'
                          : 'border-border bg-surface-secondary',
                      )}
                    >
                      <View style={{ marginTop: 1 }}>
                        {isSelected ? (
                          <CheckCircleIcon size={14} color={colors.success} />
                        ) : (
                          <CircleIcon size={14} color={colors.muted} />
                        )}
                      </View>
                      <View className="flex-1 gap-0.5">
                        <Text className="text-sm text-foreground">{option.label}</Text>
                        {option.description ? (
                          <Text className="text-xs text-muted">{option.description}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                  return interactive && !submitted ? (
                    <Pressable
                      key={optionIndex}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      onPress={() => toggleOption(questionIndex, option.label)}
                    >
                      {row}
                    </Pressable>
                  ) : (
                    <View key={optionIndex}>{row}</View>
                  );
                })}
              </View>
            ) : null}

            {interactive && !submitted && item.custom !== false ? (
              <TextInput
                className="rounded-lg border border-border bg-surface-secondary px-2.5 py-2 text-sm text-foreground"
                placeholder="Or type your own answer…"
                placeholderTextColor={colors.muted}
                value={customText[questionIndex] ?? ''}
                onChangeText={(text) => setCustom(questionIndex, text)}
                autoCapitalize="sentences"
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            ) : null}

            {freeForm.map((answer) => (
              <View
                key={answer}
                className="flex-row items-start gap-2 rounded-lg border border-success bg-success/10 px-2.5 py-2"
              >
                <View style={{ marginTop: 1 }}>
                  <MessageCircleIcon size={14} color={colors.success} />
                </View>
                <Text className="flex-1 text-sm text-foreground">{answer}</Text>
              </View>
            ))}

            {!answered && recorded.length === 0 && !interactive ? (
              <Text className="text-xs text-muted">
                {item.options.length > 0 ? 'Waiting for an answer…' : 'Waiting for a response…'}
              </Text>
            ) : null}
          </View>
        );
      })}

      {interactive ? (
        <View className="gap-2 pt-1">
          {submitError ? <Text className="text-xs text-danger">{submitError}</Text> : null}
          {submitted ? (
            <View className="flex-row items-center gap-2">
              <Spinner size={14} color={colors.muted} />
              <Text className="text-xs text-muted">Answer sent, resuming…</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Button disabled={!canSubmit} onPress={submit}>
                  {submitting ? 'Sending…' : 'Send answers'}
                </Button>
              </View>
              {onReject ? (
                <DismissButton onReject={onReject} disabled={submitting} />
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Dismisses a pending question without answering (rejects it server-side). */
function DismissButton({ onReject, disabled }: { onReject: () => Promise<void>; disabled: boolean }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  return (
    <View className="gap-1">
      {rejectError ? <Text className="text-xs text-danger">{rejectError}</Text> : null}
      <Button
        variant="outline"
        disabled={disabled || rejecting}
        onPress={async () => {
          setRejecting(true);
          setRejectError(null);
          try {
            await onReject();
          } catch (cause) {
            setRejectError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setRejecting(false);
          }
        }}
      >
        {rejecting ? 'Dismissing…' : 'Dismiss'}
      </Button>
    </View>
  );
}

export type TodoItemStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type TodoItem = {
  content: string;
  status: TodoItemStatus;
  priority?: string;
};

const TODO_STATUSES: TodoItemStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

/**
 * Reads the `todowrite` tool's input (`{ todos: [{ content, status, priority }] }`).
 * The list is streamed, so malformed or partial entries are skipped rather
 * than rendered as broken rows.
 */
export function parseTodoInput(input: unknown): TodoItem[] {
  if (!input || typeof input !== 'object') {
    return [];
  }
  const raw = (input as { todos?: unknown }).todos;
  if (!Array.isArray(raw)) {
    return [];
  }
  const todos: TodoItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const todo = entry as Record<string, unknown>;
    if (typeof todo.content !== 'string' || todo.content.length === 0) {
      continue;
    }
    const status =
      typeof todo.status === 'string' && (TODO_STATUSES as string[]).includes(todo.status)
        ? (todo.status as TodoItemStatus)
        : 'pending';
    todos.push({
      content: todo.content,
      status,
      priority: typeof todo.priority === 'string' ? todo.priority : undefined,
    });
  }
  return todos;
}

/** Renders the `todowrite` tool as a checklist instead of raw JSON. */
export function TodoTool({ todos, className }: { todos: TodoItem[]; className?: string }) {
  const colors = useThemeColors();

  if (todos.length === 0) {
    return null;
  }

  const done = todos.filter((todo) => todo.status === 'completed').length;

  return (
    <View className={cn('gap-2 rounded-xl border border-border bg-surface p-3', className)}>
      <Text className="text-xs font-medium uppercase tracking-wide text-muted">
        {done} of {todos.length} done
      </Text>
      <View className="gap-1.5">
        {todos.map((todo, index) => {
          const isDone = todo.status === 'completed' || todo.status === 'cancelled';
          return (
            <View key={index} className="flex-row items-start gap-2">
              <View style={{ marginTop: 2 }}>
                {todo.status === 'completed' ? (
                  <CheckCircleIcon size={14} color={colors.success} />
                ) : todo.status === 'in_progress' ? (
                  <ClockIcon size={14} color={colors.foreground} />
                ) : todo.status === 'cancelled' ? (
                  <XCircleIcon size={14} color={colors.muted} />
                ) : (
                  <CircleIcon size={14} color={colors.muted} />
                )}
              </View>
              <Text
                className={cn(
                  'flex-1 text-sm',
                  todo.status === 'in_progress' ? 'font-medium text-foreground' : 'text-foreground',
                  isDone && 'text-muted line-through',
                )}
              >
                {todo.content}
              </Text>
              {todo.priority === 'high' && !isDone ? (
                <Badge variant="secondary">
                  <Text className="text-xs text-foreground">high</Text>
                </Badge>
              ) : null}
            </View>
          );
        })}
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
