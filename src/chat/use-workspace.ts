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

/** Project folders the server knows about, for the new-session folder picker. */
export function useProjects(server: ServerConfig, enabled = true) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  return useQuery({
    queryKey: ['projects', ...serverKey(server)],
    queryFn: () => client.listProjects(),
    enabled,
    staleTime: 30 * 1000,
  });
}

/** Slash commands registered on the server, for the composer `/` picker. */
export function useCommands(server: ServerConfig, enabled = true) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  return useQuery({
    queryKey: ['commands', ...serverKey(server)],
    queryFn: () => client.listCommands(),
    enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * Fuzzy file search backing the composer `@` mention picker and the
 * quick-open sheet (the mobile equivalent of ctrl+p). Only queries when the
 * search text is non-empty.
 */
export function useFileSearch(server: ServerConfig, query: string, enabled = true) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  return useQuery({
    queryKey: ['file-search', ...serverKey(server), query],
    queryFn: () => client.findFiles(query, 20),
    enabled: enabled && query.length > 0,
    staleTime: 15 * 1000,
  });
}

/** Sessions spawned from a session (forks, subagent runs). */
export function useSessionChildren(
  server: ServerConfig,
  sessionId: string | null,
  enabled = true,
) {
  const client = useMemo(() => createClientFromServer(server), [server]);
  return useQuery({
    queryKey: ['session-children', ...serverKey(server), sessionId ?? ''],
    queryFn: () => client.listSessionChildren(sessionId as string),
    enabled: enabled && !!sessionId,
    staleTime: 30 * 1000,
  });
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

export type DirectorySuggestion = {
  name: string;
  absolute: string;
};

/**
 * Autocomplete directory suggestions when typing absolute paths in the folder
 * picker. Queries subdirectories of the parent path on the server.
 */
export function useDirectoryAutocomplete(
  server: ServerConfig,
  input: string,
  enabled = true,
) {
  const trimmed = input.trim();
  const isPath = trimmed.startsWith('/');

  let parentDir = '/';
  let prefix = '';
  if (isPath) {
    if (trimmed === '/') {
      parentDir = '/';
      prefix = '';
    } else if (trimmed.endsWith('/')) {
      parentDir = trimmed.replace(/\/+$/, '') || '/';
      prefix = '';
    } else {
      const lastSlash = trimmed.lastIndexOf('/');
      if (lastSlash === 0) {
        parentDir = '/';
        prefix = trimmed.slice(1);
      } else {
        parentDir = trimmed.slice(0, lastSlash);
        prefix = trimmed.slice(lastSlash + 1);
      }
    }
  }

  const queryKey = useMemo(
    () => [
      'directory-autocomplete',
      server.serverUrl,
      server.username,
      server.password,
      parentDir,
    ],
    [server.serverUrl, server.username, server.password, parentDir],
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const client = createClientFromServer({ ...server, directory: parentDir });
      const nodes = await client.listFiles('.');
      return nodes
        .filter((node) => node.type === 'directory')
        .map((node) => ({
          name: node.name,
          absolute:
            node.absolute ||
            (parentDir === '/' ? `/${node.name}` : `${parentDir}/${node.name}`),
        }));
    },
    enabled: enabled && isPath,
    staleTime: 10 * 1000,
    retry: false,
  });

  const suggestions = useMemo<DirectorySuggestion[]>(() => {
    if (!isPath || !query.data) {
      return [];
    }
    const showHidden = prefix.startsWith('.');
    const lowerPrefix = prefix.toLowerCase();
    return query.data
      .filter((dir) => {
        if (!showHidden && dir.name.startsWith('.')) {
          return false;
        }
        return dir.name.toLowerCase().startsWith(lowerPrefix);
      })
      .slice(0, 5);
  }, [isPath, query.data, prefix]);

  return { suggestions, isLoading: query.isLoading && isPath };
}
