import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { ServerConfig } from './settings';
import { createClientFromServer } from './use-opencode-providers';

function serverKey(server: ServerConfig): string[] {
  return [server.serverUrl, server.username, server.password, server.directory ?? ''];
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
    queryFn: () => client.readFile(path as string),
    enabled: enabled && !!path,
    staleTime: 15 * 1000,
  });
}
