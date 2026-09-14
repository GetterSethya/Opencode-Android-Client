import {
  CloudOffIcon,
  FileQuestionIcon,
  ServerCrashIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import { Button } from './button';

export type ErrorKind = 'not-found' | 'server' | 'network' | 'unknown';

/**
 * Sorts request failures into the screens we render for them. Matches the
 * `opencode <status>` shape the API client throws, plus React Native's
 * network failure messages.
 */
export function classifyError(cause: unknown): ErrorKind {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  const status = message.match(/opencode (\d{3})/)?.[1];
  if (status === '404' || (/notfound/i.test(message) && /opencode/i.test(message))) {
    return 'not-found';
  }
  if (status !== undefined) {
    return status.startsWith('5') ? 'server' : 'unknown';
  }
  if (/network request failed|fetch|econn|enotfound|timed out|timeout|socket|abort/i.test(message)) {
    return 'network';
  }
  return 'unknown';
}

const KIND_ICON: Record<ErrorKind, LucideIcon> = {
  'not-found': FileQuestionIcon,
  unknown: CloudOffIcon,
  server: ServerCrashIcon,
  network: WifiOffIcon,
};

const KIND_TITLE: Record<ErrorKind, string> = {
  'not-found': 'Not found',
  unknown: 'Something went wrong',
  server: 'Server error',
  network: "You're offline",
};

const KIND_HINT: Record<ErrorKind, string> = {
  'not-found': 'It may have been moved or deleted.',
  unknown: 'Please try again.',
  server: 'The server hit an error. Try again in a moment.',
  network: 'Check your connection and try again.',
};

export type ErrorStateProps = {
  kind?: ErrorKind;
  title?: string;
  /** Defaults to a per-kind hint; pass null to hide. */
  message?: string | null;
  retryLabel?: string;
  onRetry?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Compact variant for inline panel errors (smaller icon, tighter layout). */
  compact?: boolean;
  className?: string;
};

export function ErrorState({
  kind = 'unknown',
  title,
  message,
  retryLabel = 'Try again',
  onRetry,
  secondaryLabel,
  onSecondary,
  compact = false,
  className,
}: ErrorStateProps) {
  const colors = useThemeColors();
  const Icon = KIND_ICON[kind];
  const resolvedMessage = message === undefined ? KIND_HINT[kind] : message;

  return (
    <View
      className={cn(
        'items-center justify-center',
        compact ? 'gap-2 px-4 py-6' : 'flex-1 gap-3 px-8 py-12',
        className,
      )}
    >
      <View
        className={cn(
          'items-center justify-center rounded-full bg-surface-secondary',
          compact ? 'h-12 w-12' : 'h-16 w-16',
        )}
      >
        <Icon size={compact ? 22 : 28} color={colors.muted} />
      </View>
      <Text className={cn('text-center font-semibold text-foreground', compact ? 'text-base' : 'text-xl')}>
        {title ?? KIND_TITLE[kind]}
      </Text>
      {resolvedMessage ? (
        <Text className="text-center text-sm text-muted" numberOfLines={compact ? 4 : undefined}>
          {resolvedMessage}
        </Text>
      ) : null}
      {onRetry ? (
        <View className={cn(compact ? 'pt-1' : 'pt-2')}>
          <Button variant="outline" size={compact ? 'sm' : 'default'} onPress={onRetry}>
            {retryLabel}
          </Button>
        </View>
      ) : null}
      {onSecondary && secondaryLabel ? (
        <Button variant="ghost" size="sm" onPress={onSecondary}>
          {secondaryLabel}
        </Button>
      ) : null}
    </View>
  );
}

/** Full-screen 404: the thing (session, file) no longer exists server-side. */
export function NotFoundState(props: Omit<ErrorStateProps, 'kind'>) {
  return <ErrorState kind="not-found" {...props} />;
}

/** Full-screen 5xx / network / crash failure. */
export function ServerErrorState({ kind = 'server', ...rest }: ErrorStateProps) {
  return <ErrorState kind={kind} {...rest} />;
}
