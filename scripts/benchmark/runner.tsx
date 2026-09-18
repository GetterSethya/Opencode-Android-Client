import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UIMessage, ChatStatus, ToolState } from '@/chat/types';
import type { OpencodeSession, VcsFileDiff, GlobalConfig } from '@/chat/opencode';
import type { ServerConfig } from '@/chat/settings';
import { DialogProvider } from '@/components/ui/dialog';

// UI components
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ErrorState, NotFoundState, ServerErrorState } from '@/components/ui/error-state';
import { HighlightedCode } from '@/components/ui/highlighted-code';
import { Spinner } from '@/components/ui/spinner';

// AI Elements
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
  AttachmentEmpty,
  type AttachmentData,
} from '@/components/ai-elements/attachments';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtContent,
  ChainOfThoughtImage,
} from '@/components/ai-elements/chain-of-thought';
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from '@/components/ai-elements/checkpoint';
import { CodeBlock } from '@/components/ai-elements/code-block';
import {
  Confirmation,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation';
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextCacheUsage,
} from '@/components/ai-elements/context';
import {
  Conversation,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  InlineCitation,
  InlineCitationText,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationSource,
  InlineCitationQuote,
} from '@/components/ai-elements/inline-citation';
import { Loader } from '@/components/ai-elements/loader';
import {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
  MessageToolbar,
  MessageText,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorName,
  ModelSelectorEmpty,
} from '@/components/ai-elements/model-selector';
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanAction,
  PlanContent,
  PlanFooter,
  PlanTrigger,
} from '@/components/ai-elements/plan';
import { PromptInput, PromptInputFooter } from '@/components/ai-elements/prompt-input';
import {
  Queue,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  QueueItemDescription,
  QueueItemActions,
  QueueItemAction,
  QueueItemAttachment,
  QueueItemFile,
  QueueList,
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
} from '@/components/ai-elements/queue';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning';
import { Response } from '@/components/ai-elements/response';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Sources, SourcesTrigger, SourcesContent, Source } from '@/components/ai-elements/sources';
import { Suggestion, Suggestions, SuggestionsContainer } from '@/components/ai-elements/suggestion';
import { Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile } from '@/components/ai-elements/task';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  QuestionTool,
  TodoTool,
} from '@/components/ai-elements/tool';
import {
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  WebfetchTool,
  TaskTool,
  PermissionCard,
} from '@/components/ai-elements/tool-details';

// Chat Components
import { MessageItem, ConversationLoadError } from '@/components/chat/message-item';
import { ComposerSuggestions } from '@/components/chat/composer-suggestions';
import { ContextPanel } from '@/components/chat/context-panel';
import { ReviewPanel, FullScreenDiffViewer } from '@/components/chat/review-panel';
import { FilePanel, FullScreenFileViewer } from '@/components/chat/file-panel';
import { ModelPicker } from '@/components/chat/model-picker';
import { ModelsTab } from '@/components/chat/models-tab';
import { ProvidersSheet, ProviderAvatar } from '@/components/chat/providers-sheet';
import { ConnectFlow } from '@/components/chat/provider-connect';
import { CustomProviderForm } from '@/components/chat/custom-provider-form';
import { SessionsDrawer, HamburgerButton } from '@/components/chat/sessions-drawer';
import { SessionMenuSheet, ChildSessionsSheet, SessionPanelSheet } from '@/components/chat/session-panels';
import { SettingsForm } from '@/components/chat/settings-form';
import { NewSessionSheet } from '@/components/chat/new-session-sheet';
import { QuickOpenSheet } from '@/components/chat/quick-open-sheet';
import { ShellSheet } from '@/components/chat/shell-sheet';
import { TerminalScreen } from '@/components/chat/terminal-screen';
import { ErrorBoundary } from '@/components/error-boundary';
import { SystemBars } from '@/components/system-bars';

// Set up React 19 hook dispatcher for full-tree rendering
let idCounter = 0;
const contextStack = new Map<any, any[]>();

const mockServer: ServerConfig = {
  id: 'server-1',
  name: 'Local Dev Server',
  serverUrl: 'http://localhost:4097',
  username: 'opencode',
  password: '',
  directory: '/home/getter/Projects/opencode-expo',
  model: {
    providerID: 'anthropic',
    modelID: 'claude-3-7-sonnet',
    variant: 'high',
  },
};

const defaultDialogApi = {
  confirm: () => Promise.resolve(true),
  notify: () => Promise.resolve(),
  choose: () => Promise.resolve(0),
};

const defaultChatSettings = {
  ready: true,
  servers: [mockServer],
  activeServerId: mockServer.id,
  activeServer: mockServer,
  theme: 'dark' as const,
  setTheme: () => {},
  addServer: () => mockServer,
  updateServer: () => {},
  removeServer: () => {},
  setActiveServer: () => {},
  setActiveModel: () => {},
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: Infinity,
    },
  },
});

const dispatcher = {
  readContext(context: any) {
    if (contextStack.has(context)) {
      const stack = contextStack.get(context)!;
      if (stack.length > 0) return stack[stack.length - 1];
    }
    if (context._currentValue !== undefined && context._currentValue !== null) {
      return context._currentValue;
    }
    // Return queryClient directly if querying queryClient
    if (context && context.displayName === 'QueryClientContext') {
      return queryClient;
    }
    // Return a proxy that handles any context shape seamlessly
    return new Proxy(defaultDialogApi, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        if (prop in queryClient) {
          const val = (queryClient as any)[prop];
          return typeof val === 'function' ? val.bind(queryClient) : val;
        }
        if (prop in defaultChatSettings) return (defaultChatSettings as any)[prop];
        if (prop === 'open') return true;
        if (prop === 'isOpen') return true;
        if (prop === 'setOpen' || prop === 'setIsOpen') return () => {};
        if (prop === 'isAtBottom') return true;
        if (prop === 'scrollToBottom') return () => {};
        if (prop === 'variant') return 'grid';
        if (prop === 'mediaCategory') return 'document';
        if (prop === 'data') return { type: 'file', id: 'f1', filename: 'mock.ts' };
        if (prop === 'query') return '';
        if (prop === 'setQuery') return () => {};
        if (prop === 'matchCount') return 5;
        if (prop === 'registerMatch' || prop === 'unregisterMatch') return () => {};
        if (prop === 'state') return 'output-available';
        if (prop === 'approval') return undefined;
        if (prop === 'current') return 0;
        if (prop === 'count') return 1;
        if (prop === 'next' || prop === 'prev' || prop === 'setCount') return () => {};
        if (prop === 'usedTokens') return 1000;
        if (prop === 'maxTokens') return 128000;
        if (prop === 'isStreaming') return false;
        return undefined;
      },
    });
  },
  useContext(context: any) {
    return this.readContext(context);
  },
  useState(initial: any) {
    const val = typeof initial === 'function' ? initial() : initial;
    return [val, () => {}];
  },
  useReducer(reducer: any, initialArg: any, init: any) {
    const val = init ? init(initialArg) : initialArg;
    return [val, () => {}];
  },
  useRef(initial: any) {
    return { current: initial };
  },
  useMemo(fn: () => any, _deps: any) {
    return fn();
  },
  useCallback(fn: any, _deps: any) {
    return fn;
  },
  useEffect(_fn: any, _deps: any) {},
  useLayoutEffect(_fn: any, _deps: any) {},
  useInsertionEffect(_fn: any, _deps: any) {},
  useId() {
    return 'id-' + (++idCounter);
  },
  useImperativeHandle(ref: any, create: () => any) {
    if (ref) {
      const value = create();
      if (typeof ref === 'function') ref(value);
      else ref.current = value;
    }
  },
  useTransition() {
    return [false, (fn: any) => fn()];
  },
  useDeferredValue(v: any) {
    return v;
  },
  useSyncExternalStore(_subscribe: any, getSnapshot: () => any) {
    return getSnapshot();
  },
};

(React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = dispatcher;

function evaluateTree(element: any): any {
  if (element == null || typeof element === 'boolean') return null;
  if (typeof element === 'string' || typeof element === 'number') return element;
  if (Array.isArray(element)) {
    for (let i = 0; i < element.length; i++) {
      evaluateTree(element[i]);
    }
    return;
  }
  if (!React.isValidElement(element)) return element;

  const { type, props } = element as any;
  if (typeof type === 'string') {
    if (props && props.children) {
      evaluateTree(props.children);
    }
    return;
  }
  if (type === React.Fragment) {
    if (props && props.children) evaluateTree(props.children);
    return;
  }
  if (typeof type === 'object' && type !== null) {
    // Context Provider
    if (type.$$typeof === Symbol.for('react.provider') || type._context) {
      const context = type._context || type;
      if (!contextStack.has(context)) contextStack.set(context, []);
      contextStack.get(context)!.push(props?.value);
      if (props && props.children) evaluateTree(props.children);
      contextStack.get(context)!.pop();
      return;
    }
    // forwardRef
    if (type.$$typeof === Symbol.for('react.forward_ref')) {
      const rendered = type.render(props, null);
      evaluateTree(rendered);
      return;
    }
    // memo
    if (type.$$typeof === Symbol.for('react.memo')) {
      const innerType = type.type;
      if (typeof innerType === 'function') {
        const rendered = innerType(props);
        evaluateTree(rendered);
      } else if (typeof innerType === 'object' && innerType.$$typeof === Symbol.for('react.forward_ref')) {
        const rendered = innerType.render(props, null);
        evaluateTree(rendered);
      }
      return;
    }
  }
  if (typeof type === 'function') {
    // Class component
    if (type.prototype && type.prototype.isReactComponent) {
      const instance = new type(props);
      const rendered = instance.render();
      evaluateTree(rendered);
      return;
    }
    const rendered = type(props);
    evaluateTree(rendered);
    return;
  }
}

// ============================================================================
// Mock Data
// ============================================================================

const mockShortCode = `function add(a: number, b: number): number {
  return a + b;
}`;

const mockMediumCode = `import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

export interface UserProfileProps {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'admin' | 'user' | 'guest';
  onUpdateRole: (newRole: string) => Promise<void>;
}

export function UserProfileCard({ userId, name, email, avatarUrl, role, onUpdateRole }: UserProfileProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedRole = useMemo(() => {
    return role.toUpperCase();
  }, [role]);

  const handleRoleChange = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await onUpdateRole(role === 'admin' ? 'user' : 'admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  }, [role, onUpdateRole]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.subtitle}>{email}</Text>
      <Text style={styles.badge}>{formattedRole}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={handleRoleChange} disabled={loading} style={styles.button}>
        <Text style={styles.buttonText}>{loading ? 'Updating...' : 'Toggle Admin Role'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#ffffff', borderRadius: 8 },
  title: { fontSize: 18, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#666666' },
  badge: { fontSize: 12, color: '#0070f3', marginTop: 4 },
  error: { color: '#ff0000', marginTop: 8 },
  button: { marginTop: 12, padding: 8, backgroundColor: '#000000', borderRadius: 4 },
  buttonText: { color: '#ffffff', textAlign: 'center' },
});`;

const mockLongCode = Array.from({ length: 200 }, (_, i) => 
  `const item_${i} = { id: ${i}, name: 'Item ${i}', timestamp: ${Date.now() + i * 1000}, active: ${i % 2 === 0}, calculateValue: (multiplier: number) => ${i} * multiplier };`
).join('\n');

const mockMarkdown = `# Feature Analysis & Roadmap

This document outlines the **key architectural improvements** for our high-performance client.

## Core Priorities
1. **Performance**: Eliminate render latency on high-frequency streaming events.
2. **Memory Efficiency**: Optimize virtualized list node allocation.
3. **UX Polish**: Seamless transition between light and full syntax modes.

### Code Demonstration
Here is the optimized worker pattern:

\`\`\`typescript
export function processChunk(buffer: Uint8Array): ParsedFrame[] {
  const frames: ParsedFrame[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const header = readFrameHeader(buffer, offset);
    frames.push(parseFrameBody(buffer, offset + 4, header.length));
    offset += 4 + header.length;
  }
  return frames;
}
\`\`\`

> *Note:* Always check bounds before zero-copy slicing to avoid buffer overflows.

For more details, visit [Documentation](https://docs.expo.dev).`;

const mockDiffPatch = `diff --git a/src/core/engine.ts b/src/core/engine.ts
index 83a21bc..9f12d44 100644
--- a/src/core/engine.ts
+++ b/src/core/engine.ts
@@ -12,8 +12,12 @@ export class Engine {
   private state: EngineState;
+  private cache: Map<string, CacheEntry>;
+  private maxCacheSize: number;

-  constructor() {
+  constructor(options: EngineOptions = {}) {
     this.state = 'idle';
+    this.cache = new Map();
+    this.maxCacheSize = options.maxCacheSize ?? 1000;
   }

@@ -45,7 +49,11 @@ export class Engine {
   public execute(command: string): Result {
-    return this.runSync(command);
+    const cached = this.cache.get(command);
+    if (cached && Date.now() - cached.time < 5000) {
+      return cached.result;
+    }
+    const result = this.runSync(command);
+    this.cache.set(command, { result, time: Date.now() });
+    return result;
   }
 }`;

const mockVcsDiff: VcsFileDiff = {
  file: 'src/core/engine.ts',
  additions: 14,
  deletions: 2,
  patch: mockDiffPatch,
};

const mockLongDiff: VcsFileDiff = {
  file: 'src/components/large-module.tsx',
  additions: 250,
  deletions: 120,
  patch: `@@ -1,50 +1,70 @@\n` + Array.from({ length: 300 }, (_, i) => 
    i % 3 === 0 ? `+ const line_${i} = computeOptimizedValue(${i});` :
    i % 3 === 1 ? `- const line_${i} = computeLegacySlowValue(${i});` :
    `  const line_${i} = existingContextValue(${i});`
  ).join('\n'),
};

const mockMessages: UIMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Can you analyze our codebase and check the benchmark results?' }],
  },
  {
    id: 'msg-2',
    role: 'assistant',
    model: 'claude-3-7-sonnet',
    durationMs: 2450,
    parts: [
      { type: 'reasoning', text: 'Let me think about how to systematically benchmark each component with mock data...' },
      { type: 'text', text: 'I will analyze the components and run benchmarks.' },
      {
        type: 'tool-bash',
        toolCallId: 'call-1',
        toolName: 'bash',
        title: 'Run benchmark tests',
        state: 'output-available',
        input: { command: 'npm run test:benchmark' },
        output: 'All 42 component benchmarks completed successfully in 142ms.',
      },
      {
        type: 'tool-read',
        toolCallId: 'call-2',
        toolName: 'read',
        title: 'Read configuration',
        state: 'output-available',
        input: { filePath: '/src/chat/settings.tsx', offset: 1, limit: 30 },
        output: mockShortCode,
      },
      {
        type: 'tool-edit',
        toolCallId: 'call-3',
        toolName: 'edit',
        title: 'Edit component',
        state: 'output-available',
        input: {
          filePath: '/src/components/chat/message-item.tsx',
          oldString: 'const isUser = message.role === "user";',
          newString: 'const isUser = useMemo(() => message.role === "user", [message.role]);',
        },
        output: 'Replacement applied successfully.',
      },
      {
        type: 'tool-todowrite',
        toolCallId: 'call-4',
        toolName: 'todowrite',
        title: 'Task list',
        state: 'output-available',
        input: {
          todos: [
            { content: 'Profile UI components', status: 'completed', priority: 'high' },
            { content: 'Profile AI element components', status: 'completed', priority: 'high' },
            { content: 'Profile chat sheet & panel components', status: 'in_progress', priority: 'medium' },
            { content: 'Optimize detected bottlenecks', status: 'pending', priority: 'high' },
          ],
        },
      },
      {
        type: 'tool-question',
        toolCallId: 'call-5',
        toolName: 'question',
        title: 'Optimization preference',
        state: 'output-available',
        input: {
          questions: [
            {
              header: 'Optimization Strategy',
              question: 'Which components should we prioritize for memoization and caching?',
              options: [
                { label: 'HighlightedCode & Markdown', description: 'Prism tokens and markdown AST' },
                { label: 'MessageItem & Tool Rows', description: 'Chat message list row rendering' },
                { label: 'Sheets & Panels', description: 'Diffs and file viewers' },
              ],
              multiple: true,
            },
          ],
        },
        metadata: { answers: [['HighlightedCode & Markdown', 'MessageItem & Tool Rows']] },
      },
    ],
  },
];

const mockStreamingMessage: UIMessage = {
  id: 'msg-stream',
  role: 'assistant',
  model: 'claude-3-7-sonnet',
  parts: [
    {
      type: 'text',
      text: `Here's the change I made:\n\n\`\`\`tsx\n${mockMediumCode}\n\`\`\`\n\nLet me verify it typechecks cleanly before summarizing.`,
    },
  ],
};

const mockSession: OpencodeSession = {
  id: 'session-123',
  title: 'Performance Optimization & Benchmarking',
  time: { created: Date.now() - 3600000, updated: Date.now() - 60000 },
  tokens: {
    input: 18450,
    output: 3200,
    reasoning: 1200,
    cache: { read: 8400, write: 1200 },
  },
  cost: 0.0845,
};

const mockSessionsList: OpencodeSession[] = Array.from({ length: 30 }, (_, i) => ({
  id: `session-${i}`,
  title: `Session ${i}: ${i % 3 === 0 ? 'Fix memory leak' : i % 3 === 1 ? 'Add dark mode' : 'Refactor auth service'}`,
  time: { created: Date.now() - i * 3600000, updated: Date.now() - i * 180000 },
  tokens: { input: 5000 + i * 1000, output: 1000 + i * 200, reasoning: 0, cache: { read: 0, write: 0 } },
  cost: 0.01 * i,
}));

// ============================================================================
// Benchmark Runner Framework
// ============================================================================

export type BenchmarkCase = {
  name: string;
  category: 'UI' | 'AI Elements' | 'Tool Renderers' | 'Chat Panels' | 'Complex Message/List';
  render: () => React.ReactElement;
  iterations?: number;
};

export type BenchmarkResult = {
  name: string;
  category: string;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
};

function BenchmarkWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DialogProvider>
        {children}
      </DialogProvider>
    </QueryClientProvider>
  );
}

export function runBenchmark(bCase: BenchmarkCase, iterations = 150, warmup = 30): BenchmarkResult {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    evaluateTree(bCase.render());
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    evaluateTree(bCase.render());
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const avgMs = sum / times.length;
  const medianMs = times[Math.floor(times.length / 2)];
  const p95Ms = times[Math.floor(times.length * 0.95)];
  const minMs = times[0];
  const maxMs = times[times.length - 1];
  const opsPerSec = avgMs > 0 ? 1000 / avgMs : 999999;

  return {
    name: bCase.name,
    category: bCase.category,
    avgMs,
    medianMs,
    p95Ms,
    minMs,
    maxMs,
    opsPerSec,
  };
}

// ============================================================================
// Benchmark Test Suite Definitions
// ============================================================================

export const benchmarkSuite: BenchmarkCase[] = [
  // --- UI Components ---
  {
    name: 'Badge (Default / Secondary / Outline)',
    category: 'UI',
    render: () => (
      <React.Fragment>
        <Badge variant="default">Default Badge</Badge>
        <Badge variant="secondary">Secondary Badge</Badge>
        <Badge variant="outline">Outline Badge</Badge>
        <Badge variant="destructive">Destructive Badge</Badge>
      </React.Fragment>
    ),
  },
  {
    name: 'Button (Variants, sizes, string & node children)',
    category: 'UI',
    render: () => (
      <React.Fragment>
        <Button variant="default" size="default">Submit Action</Button>
        <Button variant="secondary" size="sm">Cancel Action</Button>
        <Button variant="outline" size="lg">Outline Action</Button>
        <Button variant="destructive" size="default">Delete Item</Button>
        <Button variant="ghost" size="icon">Icon</Button>
      </React.Fragment>
    ),
  },
  {
    name: 'Collapsible (Open & closed tree)',
    category: 'UI',
    render: () => (
      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger>Trigger Header</CollapsibleTrigger>
        <CollapsibleContent>
          <Badge>Inside Collapsible Content</Badge>
          <Button>Action Inside</Button>
        </CollapsibleContent>
      </Collapsible>
    ),
  },
  {
    name: 'ErrorState & ServerErrorState',
    category: 'UI',
    render: () => (
      <React.Fragment>
        <ErrorState kind="server" title="Failed to load" message="Network timeout occurred" onRetry={() => {}} />
        <NotFoundState title="File not found" message="Path /foo/bar missing" onRetry={() => {}} />
      </React.Fragment>
    ),
  },
  {
    name: 'Spinner (Reanimated SharedValue & Style)',
    category: 'UI',
    render: () => <Spinner size={20} color="#3b82f6" />,
  },
  {
    name: 'HighlightedCode - Short Snippet (Prism)',
    category: 'UI',
    render: () => <HighlightedCode code={mockShortCode} language="typescript" showLineNumbers />,
  },
  {
    name: 'HighlightedCode - Medium Code 40 lines (Prism)',
    category: 'UI',
    render: () => <HighlightedCode code={mockMediumCode} language="tsx" showLineNumbers selectable />,
  },
  {
    name: 'HighlightedCode - Long Code 200 lines (Prism)',
    category: 'UI',
    render: () => <HighlightedCode code={mockLongCode} language="typescript" showLineNumbers selectable />,
  },

  // --- AI Elements ---
  {
    name: 'Attachments (Grid, Inline, List with mock files)',
    category: 'AI Elements',
    render: () => {
      const files: AttachmentData[] = [
        { type: 'file', id: 'f1', filename: 'screenshot.png', mediaType: 'image/png', url: 'https://example.com/img.png' },
        { type: 'file', id: 'f2', filename: 'report.pdf', mediaType: 'application/pdf' },
        { type: 'source-document', id: 'f3', title: 'Architecture RFC', filename: 'rfc.md' },
      ];
      return (
        <React.Fragment>
          <Attachments variant="grid">
            {files.map((f) => (
              <Attachment key={f.id} data={f} onRemove={() => {}}>
                <AttachmentPreview />
                <AttachmentInfo showMediaType />
                <AttachmentRemove />
              </Attachment>
            ))}
          </Attachments>
          <Attachments variant="inline">
            {files.map((f) => (
              <Attachment key={f.id} data={f}>
                <AttachmentPreview />
                <AttachmentInfo />
              </Attachment>
            ))}
          </Attachments>
        </React.Fragment>
      );
    },
  },
  {
    name: 'ChainOfThought (Steps, badges, content)',
    category: 'AI Elements',
    render: () => (
      <ChainOfThought defaultOpen={true}>
        <ChainOfThoughtHeader>Thinking Process</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <ChainOfThoughtStep label="Searched workspace" description="Found 14 relevant files" status="complete" />
          <ChainOfThoughtStep label="Analyzing dependencies" description="Checking import graph" status="active" />
          <ChainOfThoughtSearchResults>
            <ChainOfThoughtSearchResult>ChatScreen.tsx</ChainOfThoughtSearchResult>
            <ChainOfThoughtSearchResult>message-item.tsx</ChainOfThoughtSearchResult>
          </ChainOfThoughtSearchResults>
        </ChainOfThoughtContent>
      </ChainOfThought>
    ),
  },
  {
    name: 'Checkpoint',
    category: 'AI Elements',
    render: () => (
      <Checkpoint>
        <CheckpointIcon />
        <CheckpointTrigger>Revert checkpoint</CheckpointTrigger>
      </Checkpoint>
    ),
  },
  {
    name: 'CodeBlock (Medium code)',
    category: 'AI Elements',
    render: () => <CodeBlock code={mockMediumCode} language="typescript" />,
  },
  {
    name: 'Confirmation Card',
    category: 'AI Elements',
    render: () => (
      <Confirmation approval={{ id: 'app-1', approved: undefined }} state="approval-requested">
        <ConfirmationRequest>
          <ConfirmationActions>
            <ConfirmationAction>Allow</ConfirmationAction>
            <ConfirmationAction variant="outline">Reject</ConfirmationAction>
          </ConfirmationActions>
        </ConfirmationRequest>
      </Confirmation>
    ),
  },
  {
    name: 'Context Trigger & Breakdown Modal',
    category: 'AI Elements',
    render: () => (
      <Context
        usedTokens={18450}
        maxTokens={128000}
        modelId="claude-3-7-sonnet"
        usage={{ inputTokens: 18450, outputTokens: 3200, reasoningTokens: 1200, cachedInputTokens: 8400 }}
      >
        <ContextTrigger />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody>
            <ContextInputUsage />
            <ContextOutputUsage />
            <ContextReasoningUsage />
            <ContextCacheUsage />
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>
    ),
  },
  {
    name: 'InlineCitation & Carousel',
    category: 'AI Elements',
    render: () => (
      <InlineCitation>
        <InlineCitationText>According to recent benchmarks</InlineCitationText>
        <InlineCitationCard defaultOpen={true}>
          <InlineCitationCardTrigger sources={['https://github.com/facebook/react', 'https://expo.dev']} />
          <InlineCitationCardBody>
            <InlineCitationCarousel>
              <InlineCitationCarouselContent>
                <InlineCitationCarouselItem>
                  <InlineCitationSource title="React Core Repo" url="https://github.com/facebook/react" description="Declarative UI library" />
                  <InlineCitationQuote>React 19 compiler optimizations</InlineCitationQuote>
                </InlineCitationCarouselItem>
              </InlineCitationCarouselContent>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
    ),
  },
  {
    name: 'Loader & Shimmer',
    category: 'AI Elements',
    render: () => <Loader label="Computing optimal execution plan..." />,
  },
  {
    name: 'Message & MessageToolbar',
    category: 'AI Elements',
    render: () => (
      <Message from="assistant">
        <MessageContent>
          <MessageText>Here is the analyzed result from the execution engine.</MessageText>
        </MessageContent>
        <MessageToolbar>
          <MessageActions>
            <MessageAction label="Copy">Copy</MessageAction>
            <MessageAction label="Fork">Fork</MessageAction>
          </MessageActions>
        </MessageToolbar>
      </Message>
    ),
  },
  {
    name: 'Plan (Streaming & Collapsible)',
    category: 'AI Elements',
    render: () => (
      <Plan defaultOpen={true} isStreaming={false}>
        <PlanHeader>
          <PlanTitle>Refactoring Plan</PlanTitle>
          <PlanDescription>3 steps identified</PlanDescription>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent>
          <Badge>Step 1: Benchmark</Badge>
          <Badge>Step 2: Profile</Badge>
          <Badge>Step 3: Optimize</Badge>
        </PlanContent>
        <PlanFooter />
      </Plan>
    ),
  },
  {
    name: 'PromptInput (With Attachments & Controls)',
    category: 'AI Elements',
    render: () => (
      <PromptInput
        value="Please review this file and fix the performance issue"
        onChangeText={() => {}}
        onSubmit={() => {}}
        attachments={[
          { id: 'att-1', kind: 'image', uri: 'file:///photo.jpg', name: 'photo.jpg', mime: 'image/jpeg' },
          { id: 'att-2', kind: 'file', uri: 'file:///doc.pdf', name: 'doc.pdf', mime: 'application/pdf' },
        ]}
        footer={<PromptInputFooter><Button size="sm">Commands</Button></PromptInputFooter>}
      />
    ),
  },
  {
    name: 'Queue (Items, indicators, attachments)',
    category: 'AI Elements',
    render: () => (
      <Queue>
        <QueueSection defaultOpen={true}>
          <QueueSectionTrigger>
            <QueueSectionLabel count={2} label="Pending Tasks" />
          </QueueSectionTrigger>
          <QueueSectionContent>
            <QueueList>
              <QueueItem>
                <QueueItemIndicator completed={false} />
                <QueueItemContent>Run typecheck</QueueItemContent>
                <QueueItemDescription>tsc --noEmit</QueueItemDescription>
              </QueueItem>
              <QueueItem>
                <QueueItemIndicator completed={true} />
                <QueueItemContent completed={true}>Fetch dependencies</QueueItemContent>
              </QueueItem>
            </QueueList>
          </QueueSectionContent>
        </QueueSection>
      </Queue>
    ),
  },
  {
    name: 'Reasoning (Collapsible & Response)',
    category: 'AI Elements',
    render: () => (
      <Reasoning defaultOpen={true} duration={4}>
        <ReasoningTrigger />
        <ReasoningContent>We need to isolate data fetching from component rendering to prevent smear.</ReasoningContent>
      </Reasoning>
    ),
  },
  {
    name: 'Response (Rich Markdown with Code Block)',
    category: 'AI Elements',
    render: () => <Response>{mockMarkdown}</Response>,
  },
  {
    name: 'Sources & Source Links',
    category: 'AI Elements',
    render: () => (
      <Sources>
        <SourcesTrigger count={3} />
        <SourcesContent>
          <Source href="https://react.dev" title="React Documentation" />
          <Source href="https://expo.dev" title="Expo Documentation" />
          <Source href="https://github.com" title="GitHub Repository" />
        </SourcesContent>
      </Sources>
    ),
  },
  {
    name: 'Suggestions (Horizontal list)',
    category: 'AI Elements',
    render: () => (
      <Suggestions>
        <Suggestion suggestion="What can you do?" />
        <Suggestion suggestion="Explain this project" />
        <Suggestion suggestion="List the files here" />
        <Suggestion suggestion="Run benchmark tests" />
      </Suggestions>
    ),
  },
  {
    name: 'Task (Subagent steps & collapsible)',
    category: 'AI Elements',
    render: () => (
      <Task defaultOpen={true}>
        <TaskTrigger title="Explore codebase" />
        <TaskContent>
          <TaskItem>Found matching patterns in:</TaskItem>
          <TaskItemFile>src/components/chat/message-item.tsx</TaskItemFile>
          <TaskItemFile>src/components/ui/highlighted-code.tsx</TaskItemFile>
        </TaskContent>
      </Task>
    ),
  },
  {
    name: 'Tool (Generic parameters & output)',
    category: 'AI Elements',
    render: () => (
      <Tool defaultOpen={true}>
        <ToolHeader toolName="custom_tool" title="Custom Tool Action" state="output-available" />
        <ToolContent>
          <ToolInput input={{ query: 'find slow components', depth: 3 }} />
          <ToolOutput output={{ count: 12, slow: ['HighlightedCode', 'ReviewPanel'] }} />
        </ToolContent>
      </Tool>
    ),
  },

  // --- Tool Renderers ---
  {
    name: 'BashTool (Command & Result)',
    category: 'Tool Renderers',
    render: () => (
      <BashTool
        input={{ command: 'git status && npm run test', workdir: '/home/getter/project' }}
        output="On branch main. Nothing to commit, working tree clean."
        state="output-available"
      />
    ),
  },
  {
    name: 'ReadTool (File & Code Content)',
    category: 'Tool Renderers',
    render: () => (
      <ReadTool
        input={{ filePath: '/src/components/ui/button.tsx', offset: 1, limit: 35 }}
        output={mockShortCode}
        state="output-available"
      />
    ),
  },
  {
    name: 'WriteTool (File & Preview)',
    category: 'Tool Renderers',
    render: () => (
      <WriteTool
        input={{ filePath: '/src/lib/utils.ts', content: mockMediumCode }}
        output="File written successfully."
        state="output-available"
      />
    ),
  },
  {
    name: 'EditTool (Diff Before & After)',
    category: 'Tool Renderers',
    render: () => (
      <EditTool
        input={{
          filePath: '/src/chat/use-opencode-chat.ts',
          oldString: 'const [status, setStatus] = useState<ChatStatus>("ready");',
          newString: 'const [status, setStatus] = useState<ChatStatus>("idle");',
          replaceAll: false,
        }}
        output="Edit applied successfully."
        state="output-available"
      />
    ),
  },
  {
    name: 'WebfetchTool (URL & Markdown content)',
    category: 'Tool Renderers',
    render: () => (
      <WebfetchTool
        input={{ url: 'https://docs.expo.dev/versions/v57.0.0', format: 'markdown' }}
        output={mockMarkdown}
        state="output-available"
      />
    ),
  },
  {
    name: 'TaskTool (Subagent delegated task)',
    category: 'Tool Renderers',
    render: () => (
      <TaskTool
        input={{ description: 'Analyze memory usage', prompt: 'Search all useEffect cleanup handlers', subagent_type: 'explore' }}
        output="Analysis complete: all cleanup hooks properly detach listeners."
        state="output-available"
      />
    ),
  },
  {
    name: 'QuestionTool (Interactive Options & Custom Input)',
    category: 'Tool Renderers',
    render: () => (
      <QuestionTool
        questions={[
          {
            header: 'Build Target',
            question: 'Which build target would you like to verify?',
            options: [
              { label: 'Dev Client', description: 'Port 8081 Metro bundle' },
              { label: 'Standalone Debug APK', description: 'Local debug build' },
            ],
            multiple: false,
            custom: true,
          },
        ]}
        answered={false}
        pending={true}
        onAnswer={async () => {}}
      />
    ),
  },
  {
    name: 'TodoTool (Task checklist status)',
    category: 'Tool Renderers',
    render: () => (
      <TodoTool
        todos={[
          { content: 'Verify baseline benchmark timings', status: 'completed', priority: 'high' },
          { content: 'Identify slow rendering hotspots', status: 'in_progress', priority: 'high' },
          { content: 'Apply targeted component optimizations', status: 'pending', priority: 'medium' },
          { content: 'Run comparison benchmark post-fix', status: 'pending', priority: 'high' },
        ]}
      />
    ),
  },
  {
    name: 'PermissionCard (Approval Buttons)',
    category: 'Tool Renderers',
    render: () => (
      <PermissionCard
        permission={{
          sessionID: 'session-1',
          requestID: 'req-1',
          permission: 'bash:exec',
          patterns: ['npm run build', 'npx expo export'],
          callID: 'call-1',
        }}
        onReply={async () => {}}
      />
    ),
  },

  // --- Chat Panels & Sheets ---
  {
    name: 'ContextPanel (Breakdown & Tokens Calculation)',
    category: 'Chat Panels',
    render: () => (
      <ContextPanel
        session={mockSession}
        messages={mockMessages}
        contextLimit={128000}
        modelLabel="claude-3-7-sonnet"
      />
    ),
  },
  {
    name: 'ReviewPanel (Diff row rendering - Short Diff)',
    category: 'Chat Panels',
    render: () => (
      <ReviewPanel
        server={mockServer}
        onOpenFullScreen={() => {}}
        listHeight={400}
      />
    ),
  },
  {
    name: 'FullScreenDiffViewer (300 Lines Diff)',
    category: 'Chat Panels',
    render: () => <FullScreenDiffViewer diff={mockLongDiff} onClose={() => {}} />,
  },
  {
    name: 'FilePanel (Directory listing)',
    category: 'Chat Panels',
    render: () => (
      <FilePanel
        server={mockServer}
        state={{ dir: '.', setDir: () => {}, file: undefined, setFile: () => {} }}
        onOpenFullScreen={() => {}}
      />
    ),
  },
  {
    name: 'SessionsDrawer (Drawer navigation with 30 items)',
    category: 'Chat Panels',
    render: () => (
      <SessionsDrawer
        sessions={mockSessionsList}
        activeSessionId="session-0"
        activeServerName="Local Dev Server"
        projectDirectory="/home/getter/Projects/opencode-expo"
        onSelect={() => {}}
        onNewSession={() => {}}
        onDeleteSession={() => {}}
        onRenameSession={() => {}}
        onOpenSettings={() => {}}
      >
        <HamburgerButton onPress={() => {}} />
      </SessionsDrawer>
    ),
  },
  {
    name: 'SessionMenuSheet (Session options menu)',
    category: 'Chat Panels',
    render: () => (
      <SessionMenuSheet
        onClose={() => {}}
        modelLabel="claude-3-7-sonnet"
        onSelectModel={() => {}}
        onOpenPanel={() => {}}
        onForkSession={() => {}}
        isForking={false}
        forkDisabled={false}
        onUndo={() => {}}
        onRedo={() => {}}
        historyDisabled={false}
        onShare={() => {}}
        shareHint="Share session"
        shared={false}
        onUnshare={() => {}}
        onSummarize={() => {}}
        onOpenChildren={() => {}}
        childCount={2}
      />
    ),
  },
  {
    name: 'NewSessionSheet (Folder chooser)',
    category: 'Chat Panels',
    render: () => (
      <NewSessionSheet
        visible={true}
        onClose={() => {}}
        server={mockServer}
        currentDirectory="/home/getter/Projects/opencode-expo"
        onCreate={() => {}}
      />
    ),
  },
  {
    name: 'ShellSheet (Run shell command)',
    category: 'Chat Panels',
    render: () => (
      <ShellSheet
        visible={true}
        onClose={() => {}}
        directoryLabel="/home/getter/Projects/opencode-expo"
        isBusy={false}
        onRun={() => {}}
      />
    ),
  },
  {
    name: 'TerminalScreen (PTY Terminal UI)',
    category: 'Chat Panels',
    render: () => (
      <TerminalScreen
        visible={true}
        server={mockServer}
        onClose={() => {}}
      />
    ),
  },
  {
    name: 'ErrorBoundary & SystemBars',
    category: 'Chat Panels',
    render: () => (
      <ErrorBoundary>
        <SystemBars />
        <Badge>App Content</Badge>
      </ErrorBoundary>
    ),
  },

  {
    name: 'ModelPicker (Provider/Model Selection Dialog)',
    category: 'Chat Panels',
    render: () => (
      <ModelPicker
        visible={true}
        onClose={() => {}}
        onManageProviders={() => {}}
      />
    ),
  },
  {
    name: 'ModelsTab (Visibility Toggles & Search)',
    category: 'Chat Panels',
    render: () => <ModelsTab server={mockServer} />,
  },
  {
    name: 'ProvidersSheet (Providers & Management Sheet)',
    category: 'Chat Panels',
    render: () => <ProvidersSheet visible={true} onClose={() => {}} />,
  },
  {
    name: 'SettingsForm (Server & Theme Settings)',
    category: 'Chat Panels',
    render: () => <SettingsForm visible={true} onClose={() => {}} />,
  },
  {
    name: 'QuickOpenSheet (File Fuzzy Search Sheet)',
    category: 'Chat Panels',
    render: () => <QuickOpenSheet visible={true} onClose={() => {}} server={mockServer} onInsertMention={() => {}} />,
  },
  {
    name: 'ComposerSuggestions (Slash & File Mention Trigger)',
    category: 'Chat Panels',
    render: () => (
      <ComposerSuggestions
        server={mockServer}
        enabled={true}
        value="/mod"
        selection={{ start: 4, end: 4 }}
        onInsert={() => {}}
      />
    ),
  },
  // --- Complex Message / List ---
  {
    name: 'MessageItem - User Prompt',
    category: 'Complex Message/List',
    render: () => (
      <MessageItem
        message={mockMessages[0]}
        isLast={false}
        status="ready"
        onFork={() => {}}
        forkTarget={null}
        forkDisabled={false}
        pendingQuestions={[]}
        onAnswerQuestion={async () => {}}
        onRejectQuestion={async () => {}}
        pendingPermissions={[]}
        onReplyPermission={async () => {}}
        onDeleteMessage={() => {}}
        onRetry={() => {}}
      />
    ),
  },
  {
    name: 'MessageItem - Assistant Multi-Tool Message (Heavy)',
    category: 'Complex Message/List',
    render: () => (
      <MessageItem
        message={mockMessages[1]}
        isLast={true}
        status="ready"
        onFork={() => {}}
        forkTarget={null}
        forkDisabled={false}
        pendingQuestions={[]}
        onAnswerQuestion={async () => {}}
        onRejectQuestion={async () => {}}
        pendingPermissions={[]}
        onReplyPermission={async () => {}}
        onDeleteMessage={() => {}}
        onRetry={() => {}}
      />
    ),
  },
  {
    name: 'MessageItem - Streaming Text w/ Code Fence',
    category: 'Complex Message/List',
    render: () => (
      <MessageItem
        message={mockStreamingMessage}
        isLast={true}
        status="streaming"
        onFork={() => {}}
        forkTarget={null}
        forkDisabled={false}
        pendingQuestions={[]}
        onAnswerQuestion={async () => {}}
        onRejectQuestion={async () => {}}
        pendingPermissions={[]}
        onReplyPermission={async () => {}}
        onDeleteMessage={() => {}}
        onRetry={() => {}}
      />
    ),
  },
  {
    name: 'Conversation List (Full Chat View)',
    category: 'Complex Message/List',
    render: () => (
      <Conversation
        messages={mockMessages}
        renderItem={({ item }) => (
          <MessageItem
            message={item}
            isLast={item.id === 'msg-2'}
            status="ready"
            onFork={() => {}}
            forkTarget={null}
            forkDisabled={false}
            pendingQuestions={[]}
            onAnswerQuestion={async () => {}}
            onRejectQuestion={async () => {}}
            pendingPermissions={[]}
            onReplyPermission={async () => {}}
            onDeleteMessage={() => {}}
            onRetry={() => {}}
          />
        )}
      />
    ),
  },
];

// ============================================================================
// CLI Execution
// ============================================================================

export function runAllBenchmarks() {
  console.log('='.repeat(80));
  console.log('  OPENCODE EXPO - COMPONENT BENCHMARK SUITE (MOCK DATA)');
  console.log('='.repeat(80));
  console.log(`Running ${benchmarkSuite.length} component benchmark cases...\n`);

  const results: BenchmarkResult[] = [];

  for (let i = 0; i < benchmarkSuite.length; i++) {
    const bCase = benchmarkSuite[i];
    const res = runBenchmark(bCase);
    results.push(res);
    process.stdout.write(`[${i + 1}/${benchmarkSuite.length}] ${res.name.padEnd(52)} -> ${res.avgMs.toFixed(3)} ms/render (${Math.round(res.opsPerSec).toLocaleString()} ops/s)\n`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('  BENCHMARK SUMMARY (SORTED BY SLOWEST TO FASTEST)');
  console.log('='.repeat(80));

  const sorted = [...results].sort((a, b) => b.avgMs - a.avgMs);

  console.log(
    'Rank'.padEnd(6) +
    'Component / Scenario'.padEnd(46) +
    'Category'.padEnd(18) +
    'Avg (ms)'.padStart(10) +
    'Median'.padStart(10) +
    'p95'.padStart(10) +
    'Ops/sec'.padStart(12)
  );
  console.log('-'.repeat(112));

  sorted.forEach((r, idx) => {
    const rank = `#${idx + 1}`.padEnd(6);
    const name = (r.name.length > 44 ? r.name.slice(0, 41) + '...' : r.name).padEnd(46);
    const category = r.category.padEnd(18);
    const avg = r.avgMs.toFixed(3).padStart(10);
    const med = r.medianMs.toFixed(3).padStart(10);
    const p95 = r.p95Ms.toFixed(3).padStart(10);
    const ops = Math.round(r.opsPerSec).toLocaleString().padStart(12);

    console.log(`${rank}${name}${category}${avg}${med}${p95}${ops}`);
  });

  console.log('-'.repeat(112));

  return sorted;
}

if ((require as any).main === module || process.argv[1]?.includes('runner')) {
  runAllBenchmarks();
}
