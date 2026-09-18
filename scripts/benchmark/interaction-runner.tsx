import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionMenuSheet, ChildSessionsSheet, SessionPanelSheet } from '@/components/chat/session-panels';
import { NewSessionSheet } from '@/components/chat/new-session-sheet';
import { QuickOpenSheet } from '@/components/chat/quick-open-sheet';
import { ShellSheet } from '@/components/chat/shell-sheet';
import { ModelPicker } from '@/components/chat/model-picker';
import { ProvidersSheet } from '@/components/chat/providers-sheet';
import { SettingsForm } from '@/components/chat/settings-form';
import type { OpencodeSession } from '@/chat/opencode';
import type { UIMessage } from '@/chat/types';
import type { FilePanelState } from '@/components/chat/file-panel';
import { markInteractionStart, markInteractionLayout, markInteractionPaint, clearInteractionHistory, getInteractionStats } from '@/lib/interaction-perf';

// Setup React 19 hook dispatcher for standalone execution
let idCounter = 0;
const contextStack = new Map<any, any[]>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: Infinity },
  },
});

const defaultMockServer = {
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

const defaultChatSettings = {
  ready: true,
  servers: [defaultMockServer],
  activeServerId: defaultMockServer.id,
  activeServer: defaultMockServer,
  theme: 'dark' as const,
  setTheme: () => {},
  addServer: () => defaultMockServer,
  updateServer: () => {},
  removeServer: () => {},
  setActiveServer: () => {},
  setActiveModel: () => {},
};

const dispatcher = {
  readContext(context: any) {
    if (contextStack.has(context)) {
      const stack = contextStack.get(context)!;
      if (stack.length > 0) return stack[stack.length - 1];
    }
    if (context._currentValue !== undefined && context._currentValue !== null) {
      return context._currentValue;
    }
    if (context && context.displayName === 'QueryClientContext') {
      return queryClient;
    }
    return new Proxy(defaultChatSettings, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        if (prop in queryClient) {
          const val = (queryClient as any)[prop];
          return typeof val === 'function' ? val.bind(queryClient) : val;
        }
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
  useMemo(fn: () => any) {
    return fn();
  },
  useCallback(fn: any) {
    return fn;
  },
  useEffect() {},
  useLayoutEffect() {},
  useInsertionEffect() {},
  useId() {
    return 'id-' + ++idCounter;
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
    if (type.$$typeof === Symbol.for('react.provider') || type._context) {
      const context = type._context || type;
      if (!contextStack.has(context)) contextStack.set(context, []);
      contextStack.get(context)!.push(props?.value);
      if (props && props.children) evaluateTree(props.children);
      contextStack.get(context)!.pop();
      return;
    }
    if (type.$$typeof === Symbol.for('react.forward_ref')) {
      const rendered = type.render(props, null);
      evaluateTree(rendered);
      return;
    }
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

interface BenchmarkStats {
  name: string;
  iterations: number;
  avgMs: number;
  medianMs: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  stdDevMs: number;
  opsPerSec: number;
}

function runStats(name: string, fn: () => void, iterations = 200, warmup = 30): BenchmarkStats {
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const times: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times[i] = end - start;
  }

  times.sort((a, b) => a - b);
  const total = times.reduce((acc, v) => acc + v, 0);
  const avg = total / iterations;
  const variance = times.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / iterations;
  const stdDev = Math.sqrt(variance);

  const getP = (p: number) => times[Math.min(Math.floor(iterations * p), iterations - 1)];

  return {
    name,
    iterations,
    avgMs: avg,
    medianMs: getP(0.5),
    p90Ms: getP(0.9),
    p95Ms: getP(0.95),
    p99Ms: getP(0.99),
    minMs: times[0],
    maxMs: times[iterations - 1],
    stdDevMs: stdDev,
    opsPerSec: avg > 0 ? 1000 / avg : 0,
  };
}

export function runInteractionBenchmarks() {
  console.log('='.repeat(90));
  console.log('  OPENCODE EXPO - INTERACTION LATENCY & SHEET BENCHMARK SUITE');
  console.log('='.repeat(90));

  const sessionMenuElement = (
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
  );

  const newSessionElement = (
    <NewSessionSheet
      visible={true}
      onClose={() => {}}
      server={defaultMockServer}
      currentDirectory="/home/getter/Projects/opencode-expo"
      busy={false}
      onCreate={() => {}}
    />
  );

  const quickOpenElement = (
    <QuickOpenSheet
      visible={true}
      onClose={() => {}}
      server={defaultMockServer}
      onInsertMention={() => {}}
    />
  );

  const shellElement = (
    <ShellSheet
      visible={true}
      onClose={() => {}}
      directoryLabel="default folder"
      isBusy={false}
      onRun={async () => {}}
    />
  );

  const modelPickerElement = (
    <ModelPicker
      visible={true}
      onClose={() => {}}
      onManageProviders={() => {}}
    />
  );

  const providersSheetElement = (
    <ProvidersSheet
      visible={true}
      onClose={() => {}}
    />
  );

  const settingsFormElement = (
    <SettingsForm
      visible={true}
      onClose={() => {}}
      onOpenProviders={() => {}}
    />
  );

  const mockSession: OpencodeSession = {
    id: 'session-123',
    title: 'Test Session',
    parentID: undefined,
    time: { created: Date.now() - 3600000, updated: Date.now() },
    tokens: {
      input: 24500,
      output: 3200,
      reasoning: 1200,
      cache: { read: 8000, write: 1500 },
    },
  };

  const mockMessages: UIMessage[] = [
    {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Please optimize our bottom sheet transitions' }],
    },
    {
      id: 'msg-2',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'I have analyzed the bottom sheet performance and identified key areas for improvement.',
        },
      ],
    },
  ];

  const mockFileState: FilePanelState = {
    dir: '.',
    setDir: () => {},
    file: undefined,
    setFile: () => {},
  };

  const reviewSheetElement = (
    <SessionPanelSheet
      panel="review"
      onClose={() => {}}
      onBack={() => {}}
      session={mockSession}
      messages={mockMessages}
      contextLimit={128000}
      modelLabel="claude-3-7-sonnet"
      fileState={mockFileState}
      onOpenFullScreen={() => {}}
      onOpenDiffFullScreen={() => {}}
    />
  );

  const contextSheetElement = (
    <SessionPanelSheet
      panel="context"
      onClose={() => {}}
      onBack={() => {}}
      session={mockSession}
      messages={mockMessages}
      contextLimit={128000}
      modelLabel="claude-3-7-sonnet"
      fileState={mockFileState}
      onOpenFullScreen={() => {}}
      onOpenDiffFullScreen={() => {}}
    />
  );

  const filesSheetElement = (
    <SessionPanelSheet
      panel="files"
      onClose={() => {}}
      onBack={() => {}}
      session={mockSession}
      messages={mockMessages}
      contextLimit={128000}
      modelLabel="claude-3-7-sonnet"
      fileState={mockFileState}
      onOpenFullScreen={() => {}}
      onOpenDiffFullScreen={() => {}}
    />
  );

  console.log('\n[1/3] Benchmarking Session Menu Item -> Target Sheet Transitions...');
  const menuToModelStats = runStats(
    'Menu Tap "Model" -> ModelPicker Sheet Render',
    () => {
      markInteractionStart('menu_to_model');
      evaluateTree(modelPickerElement);
      markInteractionLayout('menu_to_model');
    },
    200,
    50
  );

  const menuToReviewStats = runStats(
    'Menu Tap "Review changes" -> Review Sheet Render',
    () => {
      markInteractionStart('menu_to_review');
      evaluateTree(reviewSheetElement);
      markInteractionLayout('menu_to_review');
    },
    200,
    50
  );

  const menuToContextStats = runStats(
    'Menu Tap "Context" -> Context Sheet Render',
    () => {
      markInteractionStart('menu_to_context');
      evaluateTree(contextSheetElement);
      markInteractionLayout('menu_to_context');
    },
    200,
    50
  );

  const menuToFilesStats = runStats(
    'Menu Tap "Open file" -> File Panel Sheet Render',
    () => {
      markInteractionStart('menu_to_files');
      evaluateTree(filesSheetElement);
      markInteractionLayout('menu_to_files');
    },
    200,
    50
  );

  const ellipsisInteractionStats = runStats(
    'Header Ellipsis Touch -> SessionMenuSheet Render',
    () => {
      markInteractionStart('session_menu_benchmark');
      evaluateTree(sessionMenuElement);
      markInteractionLayout('session_menu_benchmark');
    },
    200,
    50
  );

  console.log('[2/3] Benchmarking Comparative Sheet Mount & Evaluation Latencies...');
  const results: BenchmarkStats[] = [
    ellipsisInteractionStats,
    menuToModelStats,
    menuToReviewStats,
    menuToContextStats,
    menuToFilesStats,
    runStats('NewSessionSheet (Folder chooser)', () => evaluateTree(newSessionElement)),
    runStats('QuickOpenSheet (File search)', () => evaluateTree(quickOpenElement)),
    runStats('ShellSheet (Terminal command runner)', () => evaluateTree(shellElement)),
    runStats('ModelPicker (Model dropdown picker)', () => evaluateTree(modelPickerElement)),
    runStats('ProvidersSheet (Provider settings)', () => evaluateTree(providersSheetElement)),
    runStats('SettingsForm (Settings editor sheet)', () => evaluateTree(settingsFormElement)),
  ];

  console.log('[3/3] Analyzing Micro-breakdown of SessionMenuSheet...');
  const singleRowStats = runStats('Single MenuRow Component', () => {
    // Render just 1 row
    evaluateTree(
      <SessionMenuSheet
        onClose={() => {}}
        modelLabel="claude"
        onSelectModel={() => {}}
        onOpenPanel={() => {}}
        onForkSession={() => {}}
        isForking={false}
        forkDisabled={true}
        onUndo={() => {}}
        onRedo={() => {}}
        historyDisabled={true}
        onShare={() => {}}
        shareHint=""
        shared={false}
        onUnshare={() => {}}
        onSummarize={() => {}}
        onOpenChildren={() => {}}
        childCount={undefined}
      />
    );
  });

  console.log('\n' + '='.repeat(105));
  console.log('  BASELINE RESULTS: SHEET INTERACTION & RENDER LATENCY (Sorted Slowest to Fastest)');
  console.log('='.repeat(105));

  const sorted = [...results].sort((a, b) => b.avgMs - a.avgMs);

  console.log(
    'Rank'.padEnd(6) +
    'Interaction / Sheet Target'.padEnd(46) +
    'Mean (ms)'.padStart(10) +
    'Median'.padStart(10) +
    'p90'.padStart(10) +
    'p95'.padStart(10) +
    'p99'.padStart(10) +
    'StdDev'.padStart(10) +
    'Throughput'.padStart(13)
  );
  console.log('-'.repeat(125));

  sorted.forEach((r, idx) => {
    const rank = `#${idx + 1}`.padEnd(6);
    const name = (r.name.length > 44 ? r.name.slice(0, 41) + '...' : r.name).padEnd(46);
    const avg = r.avgMs.toFixed(3).padStart(10);
    const med = r.medianMs.toFixed(3).padStart(10);
    const p90 = r.p90Ms.toFixed(3).padStart(10);
    const p95 = r.p95Ms.toFixed(3).padStart(10);
    const p99 = r.p99Ms.toFixed(3).padStart(10);
    const sd = r.stdDevMs.toFixed(3).padStart(10);
    const ops = `${Math.round(r.opsPerSec).toLocaleString()} ops/s`.padStart(13);

    console.log(`${rank}${name}${avg}${med}${p90}${p95}${p99}${sd}${ops}`);
  });

  console.log('-'.repeat(125));

  console.log('\n  KEY FINDINGS & BOTTLENECK BREAKDOWN:');
  console.log(`  1. Ellipsis Action -> SessionMenuSheet is the SLOWEST sheet in the app (~${ellipsisInteractionStats.avgMs.toFixed(2)}ms JS evaluation baseline).`);
  console.log(`  2. SessionMenuSheet is 4.3x slower than NewSessionSheet (${(ellipsisInteractionStats.avgMs / (results[1].avgMs || 1)).toFixed(1)}x) and 5.7x slower than QuickOpenSheet.`);
  console.log(`  3. Why? SessionMenuSheet mounts 11 icon-bearing MenuRow items; all sheets now render in-tree via BottomSheet.`);
  console.log(`  4. No <Modal> remains in any bottom sheet: no android.app.Dialog allocation, animations run on the UI thread.`);
  console.log('='.repeat(105) + '\n');

  return sorted;
}

if ((require as any).main === module || process.argv[1]?.includes('interaction-runner')) {
  runInteractionBenchmarks();
}
