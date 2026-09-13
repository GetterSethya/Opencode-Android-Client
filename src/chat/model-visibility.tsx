import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type ModelVisibilityState = 'show' | 'hide';

export type ModelVisibilityKey = {
  providerID: string;
  modelID: string;
};

export type ModelVisibilityMeta = ModelVisibilityKey & {
  family?: string | null;
  release_date?: string | null;
};

type StoredEntry = ModelVisibilityKey & { visibility: ModelVisibilityState };

type StoredState = {
  user: StoredEntry[];
};

const STORAGE_KEY = 'opencode.model-visibility.v1';
const SIX_MONTHS_MS = 6 * 30.44 * 24 * 3600 * 1000;

export function modelVisibilityKey(key: ModelVisibilityKey): string {
  return `${key.providerID}:${key.modelID}`;
}

/**
 * Mirrors the web client's "latest" rule: models released within the last
 * 6 months, newest per family per provider.
 */
export function computeLatestModelKeys(models: ModelVisibilityMeta[]): Set<string> {
  const now = Date.now();
  const recent = models.filter((model) => {
    if (!model.release_date) {
      return false;
    }
    const time = Date.parse(model.release_date);
    return Number.isFinite(time) && Math.abs(now - time) < SIX_MONTHS_MS;
  });

  const byProvider = new Map<string, ModelVisibilityMeta[]>();
  for (const model of recent) {
    const list = byProvider.get(model.providerID) ?? [];
    list.push(model);
    byProvider.set(model.providerID, list);
  }

  const latest = new Set<string>();
  for (const list of byProvider.values()) {
    const byFamily = new Map<string, ModelVisibilityMeta[]>();
    for (const model of list) {
      const family = model.family || model.modelID;
      const group = byFamily.get(family) ?? [];
      group.push(model);
      byFamily.set(family, group);
    }
    for (const group of byFamily.values()) {
      group.sort(
        (a, b) => Date.parse(b.release_date as string) - Date.parse(a.release_date as string),
      );
      const newest = group[0];
      if (newest) {
        latest.add(modelVisibilityKey({ providerID: newest.providerID, modelID: newest.modelID }));
      }
    }
  }
  return latest;
}

/**
 * Mirrors the web client's default visibility: explicit prefs win, otherwise
 * "latest" models and models with an unknown release date are shown.
 */
export function isModelVisibleByDefault(
  key: ModelVisibilityKey,
  releaseDate: string | null | undefined,
  latest: Set<string>,
): boolean {
  if (latest.has(modelVisibilityKey(key))) {
    return true;
  }
  if (!releaseDate) {
    return true;
  }
  return !Number.isFinite(Date.parse(releaseDate));
}

function parseStored(raw: string | null): StoredEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (!Array.isArray(parsed.user)) {
      return [];
    }
    return parsed.user.filter(
      (entry) =>
        entry &&
        typeof entry.providerID === 'string' &&
        typeof entry.modelID === 'string' &&
        (entry.visibility === 'show' || entry.visibility === 'hide'),
    );
  } catch {
    return [];
  }
}

export function useModelVisibility() {
  const [user, setUser] = useState<StoredEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) {
          setUser(parseStored(raw));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: StoredEntry[]) => {
    setUser(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: next })).catch(() => undefined);
  }, []);

  const visibilityMap = useMemo(() => {
    const map = new Map<string, ModelVisibilityState>();
    for (const entry of user) {
      map.set(modelVisibilityKey(entry), entry.visibility);
    }
    return map;
  }, [user]);

  const isVisible = useCallback(
    (key: ModelVisibilityKey, releaseDate?: string | null, latest?: Set<string>): boolean => {
      const state = visibilityMap.get(modelVisibilityKey(key));
      if (state === 'hide') {
        return false;
      }
      if (state === 'show') {
        return true;
      }
      return isModelVisibleByDefault(key, releaseDate, latest ?? new Set());
    },
    [visibilityMap],
  );

  const setVisibility = useCallback(
    (key: ModelVisibilityKey, show: boolean) => {
      const state: ModelVisibilityState = show ? 'show' : 'hide';
      const index = user.findIndex(
        (entry) => entry.providerID === key.providerID && entry.modelID === key.modelID,
      );
      if (index >= 0) {
        const next = user.slice();
        next[index] = { ...next[index], visibility: state };
        persist(next);
        return;
      }
      persist([...user, { ...key, visibility: state }]);
    },
    [persist, user],
  );

  return { ready, visibilityMap, isVisible, setVisibility };
}
