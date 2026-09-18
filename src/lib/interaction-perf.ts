export interface InteractionMetric {
  name: string;
  startTime: number;
  jsDuration: number;
  totalDuration: number;
  timestamp: number;
}

export interface InteractionStats {
  name: string;
  count: number;
  mean: number;
  median: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  stdDev: number;
}

const activeInteractions = new Map<string, number>();
const history = new Map<string, InteractionMetric[]>();
const MAX_HISTORY_PER_INTERACTION = 200;

export function markInteractionStart(name: string): number {
  const now = performance.now();
  activeInteractions.set(name, now);
  return now;
}

export function markInteractionLayout(name: string): number | null {
  const start = activeInteractions.get(name);
  if (start === undefined) return null;
  return performance.now() - start;
}

export function markInteractionPaint(
  name: string,
  onComplete?: (metric: InteractionMetric) => void
): void {
  const start = activeInteractions.get(name);
  if (start === undefined) return;

  const jsDuration = performance.now() - start;

  // Double requestAnimationFrame ensures the frame was submitted to the native display pipeline
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const activeStart = activeInteractions.get(name);
      if (activeStart === undefined) return;
      activeInteractions.delete(name);

      const totalDuration = performance.now() - activeStart;
      const metric: InteractionMetric = {
        name,
        startTime: activeStart,
        jsDuration,
        totalDuration,
        timestamp: Date.now(),
      };

      let list = history.get(name);
      if (!list) {
        list = [];
        history.set(name, list);
      }
      list.push(metric);
      if (list.length > MAX_HISTORY_PER_INTERACTION) {
        list.shift();
      }

      if (__DEV__) {
        console.log(
          `[InteractionPerf] ${name} -> total: ${totalDuration.toFixed(2)}ms (JS/layout: ${jsDuration.toFixed(2)}ms)`
        );
      }

      onComplete?.(metric);
    });
  });
}

export function getInteractionHistory(name: string): InteractionMetric[] {
  return history.get(name) ?? [];
}

export function getInteractionStats(name: string): InteractionStats | null {
  const samples = history.get(name);
  if (!samples || samples.length === 0) return null;

  const durations = samples.map((s) => s.totalDuration).sort((a, b) => a - b);
  const count = durations.length;
  const sum = durations.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  const variance =
    durations.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const getPercentile = (p: number) => {
    const idx = Math.min(Math.floor(count * p), count - 1);
    return durations[idx];
  };

  return {
    name,
    count,
    mean,
    median: getPercentile(0.5),
    p90: getPercentile(0.9),
    p95: getPercentile(0.95),
    p99: getPercentile(0.99),
    min: durations[0],
    max: durations[count - 1],
    stdDev,
  };
}

export function clearInteractionHistory(name?: string): void {
  if (name) {
    history.delete(name);
    activeInteractions.delete(name);
  } else {
    history.clear();
    activeInteractions.clear();
  }
}
