import {
  ChevronLeftIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import Animated, { LinearTransition } from 'react-native-reanimated';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatSettings, type ServerConfig } from '@/chat/settings';
import {
  POPULAR_PROVIDER_IDS,
  useDisconnectProvider,
  useGlobalConfig,
  useProviderListItems,
  useUpdateGlobalConfig,
  type ProviderListItem,
} from '@/chat/use-opencode-provider-management';
import type { GlobalConfig } from '@/chat/opencode';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';
import { ModelsTab } from './models-tab';
import { ConnectFlow, CustomProviderForm } from './provider-connect';

export type ProvidersSheetProps = {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'providers' | 'models';
};

type SheetView =
  | { name: 'tabs' }
  | { name: 'picker' }
  | { name: 'connect'; providerID: string; providerName?: string }
  | { name: 'custom' };

export function ProviderAvatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-secondary">
      <Text className="text-sm font-semibold text-foreground">{initial}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{children}</Text>
  );
}

type ProviderSource = 'env' | 'api' | 'config' | 'custom';

function providerSource(item: ProviderListItem): ProviderSource | undefined {
  const value = item.source;
  if (value === 'env' || value === 'api' || value === 'config' || value === 'custom') {
    return value;
  }
  return undefined;
}

export function isConfigCustomProvider(
  providerID: string,
  globalConfig: GlobalConfig | undefined,
): boolean {
  const entry = globalConfig?.provider?.[providerID];
  if (!entry) {
    return false;
  }
  if (entry.npm !== '@ai-sdk/openai-compatible') {
    return false;
  }
  if (!entry.models || Object.keys(entry.models).length === 0) {
    return false;
  }
  return true;
}

function sourceTagLabel(
  item: ProviderListItem,
  globalConfig: GlobalConfig | undefined,
): string {
  const source = providerSource(item);
  if (source === 'env') {
    return 'Environment';
  }
  if (source === 'api') {
    return 'API key';
  }
  if (source === 'config') {
    return isConfigCustomProvider(item.id, globalConfig) ? 'Custom' : 'Config';
  }
  if (source === 'custom') {
    return 'Custom';
  }
  return 'Other';
}

function ProvidersMain({
  server,
  onConnect,
  onCustom,
  onViewAll,
}: {
  server: ServerConfig;
  onConnect: (providerID: string, providerName?: string) => void;
  onCustom: () => void;
  onViewAll: () => void;
}) {
  const colors = useThemeColors();
  const { connected, unconnected, isLoading, error, refetch } = useProviderListItems(server, true);
  const globalConfig = useGlobalConfig(server, true);
  const disconnect = useDisconnectProvider();
  const updateConfig = useUpdateGlobalConfig();
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleConnected = useMemo(
    () =>
      connected.filter(
        (item) =>
          item.id !== 'opencode' ||
          Object.values(item.models).some((model) => (model.cost?.input ?? 0) > 0),
      ),
    [connected],
  );

  const popular = useMemo(() => {
    const connectedIDs = new Set(visibleConnected.map((item) => item.id));
    const order = new Map(POPULAR_PROVIDER_IDS.map((id, index) => [id, index]));
    return unconnected
      .filter((item) => order.has(item.id) && !connectedIDs.has(item.id))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  }, [unconnected, visibleConnected]);

  const handleDisconnect = (item: ProviderListItem) => {
    Alert.alert('Disconnect provider', `Disconnect "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setBusyId(item.id);
          try {
            await disconnect.mutateAsync({ server, providerID: item.id });
            if (isConfigCustomProvider(item.id, globalConfig.data)) {
              const before = globalConfig.data?.disabled_providers ?? [];
              const next = before.includes(item.id) ? before : [...before, item.id];
              await updateConfig.mutateAsync({ server, patch: { disabled_providers: next } });
            }
            Alert.alert('Disconnected', `"${item.name}" was disconnected.`);
          } catch (err) {
            Alert.alert(
              'Disconnect failed',
              err instanceof Error ? err.message : 'Request failed',
            );
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <View className="gap-5">
      <View>
        <SectionTitle>Connected</SectionTitle>
        {isLoading ? (
          <View className="items-center py-6">
            <Spinner size={20} />
          </View>
        ) : error ? (
          <View className="gap-2">
            <Text className="text-sm text-danger">{error}</Text>
            <Button variant="outline" size="sm" onPress={() => refetch()}>
              Retry
            </Button>
          </View>
        ) : visibleConnected.length === 0 ? (
          <Text className="py-4 text-sm text-muted">No providers connected yet</Text>
        ) : (
          <View className="gap-2">
            {visibleConnected.map((item) => {
              const canDisconnect = providerSource(item) !== 'env';
              const busy = busyId === item.id;
              return (
                <View
                  key={item.id}
                  className="flex-row items-center gap-3 rounded-xl border border-border px-3 py-3"
                >
                  <ProviderAvatar name={item.name} />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {sourceTagLabel(item, globalConfig.data)} ·{' '}
                      {Object.keys(item.models).length} models
                    </Text>
                  </View>
                  {canDisconnect ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onPress={() => handleDisconnect(item)}
                    >
                      {busy ? 'Working…' : 'Disconnect'}
                    </Button>
                  ) : (
                    <Text className="text-xs text-muted">Set via environment</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View>
        <SectionTitle>Popular</SectionTitle>
        <View className="gap-2">
          {popular.map((item) => (
            <View
              key={item.id}
              className="flex-row items-center gap-3 rounded-xl border border-border px-3 py-3"
            >
              <ProviderAvatar name={item.name} />
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {Object.keys(item.models).length} models
                </Text>
              </View>
              <Button variant="secondary" size="sm" onPress={() => onConnect(item.id, item.name)}>
                <View className="flex-row items-center gap-1">
                  <PlusIcon size={14} color={colors.foreground} />
                  <Text className="text-sm font-medium text-foreground">Connect</Text>
                </View>
              </Button>
            </View>
          ))}
          <Pressable
            className="flex-row items-center gap-3 rounded-xl border border-dashed border-border px-3 py-3"
            onPress={onCustom}
          >
            <ProviderAvatar name="Custom" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">Custom provider</Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                Any OpenAI-compatible API
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      <Button variant="outline" onPress={onViewAll}>
        View all providers
      </Button>
    </View>
  );
}

function ConnectPicker({
  server,
  onSelect,
  onCustom,
}: {
  server: ServerConfig;
  onSelect: (providerID: string, providerName?: string) => void;
  onCustom: () => void;
}) {
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const { items, isLoading, error, refetch } = useProviderListItems(server, true);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) {
      return items;
    }
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(search) || item.id.toLowerCase().includes(search),
    );
  }, [items, query]);

  const groups = useMemo(() => {
    const order = new Map(POPULAR_PROVIDER_IDS.map((id, index) => [id, index]));
    const popular = filtered
      .filter((item) => order.has(item.id))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    const other = filtered
      .filter((item) => !order.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { popular, other };
  }, [filtered]);

  const renderRow = (item: ProviderListItem) => (
    <Pressable
      key={item.id}
      className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
      onPress={() => onSelect(item.id, item.name)}
    >
      <ProviderAvatar name={item.name} />
      <View className="flex-1">
        <Text className="text-sm text-foreground" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-xs text-muted" numberOfLines={1}>
          {item.connected ? 'Connected' : `${Object.keys(item.models).length} models`}
        </Text>
      </View>
      {item.connected ? (
        <Text className="text-xs font-medium text-success">Connected</Text>
      ) : null}
    </Pressable>
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3">
        <SearchIcon size={16} color={colors.muted} />
        <TextInput
          className="flex-1 py-2.5 text-sm text-foreground"
          placeholder="Search all providers"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <View className="items-center py-8">
          <Spinner size={20} />
        </View>
      ) : error ? (
        <View className="gap-2">
          <Text className="text-sm text-danger">{error}</Text>
          <Button variant="outline" size="sm" onPress={() => refetch()}>
            Retry
          </Button>
        </View>
      ) : (
        <View className="gap-4">
          <Pressable
            className="flex-row items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5"
            onPress={onCustom}
          >
            <ProviderAvatar name="Custom" />
            <Text className="flex-1 text-sm text-foreground">Custom provider</Text>
          </Pressable>
          {groups.popular.length > 0 ? (
            <View>
              <SectionTitle>Popular</SectionTitle>
              {groups.popular.map(renderRow)}
            </View>
          ) : null}
          {groups.other.length > 0 ? (
            <View>
              <SectionTitle>Other</SectionTitle>
              {groups.other.map(renderRow)}
            </View>
          ) : null}
          {filtered.length === 0 ? (
            <Text className="py-6 text-center text-sm text-muted">No providers found</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * Bottom sheet for managing providers and model visibility. Height changes
 * (tab switches, collapsing groups) are animated via a layout animation.
 */
export function ProvidersSheet({ visible, onClose, initialTab = 'providers' }: ProvidersSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const { activeServer } = useChatSettings();
  const [tab, setTab] = useState<'providers' | 'models'>(initialTab);
  const [view, setView] = useState<SheetView>({ name: 'tabs' });
  const keyboardHeight = useKeyboardHeight();

  // The sheet stays mounted while hidden, so a provider added on the server
  // since the last fetch would otherwise never appear. Refresh on open.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!visible) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['providers-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['provider-auth-methods'] });
    void queryClient.invalidateQueries({ queryKey: ['global-config'] });
    void queryClient.invalidateQueries({ queryKey: ['opencode-providers'] });
  }, [visible, queryClient]);
  const scrollMaxHeight =
    keyboardHeight > 0
      ? Math.max(240, height - keyboardHeight - 320)
      : Math.min(height * 0.7, 560);

  const goBack = () => setView({ name: 'tabs' });

  const title =
    view.name === 'connect'
      ? 'Connect provider'
      : view.name === 'custom'
        ? 'Custom provider'
        : view.name === 'picker'
          ? 'All providers'
          : 'Models & providers';

  const showTabs = view.name === 'tabs';

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (!showTabs) {
          goBack();
          return;
        }
        onClose();
      }}
    >
      <View className="flex-1 justify-end">
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <KeyboardAvoidingView behavior="padding">
          <Animated.View
            layout={LinearTransition.duration(240)}
            className="rounded-t-3xl bg-surface pt-4"
            style={{
              paddingBottom: insets.bottom + 16,
              paddingLeft: insets.left + 16,
              paddingRight: insets.right + 16,
            }}
          >
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1">
                {!showTabs ? (
                  <Pressable hitSlop={8} onPress={goBack} className="pr-1">
                    <ChevronLeftIcon size={20} color={colors.muted} />
                  </Pressable>
                ) : null}
                <Text className="text-lg font-semibold text-foreground">{title}</Text>
              </View>
              <Pressable hitSlop={8} onPress={onClose}>
                <Text className="text-sm text-muted">Done</Text>
              </Pressable>
            </View>

            {showTabs ? (
              <View className="mb-3 flex-row rounded-xl bg-surface-secondary p-1">
                {(['providers', 'models'] as const).map((option) => {
                  const active = tab === option;
                  return (
                    <Pressable
                      key={option}
                      className={cn(
                        'flex-1 items-center rounded-lg py-2',
                        active ? 'bg-surface' : 'bg-transparent',
                      )}
                      onPress={() => setTab(option)}
                    >
                      <Text
                        className={cn(
                          'text-sm font-medium',
                          active ? 'text-foreground' : 'text-muted',
                        )}
                      >
                        {option === 'providers' ? 'Providers' : 'Models'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: scrollMaxHeight }}
            >
              {view.name === 'tabs' && tab === 'providers' ? (
                <ProvidersMain
                  server={activeServer}
                  onConnect={(providerID, providerName) =>
                    setView({ name: 'connect', providerID, providerName })
                  }
                  onCustom={() => setView({ name: 'custom' })}
                  onViewAll={() => setView({ name: 'picker' })}
                />
              ) : null}
              {view.name === 'tabs' && tab === 'models' ? (
                <ModelsTab server={activeServer} />
              ) : null}
              {view.name === 'picker' ? (
                <ConnectPicker
                  server={activeServer}
                  onSelect={(providerID, providerName) =>
                    setView({ name: 'connect', providerID, providerName })
                  }
                  onCustom={() => setView({ name: 'custom' })}
                />
              ) : null}
              {view.name === 'connect' ? (
                <ConnectFlow
                  server={activeServer}
                  providerID={view.providerID}
                  providerName={view.providerName}
                  onDone={onClose}
                />
              ) : null}
              {view.name === 'custom' ? (
                <CustomProviderForm server={activeServer} onDone={onClose} />
              ) : null}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
