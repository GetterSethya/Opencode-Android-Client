import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  OpencodeClient,
  type OpencodeModel,
  type OpencodeProvider,
} from './opencode';
import type { ServerConfig } from './settings';

export type FlatModel = {
  providerID: string;
  providerName: string;
  id: string;
  name: string;
  variants: string[];
};

export function createClientFromServer(server: ServerConfig) {
  return new OpencodeClient({
    baseUrl: server.serverUrl,
    username: server.username,
    password: server.password,
    directory: server.directory || undefined,
  });
}

export function useOpencodeProviders(server: ServerConfig, enabled = true) {
  const client = useMemo(() => createClientFromServer(server), [server]);

  const query = useQuery({
    queryKey: [
      'opencode-providers',
      server.serverUrl,
      server.username,
      server.password,
      server.directory,
    ],
    queryFn: () => client.listProviders(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const models: FlatModel[] = useMemo(() => {
    const providers: OpencodeProvider[] = query.data?.providers ?? [];
    return providers.flatMap((provider) =>
      Object.values(provider.models).map((model: OpencodeModel) => ({
        providerID: provider.id,
        providerName: provider.name,
        id: model.id,
        name: model.name || model.id,
        variants: Object.keys(model.variants ?? {}),
      })),
    );
  }, [query.data]);

  return {
    models,
    defaults: query.data?.default ?? {},
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
