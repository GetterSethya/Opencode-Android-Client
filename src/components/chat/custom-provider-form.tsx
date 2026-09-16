import { PlusIcon, Trash2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { ServerConfig } from '@/chat/settings';
import {
  useGlobalConfig,
  useProviderCatalog,
  useSaveCustomProvider,
} from '@/chat/use-opencode-provider-management';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/ui/dialog';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

import { Field, inputClass } from './provider-connect';

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const OPENAI_COMPATIBLE_NPM = '@ai-sdk/openai-compatible';

export function CustomProviderForm({
  server,
  onDone,
}: {
  server: ServerConfig;
  onDone: () => void;
}) {
  const colors = useThemeColors();
  const { notify } = useDialog();
  const catalog = useProviderCatalog(server, true);
  const globalConfig = useGlobalConfig(server, true);
  const save = useSaveCustomProvider();

  const [providerID, setProviderID] = useState('');
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState([{ id: '', name: '' }]);
  const [headers, setHeaders] = useState([{ key: '', value: '' }]);
  const [errors, setErrors] = useState<{ providerID?: string; name?: string; baseURL?: string; models?: string; headers?: string }>({});
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmedID = providerID.trim();
    const trimmedName = name.trim();
    const trimmedURL = baseURL.trim();
    const trimmedKey = apiKey.trim();

    const nextErrors: typeof errors = {};
    if (!trimmedID) {
      nextErrors.providerID = 'Provider ID is required';
    } else if (!PROVIDER_ID_PATTERN.test(trimmedID)) {
      nextErrors.providerID = 'Use lowercase letters, numbers, - or _';
    } else {
      const existing = new Set((catalog.data?.all ?? []).map((p) => p.id));
      const disabled = globalConfig.data?.disabled_providers ?? [];
      if (existing.has(trimmedID) && !disabled.includes(trimmedID)) {
        nextErrors.providerID = 'A provider with this ID already exists';
      }
    }
    if (!trimmedName) {
      nextErrors.name = 'Name is required';
    }
    if (!trimmedURL) {
      nextErrors.baseURL = 'Base URL is required';
    } else if (!/^https?:\/\//.test(trimmedURL)) {
      nextErrors.baseURL = 'Base URL must start with http:// or https://';
    }

    const seenModels = new Set<string>();
    let modelsError: string | undefined;
    const modelConfig: Record<string, { name: string }> = {};
    for (const row of models) {
      const id = row.id.trim();
      const rowName = row.name.trim();
      if (!id || !rowName) {
        modelsError = 'Each model needs an ID and a name';
        break;
      }
      if (seenModels.has(id)) {
        modelsError = 'Duplicate model ID';
        break;
      }
      seenModels.add(id);
      modelConfig[id] = { name: rowName };
    }
    if (modelsError) {
      nextErrors.models = modelsError;
    }

    const seenHeaders = new Set<string>();
    let headersError: string | undefined;
    const headerConfig: Record<string, string> = {};
    for (const row of headers) {
      const key = row.key.trim();
      const value = row.value.trim();
      if (!key && !value) {
        continue;
      }
      if (!key || !value) {
        headersError = 'Each header needs a key and a value';
        break;
      }
      if (seenHeaders.has(key.toLowerCase())) {
        headersError = 'Duplicate header key';
        break;
      }
      seenHeaders.add(key.toLowerCase());
      headerConfig[key] = value;
    }
    if (headersError) {
      nextErrors.headers = headersError;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const envMatch = trimmedKey.match(/^\{env:([^}]+)\}$/);
    const env = envMatch?.[1]?.trim();
    const key = trimmedKey && !env ? trimmedKey : undefined;

    setBusy(true);
    try {
      await save.mutateAsync({
        server,
        providerID: trimmedID,
        apiKey: key,
        config: {
          npm: OPENAI_COMPATIBLE_NPM,
          name: trimmedName,
          ...(env ? { env: [env] } : {}),
          options: {
            baseURL: trimmedURL,
            ...(Object.keys(headerConfig).length > 0 ? { headers: headerConfig } : {}),
          },
          models: modelConfig,
        },
      });
      void notify({ title: 'Connected', message: `"${trimmedName}" was connected.` });
      onDone();
    } catch (err) {
      void notify({ title: 'Save failed', message: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-1">
      <Text className="mb-3 text-sm text-muted">
        Add any OpenAI-compatible API as a custom provider.
      </Text>
      <Field label="Provider ID" hint="Lowercase letters, numbers, - or _">
        <TextInput
          className={inputClass}
          placeholder="my-provider"
          placeholderTextColor={colors.muted}
          value={providerID}
          onChangeText={setProviderID}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {errors.providerID ? <Text className="mt-1 text-xs text-danger">{errors.providerID}</Text> : null}
      </Field>
      <Field label="Name">
        <TextInput
          className={inputClass}
          placeholder="My Provider"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
        />
        {errors.name ? <Text className="mt-1 text-xs text-danger">{errors.name}</Text> : null}
      </Field>
      <Field label="Base URL">
        <TextInput
          className={inputClass}
          placeholder="https://api.example.com/v1"
          placeholderTextColor={colors.muted}
          value={baseURL}
          onChangeText={setBaseURL}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {errors.baseURL ? <Text className="mt-1 text-xs text-danger">{errors.baseURL}</Text> : null}
      </Field>
      <Field label="API key" hint="Optional. Use {env:VAR_NAME} to read from an env var.">
        <TextInput
          className={inputClass}
          placeholder="Optional"
          placeholderTextColor={colors.muted}
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>

      <Text className="mb-1 mt-2 text-xs font-medium text-foreground">Models</Text>
      {models.map((row, index) => (
        <View key={index} className="mb-2 flex-row items-center gap-2">
          <TextInput
            className={cn(inputClass, 'flex-1')}
            placeholder="Model ID"
            placeholderTextColor={colors.muted}
            value={row.id}
            onChangeText={(id) =>
              setModels((prev) => prev.map((r, i) => (i === index ? { ...r, id } : r)))
            }
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            className={cn(inputClass, 'flex-1')}
            placeholder="Name"
            placeholderTextColor={colors.muted}
            value={row.name}
            onChangeText={(rowName) =>
              setModels((prev) => prev.map((r, i) => (i === index ? { ...r, name: rowName } : r)))
            }
          />
          <Pressable
            hitSlop={8}
            disabled={models.length <= 1}
            onPress={() => setModels((prev) => prev.filter((_, i) => i !== index))}
          >
            <Trash2Icon size={16} color={models.length <= 1 ? colors.border : colors.muted} />
          </Pressable>
        </View>
      ))}
      {errors.models ? <Text className="mb-2 text-xs text-danger">{errors.models}</Text> : null}
      <Pressable
        className="mb-4 flex-row items-center gap-1 self-start"
        onPress={() => setModels((prev) => [...prev, { id: '', name: '' }])}
      >
        <PlusIcon size={14} color={colors.muted} />
        <Text className="text-sm text-muted">Add model</Text>
      </Pressable>

      <Text className="mb-1 text-xs font-medium text-foreground">Headers</Text>
      {headers.map((row, index) => (
        <View key={index} className="mb-2 flex-row items-center gap-2">
          <TextInput
            className={cn(inputClass, 'flex-1')}
            placeholder="Key"
            placeholderTextColor={colors.muted}
            value={row.key}
            onChangeText={(key) =>
              setHeaders((prev) => prev.map((r, i) => (i === index ? { ...r, key } : r)))
            }
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            className={cn(inputClass, 'flex-1')}
            placeholder="Value"
            placeholderTextColor={colors.muted}
            value={row.value}
            onChangeText={(value) =>
              setHeaders((prev) => prev.map((r, i) => (i === index ? { ...r, value } : r)))
            }
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            hitSlop={8}
            disabled={headers.length <= 1}
            onPress={() => setHeaders((prev) => prev.filter((_, i) => i !== index))}
          >
            <Trash2Icon size={16} color={headers.length <= 1 ? colors.border : colors.muted} />
          </Pressable>
        </View>
      ))}
      {errors.headers ? <Text className="mb-2 text-xs text-danger">{errors.headers}</Text> : null}
      <Pressable
        className="mb-4 flex-row items-center gap-1 self-start"
        onPress={() => setHeaders((prev) => [...prev, { key: '', value: '' }])}
      >
        <PlusIcon size={14} color={colors.muted} />
        <Text className="text-sm text-muted">Add header</Text>
      </Pressable>

      <Button onPress={handleSave} disabled={busy || save.isPending}>
        {busy || save.isPending ? 'Saving…' : 'Save provider'}
      </Button>
    </View>
  );
}
