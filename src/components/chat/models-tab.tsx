import { ChevronDownIcon, ChevronRightIcon, SearchIcon, XIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import {
  computeLatestModelKeys,
  useModelVisibility,
  type ModelVisibilityMeta,
} from '@/chat/model-visibility';
import type { ServerConfig } from '@/chat/settings';
import { POPULAR_PROVIDER_IDS, useProviderCatalog } from '@/chat/use-opencode-provider-management';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ProviderAvatar } from './providers-sheet';

type GroupedModels = {
  providerID: string;
  providerName: string;
  models: { id: string; name: string }[];
};

export function ModelsTab({ server }: { server: ServerConfig }) {
  const colors = useThemeColors();
  const catalog = useProviderCatalog(server, true);
  const visibility = useModelVisibility();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo<GroupedModels[]>(() => {
    const connected = new Set(catalog.data?.connected ?? []);
    const all = (catalog.data?.all ?? []).filter((provider) => connected.has(provider.id));
    const search = query.trim().toLowerCase();
    const result: GroupedModels[] = [];
    for (const provider of all) {
      const models = Object.entries(provider.models)
        .map(([id, model]) => ({ id, name: model.name || id }))
        .filter(
          (model) =>
            !search ||
            model.name.toLowerCase().includes(search) ||
            model.id.toLowerCase().includes(search) ||
            provider.name.toLowerCase().includes(search),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      if (models.length > 0) {
        result.push({ providerID: provider.id, providerName: provider.name, models });
      }
    }
    const popularIndex = new Map(POPULAR_PROVIDER_IDS.map((id, index) => [id, index]));
    result.sort((a, b) => {
      const aIndex = popularIndex.get(a.providerID) ?? -1;
      const bIndex = popularIndex.get(b.providerID) ?? -1;
      if (aIndex >= 0 && bIndex < 0) {
        return -1;
      }
      if (bIndex >= 0 && aIndex < 0) {
        return 1;
      }
      if (aIndex >= 0 && bIndex >= 0) {
        return aIndex - bIndex;
      }
      return a.providerName.localeCompare(b.providerName);
    });
    return result;
  }, [catalog.data, query]);

  const metas = useMemo<ModelVisibilityMeta[]>(() => {
    const connected = new Set(catalog.data?.connected ?? []);
    const out: ModelVisibilityMeta[] = [];
    for (const provider of catalog.data?.all ?? []) {
      if (!connected.has(provider.id)) {
        continue;
      }
      for (const [id, model] of Object.entries(provider.models)) {
        out.push({
          providerID: provider.id,
          modelID: id,
          family: model.family ?? null,
          release_date: model.release_date ?? null,
        });
      }
    }
    return out;
  }, [catalog.data]);

  const latest = useMemo(() => computeLatestModelKeys(metas), [metas]);
  const releaseByKey = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const meta of metas) {
      map.set(`${meta.providerID}:${meta.modelID}`, meta.release_date ?? null);
    }
    return map;
  }, [metas]);

  const searching = query.trim().length > 0;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3">
        <SearchIcon size={16} color={colors.muted} />
        <TextInput
          className="flex-1 py-2.5 text-sm text-foreground"
          placeholder="Search models"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {searching ? (
          <Pressable hitSlop={8} onPress={() => setQuery('')}>
            <XIcon size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {catalog.isLoading ? (
        <View className="items-center py-8">
          <Spinner size={20} />
        </View>
      ) : catalog.error ? (
        <View className="gap-2">
          <Text className="text-sm text-danger">
            {catalog.error instanceof Error ? catalog.error.message : 'Request failed'}
          </Text>
          <Button variant="outline" size="sm" onPress={() => catalog.refetch()}>
            Retry
          </Button>
        </View>
      ) : groups.length === 0 ? (
        <Text className="py-6 text-center text-sm text-muted">
          {searching ? `No models match "${query.trim()}"` : 'No models available'}
        </Text>
      ) : (
        <View className="gap-4">
          {groups.map((group) => {
            const expanded = searching || !collapsed[group.providerID];
            return (
              <View key={group.providerID}>
                <Pressable
                  className="flex-row items-center gap-2 py-1"
                  disabled={searching}
                  onPress={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [group.providerID]: !prev[group.providerID],
                    }))
                  }
                >
                  {expanded ? (
                    <ChevronDownIcon size={14} color={colors.muted} />
                  ) : (
                    <ChevronRightIcon size={14} color={colors.muted} />
                  )}
                  <ProviderAvatar name={group.providerName} />
                  <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
                    {group.providerName}
                  </Text>
                  <Text className="text-xs text-muted">{group.models.length}</Text>
                </Pressable>
                {expanded
                  ? group.models.map((model) => {
                      const key = { providerID: group.providerID, modelID: model.id };
                      const checked = visibility.isVisible(
                        key,
                        releaseByKey.get(`${group.providerID}:${model.id}`) ?? null,
                        latest,
                      );
                      return (
                        <View
                          key={model.id}
                          className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
                        >
                          <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                            {model.name}
                          </Text>
                          <Switch
                            value={checked}
                            onValueChange={(value) => visibility.setVisibility(key, value)}
                            trackColor={{ false: colors.border, true: colors.success }}
                            thumbColor={colors.surface}
                          />
                        </View>
                      );
                    })
                  : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
