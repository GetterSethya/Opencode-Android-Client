import { CheckIcon, SearchIcon, Settings2Icon } from 'lucide-react-native';
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/bottom-sheet';

import { computeLatestModelKeys, useModelVisibility } from '@/chat/model-visibility';
import { useChatSettings } from '@/chat/settings';
import { useOpencodeProviders } from '@/chat/use-opencode-providers';
import { useProviderCatalog } from '@/chat/use-opencode-provider-management';
import { Spinner } from '@/components/ui/spinner';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export type ModelPickerHandle = {
  open: () => void;
  close: () => void;
};

export type ModelPickerProps = {
  visible?: boolean;
  onClose?: () => void;
  onManageProviders: () => void;
};

type ModelPickerItem =
  | { type: 'server-default'; id: string }
  | { type: 'header'; id: string; providerName: string }
  | {
      type: 'model';
      id: string;
      providerID: string;
      modelID: string;
      modelName: string;
      isSelected: boolean;
      variants: string[];
      selectedVariant?: string;
    };

const ModelPickerRow = memo(function ModelPickerRow({
  item,
  onSelectServerDefault,
  onSelectModel,
  onSelectVariant,
  selected,
  successColor,
}: {
  item: ModelPickerItem;
  onSelectServerDefault: () => void;
  onSelectModel: (providerID: string, modelID: string, variant?: string) => void;
  onSelectVariant: (providerID: string, modelID: string, variant: string) => void;
  selected: boolean;
  successColor: string;
}) {
  if (item.type === 'server-default') {
    return (
      <Pressable
        unstable_pressDelay={0}
        className="mb-3 flex-row items-center justify-between rounded-xl border border-border px-3 py-3"
        onPress={onSelectServerDefault}
      >
        <Text className="text-sm text-foreground">Server default</Text>
        {selected ? <CheckIcon size={16} color={successColor} /> : null}
      </Pressable>
    );
  }

  if (item.type === 'header') {
    return (
      <Text className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-muted">
        {item.providerName}
      </Text>
    );
  }

  const { providerID, modelID, modelName, isSelected, variants, selectedVariant } = item;

  return (
    <View key={item.id}>
      <Pressable
        unstable_pressDelay={0}
        className={cn(
          'flex-row items-center justify-between rounded-xl px-3 py-2.5',
          isSelected ? 'bg-surface-secondary' : '',
        )}
        onPress={() => onSelectModel(providerID, modelID, variants[0])}
      >
        <Text
          className={cn(
            'flex-1 text-sm text-foreground',
            isSelected ? 'font-semibold' : '',
          )}
          numberOfLines={1}
        >
          {modelName}
        </Text>
        {isSelected ? <CheckIcon size={16} color={successColor} /> : null}
      </Pressable>

      {isSelected && variants.length > 0 ? (
        <View className="mb-2 ml-3 mt-1 flex-row flex-wrap gap-2">
          {variants.map((variant) => {
            const variantActive = selectedVariant === variant;
            return (
              <Pressable
                key={variant}
                unstable_pressDelay={0}
                className={cn(
                  'rounded-full border px-3 py-1',
                  variantActive
                    ? 'border-foreground bg-foreground'
                    : 'border-border',
                )}
                onPress={() => onSelectVariant(providerID, modelID, variant)}
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
});

export const ModelPicker = memo(
  forwardRef<ModelPickerHandle, ModelPickerProps>(function ModelPicker(
    { visible: controlledVisible, onClose, onManageProviders },
    ref,
  ) {
    const [internalVisible, setInternalVisible] = useState(false);
    const visible = controlledVisible ?? internalVisible;
    const open = useCallback(() => setInternalVisible(true), []);
    const close = useCallback(() => {
      setInternalVisible(false);
      onClose?.();
    }, [onClose]);
    useImperativeHandle(ref, () => ({ open, close }), [open, close]);

    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const colors = useThemeColors();
    const keyboardHeight = useKeyboardHeight();
    const scrollMaxHeight =
      keyboardHeight > 0
        ? Math.max(240, height - keyboardHeight - 320)
        : Math.min(height * 0.7, 520);
    const { activeServer, setActiveModel } = useChatSettings();
    const { models, isLoading, error } = useOpencodeProviders(activeServer, true);
    const visibility = useModelVisibility();
    const catalog = useProviderCatalog(activeServer, true);
    const [query, setQuery] = useState('');

  const { releaseByKey, latest } = useMemo(() => {
    if (!visible || !catalog.data) {
      return { releaseByKey: new Map<string, string | null>(), latest: new Set<string>() };
    }
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
  }, [visible, catalog.data]);

  const selected = activeServer.model;

  const flatItems = useMemo<ModelPickerItem[]>(() => {
    if (!visible) return [];
    const search = query.trim().toLowerCase();
    const filtered = models.filter((model) => {
      if (selected?.providerID === model.providerID && selected?.modelID === model.id) {
        return true;
      }
      const isModelVisible = visibility.isVisible(
        { providerID: model.providerID, modelID: model.id },
        releaseByKey.get(`${model.providerID}:${model.id}`) ?? null,
        latest,
      );
      if (!isModelVisible) {
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

    const items: ModelPickerItem[] = [
      { type: 'server-default', id: '__server_default__' },
    ];

    for (const [providerName, providerModels] of map.entries()) {
      items.push({
        type: 'header',
        id: `header:${providerName}`,
        providerName,
      });
      for (const model of providerModels) {
        const isSelected =
          selected?.providerID === model.providerID && selected?.modelID === model.id;
        items.push({
          type: 'model',
          id: `${model.providerID}:${model.id}`,
          providerID: model.providerID,
          modelID: model.id,
          modelName: model.name,
          isSelected,
          variants: model.variants,
          selectedVariant: isSelected ? selected?.variant : undefined,
        });
      }
    }
    return items;
  }, [visible, models, query, selected, visibility.isVisible, releaseByKey, latest]);

  const handleSelectServerDefault = useCallback(() => {
    setActiveModel(undefined);
    close();
  }, [setActiveModel, close]);

  const handleSelectModel = useCallback(
    (providerID: string, modelID: string, variant?: string) => {
      setActiveModel({ providerID, modelID, variant });
    },
    [setActiveModel],
  );

  const handleSelectVariant = useCallback(
    (providerID: string, modelID: string, variant: string) => {
      setActiveModel({ providerID, modelID, variant });
    },
    [setActiveModel],
  );

  const renderItem = useCallback(
    ({ item }: { item: ModelPickerItem }) => (
      <ModelPickerRow
        item={item}
        onSelectServerDefault={handleSelectServerDefault}
        onSelectModel={handleSelectModel}
        onSelectVariant={handleSelectVariant}
        selected={!selected}
        successColor={colors.success}
      />
    ),
    [handleSelectServerDefault, handleSelectModel, handleSelectVariant, selected, colors.success],
  );

  const keyExtractor = useCallback((item: ModelPickerItem) => item.id, []);

  return (
    <BottomSheet visible={visible} onClose={close} interactionName="menu_to_model">
      <KeyboardAvoidingView behavior="padding">
        <View
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
            <FlatList
              data={flatItems}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              initialNumToRender={14}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: scrollMaxHeight }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}));
