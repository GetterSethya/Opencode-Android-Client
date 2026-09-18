import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import type { ServerConfig } from './settings';

const STORAGE_PREFIX = 'opencode.dismissed-projects.';

function storageKey(server: ServerConfig) {
  return `${STORAGE_PREFIX}${server.serverUrl.replace(/\/+$/, '')}`;
}

async function loadDismissed(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useDismissedProjects(server: ServerConfig) {
  const queryClient = useQueryClient();
  const key = useMemo(() => storageKey(server), [server.serverUrl]);
  const queryKey = useMemo(() => ['dismissed-projects', key], [key]);

  const query = useQuery({
    queryKey,
    queryFn: () => loadDismissed(key),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const dismissedList = query.data ?? [];
  const dismissed = useMemo(() => new Set(dismissedList), [dismissedList]);

  const mutation = useMutation({
    mutationFn: async (nextList: string[]) => {
      await AsyncStorage.setItem(key, JSON.stringify(nextList));
      return nextList;
    },
    onMutate: async (nextList: string[]) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<string[]>(queryKey, nextList);
    },
  });

  const dismissProject = useCallback(
    (projectId: string) => {
      const current = new Set(queryClient.getQueryData<string[]>(queryKey) ?? []);
      current.add(projectId);
      mutation.mutate([...current]);
    },
    [mutation, queryClient, queryKey],
  );

  const undismissProject = useCallback(
    (projectId: string) => {
      const current = new Set(queryClient.getQueryData<string[]>(queryKey) ?? []);
      if (!current.has(projectId)) return;
      current.delete(projectId);
      mutation.mutate([...current]);
    },
    [mutation, queryClient, queryKey],
  );

  return { dismissed, dismissProject, undismissProject };
}
