import {
  BotIcon,
  FileIcon,
  LinkIcon,
  ShieldAlertIcon,
  TerminalIcon,
} from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import type { PendingPermission } from '@/chat/use-opencode-chat';
import type { PermissionReply } from '@/chat/opencode';
import type { ToolState } from '@/chat/types';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import { languageForPath } from '@/components/ui/highlighted-code';

import { CodeBlock } from './code-block';
import { MessageResponse } from './message';
import { ToolOutput } from './tool';

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function toolFileName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index < 0 ? trimmed : trimmed.slice(index + 1);
}

const DetailRow = memo(function DetailRow({
  icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <View className="flex-row items-center gap-2.5 rounded-xl bg-surface-secondary px-3 py-2.5">
      {icon}
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-muted" numberOfLines={1} ellipsizeMode="head">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View className="rounded-full border border-border px-2 py-0.5">
          <Text className="text-xs text-muted">{badge}</Text>
        </View>
      ) : null}
    </View>
  );
});

/** Long markdown result with a cap so huge outputs don't stall rendering. */
const LONG_RESULT_LIMIT = 4000;

const CappedMarkdown = memo(function CappedMarkdown({ text }: { text: string }) {
  const truncated = text.length > LONG_RESULT_LIMIT;
  const shown = truncated ? `${text.slice(0, LONG_RESULT_LIMIT)}\n\n… (${text.length - LONG_RESULT_LIMIT} more characters)` : text;
  return <MessageResponse>{shown}</MessageResponse>;
});

/**
 * Renders the `bash` tool: the command as a terminal line plus the streamed
 * result, instead of a raw JSON parameter dump.
 */
export const BashTool = memo(function BashTool({
  input,
  output,
  errorText,
  state,
}: {
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: ToolState;
}) {
  const colors = useThemeColors();
  const record = asRecord(input);
  const command = asString(record.command);
  const workdir = asString(record.workdir);
  return (
    <View className="gap-3">
      {command ? (
        <View className="gap-1">
          <View className="flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3 py-2.5">
            <TerminalIcon size={16} color={colors.muted} />
            <Text className="flex-1 text-sm text-foreground" numberOfLines={3}>
              {command}
            </Text>
          </View>
          {workdir ? <Text className="px-1 text-xs text-muted">in {workdir}</Text> : null}
        </View>
      ) : null}
      {output || errorText ? (
        <ToolOutput output={output} errorText={errorText} />
      ) : (
        <Text className="px-1 text-xs text-muted">
          {state === 'output-error' ? 'Command failed' : 'Running…'}
        </Text>
      )}
    </View>
  );
});

/**
 * Renders the `read` tool: the file path plus the content in a viewer that
 * pages long files instead of dumping JSON.
 */
export const ReadTool = memo(function ReadTool({
  input,
  output,
  errorText,
  state,
}: {
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: ToolState;
}) {
  const colors = useThemeColors();
  const record = asRecord(input);
  const filePath = asString(record.filePath);
  const offset = asNumber(record.offset);
  const limit = asNumber(record.limit);
  const range =
    offset !== undefined || limit !== undefined
      ? `lines ${offset ?? 1}${limit !== undefined ? `–${(offset ?? 1) + limit - 1}` : '–'}`
      : undefined;
  return (
    <View className="gap-3">
      {filePath ? (
        <DetailRow
          icon={<FileIcon size={16} color={colors.muted} />}
          title={toolFileName(filePath)}
          subtitle={filePath}
          badge={range}
        />
      ) : null}
      {typeof output === 'string' && output ? (
        <CodeBlock code={output} language={filePath ? languageForPath(filePath) : 'plaintext'} />
      ) : errorText ? (
        <ToolOutput output={output} errorText={errorText} />
      ) : (
        <Text className="px-1 text-xs text-muted">
          {state === 'output-error' ? 'Read failed' : 'Reading…'}
        </Text>
      )}
    </View>
  );
});

/**
 * Renders the `write` tool: the destination path plus a short preview of the
 * written content (the full blob stays out of the transcript).
 */
const WRITE_PREVIEW_LINES = 12;

export const WriteTool = memo(function WriteTool({
  input,
  output,
  errorText,
  state,
}: {
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: ToolState;
}) {
  const colors = useThemeColors();
  const record = asRecord(input);
  const filePath = asString(record.filePath);
  const content = asString(record.content);

  const { preview, lineCount } = useMemo(() => {
    if (!content) {
      return { preview: '', lineCount: 0 };
    }
    const lines = content.split('\n');
    const count = lines.length;
    const p = count > WRITE_PREVIEW_LINES
      ? `${lines.slice(0, WRITE_PREVIEW_LINES).join('\n')}\n… (${count - WRITE_PREVIEW_LINES} more lines)`
      : content;
    return { preview: p, lineCount: count };
  }, [content]);

  return (
    <View className="gap-3">
      {filePath ? (
        <DetailRow
          icon={<FileIcon size={16} color={colors.muted} />}
          title={toolFileName(filePath)}
          subtitle={filePath}
          badge={lineCount > 0 ? `${lineCount} lines` : undefined}
        />
      ) : null}
      {preview ? (
        <CodeBlock code={preview} language={filePath ? languageForPath(filePath) : 'plaintext'} />
      ) : null}
      {typeof output === 'string' && output ? (
        <Text className="px-1 text-xs text-muted">{output}</Text>
      ) : errorText ? (
        <ToolOutput output={output} errorText={errorText} />
      ) : state === 'output-available' ? null : (
        <Text className="px-1 text-xs text-muted">
          {state === 'output-error' ? 'Write failed' : 'Writing…'}
        </Text>
      )}
    </View>
  );
});

/**
 * Renders the `edit` tool: the file being changed plus a compact diff-ish
 * view of the replacement (old → new), so the exact edit is visible instead
 * of a raw JSON dump.
 */
export const EditTool = memo(function EditTool({
  input,
  output,
  errorText,
  state,
}: {
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: ToolState;
}) {
  const colors = useThemeColors();
  const record = asRecord(input);
  const filePath = asString(record.filePath);
  const oldString = asString(record.oldString);
  const newString = asString(record.newString);
  const language = useMemo(() => (filePath ? languageForPath(filePath) : 'plaintext'), [filePath]);

  return (
    <View className="gap-3">
      {filePath ? (
        <DetailRow
          icon={<FileIcon size={16} color={colors.muted} />}
          title={toolFileName(filePath)}
          subtitle={filePath}
          badge={record.replaceAll === true ? 'all' : undefined}
        />
      ) : null}
      {oldString || newString ? (
        <View className="gap-2">
          {oldString ? (
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-danger">Before</Text>
              <CodeBlock code={oldString} language={language} />
            </View>
          ) : null}
          {newString ? (
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-success">After</Text>
              <CodeBlock code={newString} language={language} />
            </View>
          ) : null}
        </View>
      ) : null}
      {typeof output === 'string' && output ? (
        <Text className="px-1 text-xs text-muted">{output}</Text>
      ) : errorText ? (
        <ToolOutput output={output} errorText={errorText} />
      ) : state === 'output-available' ? null : (
        <Text className="px-1 text-xs text-muted">
          {state === 'output-error' ? 'Edit failed' : 'Editing…'}
        </Text>
      )}
    </View>
  );
});

/**
 * Renders the `webfetch` tool: the URL plus the fetched page as markdown
 * instead of an escaped JSON string.
 */
export const WebfetchTool = memo(function WebfetchTool({
  input,
  output,
  errorText,
  state,
}: {
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: ToolState;
}) {
  const colors = useThemeColors();
  const record = asRecord(input);
  const url = asString(record.url);
  const format = asString(record.format) ?? 'markdown';

  const host = useMemo(() => {
    if (!url) return undefined;
    try {
      return new URL(url).host;
    } catch {
      return undefined;
    }
  }, [url]);

  return (
    <View className="gap-3">
      {url ? (
        <DetailRow
          icon={<LinkIcon size={16} color={colors.muted} />}
          title={host ?? url}
          subtitle={host ? url : undefined}
          badge={format}
        />
      ) : null}
      {typeof output === 'string' && output ? (
        format === 'markdown' ? (
          <CappedMarkdown text={output} />
        ) : (
          <CodeBlock code={output} language="plaintext" />
        )
      ) : errorText ? (
        <ToolOutput output={output} errorText={errorText} />
      ) : (
        <Text className="px-1 text-xs text-muted">
          {state === 'output-error' ? 'Fetch failed' : 'Fetching…'}
        </Text>
      )}
    </View>
  );
});

/**
 * Renders the `task` (subagent) tool: which agent runs it, the delegated
 * prompt, and the subagent's result as markdown.
 */
export const TaskTool = memo(function TaskTool({
  input,
  output,
  errorText,
  state,
}: {
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: ToolState;
}) {
  const colors = useThemeColors();
  const record = asRecord(input);
  const description = asString(record.description);
  const prompt = asString(record.prompt);
  const subagent = asString(record.subagent_type);
  return (
    <View className={cn('gap-3')}>
      {description || subagent ? (
        <DetailRow
          icon={<BotIcon size={16} color={colors.muted} />}
          title={description ?? 'Subagent task'}
          subtitle={prompt}
          badge={subagent}
        />
      ) : null}
      {typeof output === 'string' && output ? (
        <CappedMarkdown text={output} />
      ) : errorText ? (
        <ToolOutput output={output} errorText={errorText} />
      ) : (
        <Text className="px-1 text-xs text-muted">
          {state === 'output-error' ? 'Subagent failed' : 'Subagent working…'}
        </Text>
      )}
    </View>
  );
});

/**
 * Renders a pending tool permission request under its tool part. The run is
 * paused server-side until the user allows (once or always) or rejects; the
 * card clears on the `permission.replied` event.
 */
export const PermissionCard = memo(function PermissionCard({
  permission,
  onReply,
  resetKey,
}: {
  permission: PendingPermission;
  onReply: (reply: PermissionReply) => Promise<void>;
  /** Remounts the card so local reply state is cleared for a new request. */
  resetKey?: string;
}) {
  return (
    <PermissionCardBody
      key={resetKey ?? permission.requestID}
      permission={permission}
      onReply={onReply}
    />
  );
});

function PermissionCardBody({
  permission,
  onReply,
}: {
  permission: PendingPermission;
  onReply: (reply: PermissionReply) => Promise<void>;
}) {
  const colors = useThemeColors();
  const [submitting, setSubmitting] = useState<PermissionReply | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reply = async (choice: PermissionReply) => {
    if (submitting || sent) {
      return;
    }
    setSubmitting(choice);
    setError(null);
    try {
      await onReply(choice);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-surface p-3">
      <View className="flex-row items-center gap-2">
        <ShieldAlertIcon size={16} color={colors.dark ? '#fbbf24' : '#d97706'} />
        <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
          Needs approval · {permission.permission}
        </Text>
      </View>
      {permission.patterns.length > 0 ? (
        <Text className="text-xs text-muted" numberOfLines={3}>
          {permission.patterns.join('\n')}
        </Text>
      ) : null}
      {error ? <Text className="text-xs text-danger">{error}</Text> : null}
      {sent ? (
        <View className="flex-row items-center gap-2">
          <Spinner size={14} color={colors.muted} />
          <Text className="text-xs text-muted">Sent, resuming…</Text>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button size="sm" disabled={submitting !== null} onPress={() => reply('once')}>
              {submitting === 'once' ? 'Sending…' : 'Allow once'}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              size="sm"
              variant="outline"
              disabled={submitting !== null}
              onPress={() => reply('always')}
            >
              {submitting === 'always' ? 'Sending…' : 'Always'}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              size="sm"
              variant="outline"
              disabled={submitting !== null}
              onPress={() => reply('reject')}
            >
              {submitting === 'reject' ? 'Sending…' : 'Reject'}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
