import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  type CatalogProvider,
  type GlobalConfig,
  type OpencodeClient,
  type ProviderOAuthAuthorization,
} from './opencode';
import { createClientFromServer } from './use-opencode-providers';
import type { ServerConfig } from './settings';

export const POPULAR_PROVIDER_IDS = [
  'opencode',
  'opencode-go',
  'anthropic',
  'github-copilot',
  'openai',
  'google',
  'openrouter',
  'vercel',
];

function serverKey(server: ServerConfig): string[] {
  return [server.serverUrl, server.username, server.password, server.directory ?? ''];
}

function useServerClient(server: ServerConfig): OpencodeClient {
  return useMemo(() => createClientFromServer(server), [server]);
}

export function useProviderCatalog(server: ServerConfig, enabled = true) {
  const client = useServerClient(server);
  const key = serverKey(server);
  return useQuery({
    queryKey: ['providers-catalog', ...key],
    queryFn: () => client.listProviderCatalog(),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useProviderAuthMethods(server: ServerConfig, enabled = true) {
  const client = useServerClient(server);
  const key = serverKey(server);
  return useQuery({
    queryKey: ['provider-auth-methods', ...key],
    queryFn: () => client.listProviderAuthMethods(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useGlobalConfig(server: ServerConfig, enabled = true) {
  const client = useServerClient(server);
  const key = serverKey(server);
  return useQuery({
    queryKey: ['global-config', ...key],
    queryFn: () => client.getGlobalConfig(),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useInvalidateProviderData() {
  const queryClient = useQueryClient();
  return useCallback(
    (server: ServerConfig) => {
      const key = serverKey(server);
      void queryClient.invalidateQueries({ queryKey: ['opencode-providers', ...key] });
      void queryClient.invalidateQueries({ queryKey: ['providers-catalog', ...key] });
      void queryClient.invalidateQueries({ queryKey: ['provider-auth-methods', ...key] });
      void queryClient.invalidateQueries({ queryKey: ['global-config', ...key] });
    },
    [queryClient],
  );
}

export type SetAuthArgs = {
  server: ServerConfig;
  providerID: string;
  key: string;
};

export function useSetProviderAuth() {
  const invalidate = useInvalidateProviderData();
  return useMutation({
    mutationFn: async ({ server, providerID, key }: SetAuthArgs) => {
      const client = createClientFromServer(server);
      await client.setProviderAuth(providerID, key);
      return server;
    },
    onSuccess: (server) => invalidate(server),
  });
}

export type DisconnectArgs = {
  server: ServerConfig;
  providerID: string;
};

export function useDisconnectProvider() {
  const invalidate = useInvalidateProviderData();
  return useMutation({
    mutationFn: async ({ server, providerID }: DisconnectArgs) => {
      const client = createClientFromServer(server);
      await client.removeProviderAuth(providerID);
      return server;
    },
    onSuccess: (server) => invalidate(server),
  });
}

export type OAuthAuthorizeArgs = {
  server: ServerConfig;
  providerID: string;
  methodIndex: number;
  inputs?: Record<string, string>;
};

export function useAuthorizeProviderOAuth() {
  return useMutation({
    mutationFn: async ({ server, providerID, methodIndex, inputs }: OAuthAuthorizeArgs) => {
      const client = createClientFromServer(server);
      const authorization: ProviderOAuthAuthorization = await client.authorizeProviderOAuth(
        providerID,
        methodIndex,
        inputs,
      );
      return { server, authorization };
    },
  });
}

export type OAuthCallbackArgs = {
  server: ServerConfig;
  providerID: string;
  methodIndex: number;
  code?: string;
};

export function useCallbackProviderOAuth() {
  const invalidate = useInvalidateProviderData();
  return useMutation({
    mutationFn: async ({ server, providerID, methodIndex, code }: OAuthCallbackArgs) => {
      const client = createClientFromServer(server);
      await client.callbackProviderOAuth(providerID, methodIndex, code);
      return server;
    },
    onSuccess: (server) => invalidate(server),
  });
}

export async function pollProviderConnected(
  client: OpencodeClient,
  providerID: string,
  shouldContinue: () => boolean,
  maxWaitMs = 180000,
): Promise<'connected'> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    if (!shouldContinue() || Date.now() > deadline) {
      throw new Error('cancelled');
    }
    const catalog = await client.listProviderCatalog();
    if (catalog.connected.includes(providerID)) {
      return 'connected';
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

export type CustomProviderArgs = {
  server: ServerConfig;
  providerID: string;
  apiKey?: string;
  config: NonNullable<GlobalConfig['provider']>[string];
};

export function useSaveCustomProvider() {
  const invalidate = useInvalidateProviderData();
  return useMutation({
    mutationFn: async ({ server, providerID, apiKey, config }: CustomProviderArgs) => {
      const client = createClientFromServer(server);
      if (apiKey) {
        await client.setProviderAuth(providerID, apiKey);
      }
      const current = await client.getGlobalConfig().catch(() => ({} as GlobalConfig));
      const disabled = (current.disabled_providers ?? []).filter((id) => id !== providerID);
      const existingProviders = current.provider ?? {};
      await client.updateGlobalConfig({
        provider: { ...existingProviders, [providerID]: config },
        disabled_providers: disabled,
      });
      return server;
    },
    onSuccess: (server) => invalidate(server),
  });
}

export type UpdateConfigArgs = {
  server: ServerConfig;
  patch: Partial<GlobalConfig>;
};

export function useUpdateGlobalConfig() {
  const invalidate = useInvalidateProviderData();
  return useMutation({
    mutationFn: async ({ server, patch }: UpdateConfigArgs) => {
      const client = createClientFromServer(server);
      await client.updateGlobalConfig(patch);
      return server;
    },
    onSuccess: (server) => invalidate(server),
  });
}

export type ProviderListItem = CatalogProvider & { connected: boolean };

export function useProviderListItems(
  server: ServerConfig,
  enabled = true,
): { items: ProviderListItem[]; connected: ProviderListItem[]; unconnected: ProviderListItem[]; isLoading: boolean; error: string | null; refetch: () => void } {
  const catalog = useProviderCatalog(server, enabled);
  const items = useMemo<ProviderListItem[]>(() => {
    const connected = new Set(catalog.data?.connected ?? []);
    return (catalog.data?.all ?? []).map((provider) => ({
      ...provider,
      connected: connected.has(provider.id),
    }));
  }, [catalog.data]);
  const connected = useMemo(() => items.filter((item) => item.connected), [items]);
  const unconnected = useMemo(() => items.filter((item) => !item.connected), [items]);
  return {
    items,
    connected,
    unconnected,
    isLoading: catalog.isLoading,
    error: catalog.error instanceof Error ? catalog.error.message : null,
    refetch: () => {
      void catalog.refetch();
    },
  };
}
