import { useSyncExternalStore } from 'react';

export type AdaptiveRenderMode = 'normal' | 'light';

/**
 * LegendList's `experimental_adaptiveRender` reports when the list is flinging
 * fast. Rows subscribe here so they can swap expensive content (markdown
 * parsing, Prism tokenizing) for plain text while scrolling, then restore it
 * once scrolling settles.
 *
 * Deliberately a tiny external store rather than React context/state: the
 * list docs warn that pushing a frequently changing value through the list
 * re-renders every row. Here only the rows that subscribe re-render, and only
 * when the mode actually flips.
 */
let mode: AdaptiveRenderMode = 'normal';
const listeners = new Set<() => void>();

export function setAdaptiveRenderMode(next: AdaptiveRenderMode) {
  if (next === mode) {
    return;
  }
  mode = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AdaptiveRenderMode {
  return mode;
}

export function useAdaptiveRenderMode(): AdaptiveRenderMode {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
