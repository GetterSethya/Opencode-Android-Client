import { CheckIcon, SearchIcon, Settings2Icon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { computeLatestModelKeys, useModelVisibility } from '@/chat/model-visibility';
import { useChatSettings } from '@/chat/settings';
import { useOpencodeProviders } from '@/chat/use-opencode-providers';
import { useProviderCatalog } from '@/chat/use-opencode-provider-management';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export type ModelPickerProps = {
  visible: boolean;
  onClose: () => void;
  onManageProviders: () => void;
};

export function ModelPicker({ visible, onClose, onManageProviders }: ModelPickerProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const colors = useThemeColors();
  const keyboardHeight = useKeyboardHeight();
  const scrollMaxHeight =
    keyboardHeight > 0
      ? Math.max(240, height - keyboardHeight - 320)
      : Math.min(height * 0.7, 520);
  const { activeServer, setActiveModel } = useChatSettings();
  const { models, isLoading, error } = useOpencodeProviders(activeServer, visible);
  const visibility = useModelVisibility();
  const catalog = useProviderCatalog(activeServer, visible);
  const [query, setQuery] = useState('');

  const { releaseByKey, latest } = useMemo(() => {
    const connected = new Set(catalog.data?.connected ?? []);
    const release = new Map<string, string | null>();
    const metas: { providerID: string; modelID: string; family?: string | null; release_date?: string | null }[] = [];
    for (const provider of catalog.data?.all ?? []) {
      if (!connected.has(provider.id)) {
        continue;
      }
      for (const [id, model] of Object.entries(provider.models)) {
        release.set(`${provider.id}:${id}`, model.release_date ?? null);
        metas.push({
          providerID: provider.id,
          modelID: id,
          family: model.family ?? null,
          release_date: model.release_date ?? null,
        });
      }
    }
    return { releaseByKey: release, latest: computeLatestModelKeys(metas) };
  }, [catalog.data]);

  const selected = activeServer.model;

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = models.filter((model) => {
      if (selected?.providerID === model.providerID && selected?.modelID === model.id) {
        return true;
      }
      const visible = visibility.isVisible(
        { providerID: model.providerID, modelID: model.id },
        releaseByKey.get(`${model.providerID}:${model.id}`) ?? null,
        latest,
      );
      if (!visible) {
        return false;
      }
      return (
        !search ||
        model.name.toLowerCase().includes(search) ||
        model.id.toLowerCase().includes(search) ||
        model.providerName.toLowerCase().includes(search)
      );
    });
    const map = new Map<string, typeof filtered>();
    for (const model of filtered) {
      const list = map.get(model.providerName) ?? [];
      list.push(model);
      map.set(model.providerName, list);
    }
    return Array.from(map.entries());
  }, [models, query, selected, visibility.isVisible, releaseByKey, latest]);

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <KeyboardAvoidingView behavior="padding">
        <View
          className="rounded-t-3xl bg-surface pt-4"
          style={{
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-foreground">Select model</Text>
            <View className="flex-row items-center gap-4">
              <Pressable
                hitSlop={8}
                onPress={onManageProviders}
                className="flex-row items-center gap-1"
              >
                <Settings2Icon size={14} color={colors.muted} />
                <Text className="text-sm text-muted">Manage</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={onClose}>
                <Text className="text-sm text-muted">Done</Text>
              </Pressable>
            </View>
          </View>

          <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-surface-secondary px-3">
            <SearchIcon size={16} color={colors.muted} />
            <TextInput
              className="flex-1 py-2.5 text-sm text-foreground"
              placeholder="Search models"
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
            <Text className="py-6 text-sm text-danger">{error}</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: scrollMaxHeight }}>
              <Pressable
                className="mb-3 flex-row items-center justify-between rounded-xl border border-border px-3 py-3"
                onPress={() => {
                  setActiveModel(undefined);
                  onClose();
                }}
              >
                <Text className="text-sm text-foreground">Server default</Text>
                {!selected ? <CheckIcon size={16} color={colors.success} /> : null}
              </Pressable>

              {groups.map(([providerName, providerModels]) => (
                <View key={providerName} className="mb-3">
                  <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                    {providerName}
                  </Text>
                  {providerModels.map((model) => {
                    const isSelected =
                      selected?.providerID === model.providerID && selected?.modelID === model.id;
                    return (
                      <View key={`${model.providerID}:${model.id}`}>
                        <Pressable
                          className={cn(
                            'flex-row items-center justify-between rounded-xl px-3 py-2.5',
                            isSelected ? 'bg-surface-secondary' : '',
                          )}
                          onPress={() => {
                            setActiveModel({
                              providerID: model.providerID,
                              modelID: model.id,
                              variant: model.variants[0],
                            });
                          }}
                        >
                          <Text
                            className={cn(
                              'flex-1 text-sm text-foreground',
                              isSelected ? 'font-semibold' : '',
                            )}
                            numberOfLines={1}
                          >
                            {model.name}
                          </Text>
                          {isSelected ? <CheckIcon size={16} color={colors.success} /> : null}
                        </Pressable>

                        {isSelected && model.variants.length > 0 ? (
                          <View className="mb-2 ml-3 mt-1 flex-row flex-wrap gap-2">
                            {model.variants.map((variant) => {
                              const variantActive = selected?.variant === variant;
                              return (
                                <Pressable
                                  key={variant}
                                  className={cn(
                                    'rounded-full border px-3 py-1',
                                    variantActive
                                      ? 'border-foreground bg-foreground'
                                      : 'border-border',
                                  )}
                                  onPress={() =>
                                    setActiveModel({
                                      providerID: model.providerID,
                                      modelID: model.id,
                                      variant,
                                    })
                                  }
                                >
                                  <Text
                                    className={cn(
                                      'text-xs',
                                      variantActive ? 'text-background' : 'text-foreground',
                                    )}
                                  >
                                    {variant}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
