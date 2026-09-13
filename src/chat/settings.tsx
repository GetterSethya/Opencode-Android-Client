import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { Uniwind } from 'uniwind';

import { ThemeSchemeContext } from '@/hooks/use-theme-colors';

export type ThemePreference = 'light' | 'dark' | 'system';

export type ModelSelection = {
  providerID: string;
  modelID: string;
  variant?: string;
};

export type ServerConfig = {
  id: string;
  name: string;
  serverUrl: string;
  username: string;
  password: string;
  directory: string;
  model?: ModelSelection;
};

export type ChatSettings = {
  servers: ServerConfig[];
  activeServerId: string;
  theme: ThemePreference;
};

const STORAGE_KEY = 'opencode.settings.v2';
const LEGACY_KEY = 'opencode.settings.v1';

function createId() {
  return `srv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const defaultServer: ServerConfig = {
  id: createId(),
  name: 'Local',
  serverUrl: process.env.EXPO_PUBLIC_OPENCODE_URL ?? 'http://192.168.18.96:4097',
  username: 'opencode',
  password: '',
  directory: process.env.EXPO_PUBLIC_OPENCODE_DIRECTORY ?? '',
};

export const DEFAULT_SETTINGS: ChatSettings = {
  servers: [defaultServer],
  activeServerId: defaultServer.id,
  theme: 'system',
};

type ChatSettingsContextValue = {
  ready: boolean;
  servers: ServerConfig[];
  activeServerId: string;
  activeServer: ServerConfig;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  addServer: (server: Omit<ServerConfig, 'id'>) => ServerConfig;
  updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => void;
  removeServer: (id: string) => void;
  setActiveServer: (id: string) => void;
  setActiveModel: (model: ModelSelection | undefined) => void;
};

const ChatSettingsContext = createContext<ChatSettingsContextValue | null>(null);

function migrate(raw: string | null): ChatSettings | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ChatSettings> & {
      serverUrl?: string;
      username?: string;
      password?: string;
      directory?: string;
    };

    if (Array.isArray(parsed.servers) && parsed.servers.length > 0) {
      const servers = parsed.servers.map((server) => ({
        id: server.id ?? createId(),
        name: server.name ?? 'Server',
        serverUrl: server.serverUrl,
        username: server.username ?? 'opencode',
        password: server.password ?? '',
        directory: server.directory ?? '',
        model: server.model,
      }));
      const activeServerId =
        servers.find((server) => server.id === parsed.activeServerId)?.id ?? servers[0].id;
      return {
        servers,
        activeServerId,
        theme: parsed.theme ?? 'system',
      };
    }

    // Legacy v1 single-server shape
    if (parsed.serverUrl) {
      const server: ServerConfig = {
        id: createId(),
        name: 'Local',
        serverUrl: parsed.serverUrl,
        username: parsed.username ?? 'opencode',
        password: parsed.password ?? '',
        directory: parsed.directory ?? '',
      };
      return { servers: [server], activeServerId: server.id, theme: 'system' };
    }
  } catch {
    // ignore malformed settings
  }
  return null;
}

export function ChatSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const systemDark = useColorScheme() === 'dark';
  const isDark = settings.theme === 'system' ? systemDark : settings.theme === 'dark';

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.multiGet([STORAGE_KEY, LEGACY_KEY])
      .then((entries) => {
        if (cancelled) {
          return;
        }
        const map = Object.fromEntries(entries);
        const migrated = migrate(map[STORAGE_KEY] ?? map[LEGACY_KEY] ?? null);
        if (migrated) {
          setSettings(migrated);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: ChatSettings) => {
    setSettings(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setTheme = useCallback(
    (theme: ThemePreference) => {
      persist({ ...settings, theme });
    },
    [persist, settings],
  );

  const addServer = useCallback(
    (server: Omit<ServerConfig, 'id'>) => {
      const created: ServerConfig = { ...server, id: createId() };
      persist({
        ...settings,
        servers: [...settings.servers, created],
        activeServerId: created.id,
      });
      return created;
    },
    [persist, settings],
  );

  const updateServer = useCallback(
    (id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => {
      persist({
        ...settings,
        servers: settings.servers.map((server) =>
          server.id === id ? { ...server, ...patch } : server,
        ),
      });
    },
    [persist, settings],
  );

  const removeServer = useCallback(
    (id: string) => {
      const servers = settings.servers.filter((server) => server.id !== id);
      if (servers.length === 0) {
        const fallback: ServerConfig = { ...defaultServer, id: createId() };
        persist({ ...settings, servers: [fallback], activeServerId: fallback.id });
        return;
      }
      const activeServerId =
        settings.activeServerId === id ? servers[0].id : settings.activeServerId;
      persist({ ...settings, servers, activeServerId });
    },
    [persist, settings],
  );

  const setActiveServer = useCallback(
    (id: string) => {
      persist({ ...settings, activeServerId: id });
    },
    [persist, settings],
  );

  const setActiveModel = useCallback(
    (model: ModelSelection | undefined) => {
      persist({
        ...settings,
        servers: settings.servers.map((server) =>
          server.id === settings.activeServerId ? { ...server, model } : server,
        ),
      });
    },
    [persist, settings],
  );

  useEffect(() => {
    if (ready) {
      Uniwind.setTheme(settings.theme);
      Appearance.setColorScheme(settings.theme === 'system' ? 'unspecified' : settings.theme);
    }
  }, [ready, settings.theme]);

  const activeServer = useMemo(
    () =>
      settings.servers.find((server) => server.id === settings.activeServerId) ??
      settings.servers[0],
    [settings.servers, settings.activeServerId],
  );

  const value = useMemo<ChatSettingsContextValue>(
    () => ({
      ready,
      servers: settings.servers,
      activeServerId: settings.activeServerId,
      activeServer,
      theme: settings.theme,
      setTheme,
      addServer,
      updateServer,
      removeServer,
      setActiveServer,
      setActiveModel,
    }),
    [
      ready,
      settings.servers,
      settings.activeServerId,
      activeServer,
      settings.theme,
      setTheme,
      addServer,
      updateServer,
      removeServer,
      setActiveServer,
      setActiveModel,
    ],
  );

  return (
    <ChatSettingsContext.Provider value={value}>
      <ThemeSchemeContext.Provider value={isDark}>{children}</ThemeSchemeContext.Provider>
    </ChatSettingsContext.Provider>
  );
}

export function useChatSettings() {
  const context = useContext(ChatSettingsContext);
  if (!context) {
    throw new Error('useChatSettings must be used within <ChatSettingsProvider>');
  }
  return context;
}
