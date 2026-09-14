import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { ServerConfig } from './settings';
import { createClientFromServer } from './use-opencode-providers';

function serverKey(server: ServerConfig): string[] {
  return [server.serverUrl, server.username, server.password, server.directory ?? ''];
}

/**
 * Download progress (0-1) per file-content request, reported out-of-band from
 * the react-query fetch so both the sheet preview and the full-screen viewer
 * can render the same progress bar. Entries are removed when a request
 * settles; updates smaller than 1% are coalesced to avoid re-render churn.
 */
const fileProgressValues = new Map<string, number>();
const fileProgressListeners = new Map<string, Set<() => void>>();

function fileProgressKey(server: ServerConfig, path: string) {
  return ['file-content-progress', ...serverKey(server), path].join('|');
}

function reportFileProgress(server: ServerConfig, path: string, fraction: number) {
  const key = fileProgressKey(server, path);
  const previous = fileProgressValues.get(key);
  if (previous !== undefined && fraction < 1 && fraction - previous < 0.01) {
    return;
  }
  fileProgressValues.set(key, fraction);
  fileProgressListeners.get(key)?.forEach((notify) => notify());
}

function clearFileProgress(server: ServerConfig, path: string) {
  const key = fileProgressKey(server, path);
  if (fileProgressValues.delete(key)) {
    fileProgressListeners.get(key)?.forEach((notify) => notify());
  }
}

/** Fraction downloaded for the in-flight file-content request, if any. */
export function useFileContentProgress(
  server: ServerConfig,
  path: string | undefined,
): number | null {
  const key = fileProgressKey(server, path ?? '');
  const [progress, setProgress] = useState<number | null>(
    () => fileProgressValues.get(key) ?? null,
  );

  useEffect(() => {
    setProgress(fileProgressValues.get(key) ?? null);
    let listeners = fileProgressListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      fileProgressListeners.set(key, listeners);
    }
    const notify = () => {
      setProgress(fileProgressValues.get(key) ?? null);
    };
    listeners.add(notify);
    return () => {
      listeners?.delete(notify);
    };
  }, [key]);

  return progress;
}

/** Working-tree changes for the Review panel. */
export function useVcsDiff(server: ServerConfig, enabled = true) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  return useQuery({
    queryKey: ['vcs-diff', ...serverKey(server)],
    queryFn: () => client.vcsDiff('git', 3),
    enabled,
    staleTime: 15 * 1000,
  });
}

/** Directory listing for the Open file panel. */
export function useFileList(server: ServerConfig, path: string, enabled = true) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  return useQuery({
    queryKey: ['file-list', ...serverKey(server), path],
    queryFn: () => client.listFiles(path),
    enabled,
    staleTime: 30 * 1000,
  });
}

/** File contents for the Open file panel. */
export function useFileContent(server: ServerConfig, path: string | undefined, enabled = true) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  return useQuery({
    queryKey: ['file-content', ...serverKey(server), path ?? ''],
    queryFn: async () => {
      const filePath = path as string;
      try {
        const data = await client.readFile(filePath, (fraction) =>
          reportFileProgress(server, filePath, fraction),
        );
        clearFileProgress(server, filePath);
        return data;
      } catch (cause) {
        clearFileProgress(server, filePath);
        throw cause;
      }
    },
    enabled: enabled && !!path,
    staleTime: 15 * 1000,
  });
}
