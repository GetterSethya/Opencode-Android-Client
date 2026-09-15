import { ExternalLinkIcon, PlusIcon, Trash2Icon } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ServerConfig } from '@/chat/settings';
import {
  createClientFromServer,
} from '@/chat/use-opencode-providers';
import {
  pollProviderConnected,
  useAuthorizeProviderOAuth,
  useCallbackProviderOAuth,
  useGlobalConfig,
  useProviderAuthMethods,
  useProviderCatalog,
  useSaveCustomProvider,
  useSetProviderAuth,
} from '@/chat/use-opencode-provider-management';
import type {
  ProviderAuthMethod,
  ProviderAuthPrompt,
  ProviderOAuthAuthorization,
} from '@/chat/opencode';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

const FALLBACK_KEY_METHOD: ProviderAuthMethod[] = [{ type: 'api', label: 'API key' }];

function promptVisible(prompt: ProviderAuthPrompt, values: Record<string, string>): boolean {
  if (!prompt.when) {
    return true;
  }
  const actual = values[prompt.when.key];
  if (actual === undefined) {
    return false;
  }
  return prompt.when.op === 'eq' ? actual === prompt.when.value : actual !== prompt.when.value;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'string' && err) {
    return err;
  }
  return 'Request failed';
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-xs font-medium text-foreground">{label}</Text>
      {children}
      {hint ? <Text className="mt-1 text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground';

export function ConnectFlow({
  server,
  providerID,
  providerName,
  onDone,
}: {
  server: ServerConfig;
  providerID: string;
  providerName?: string;
  onDone: () => void;
}) {
  const colors = useThemeColors();
  const { notify } = useDialog();
  const authMethods = useProviderAuthMethods(server, true);
  const catalog = useProviderCatalog(server, true);
  const setAuth = useSetProviderAuth();
  const authorize = useAuthorizeProviderOAuth();
  const callbackOAuth = useCallbackProviderOAuth();

  const [methodIndex, setMethodIndex] = useState<number | undefined>(undefined);
  const [apiKey, setApiKey] = useState('');
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [promptStep, setPromptStep] = useState(0);
  const [authorization, setAuthorization] = useState<ProviderOAuthAuthorization | undefined>(
    undefined,
  );
  const [waiting, setWaiting] = useState(false);
  const [waitingError, setWaitingError] = useState<string | undefined>(undefined);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const displayName = useMemo(() => {
    if (providerName) {
      return providerName;
    }
    return catalog.data?.all.find((provider) => provider.id === providerID)?.name ?? providerID;
  }, [providerName, catalog.data, providerID]);

  const methods = useMemo<ProviderAuthMethod[]>(() => {
    const values = authMethods.data?.[providerID] ?? [];
    return values.length > 0 ? values : FALLBACK_KEY_METHOD;
  }, [authMethods.data, providerID]);

  const method = methodIndex !== undefined ? methods[methodIndex] : undefined;

  const finishConnected = () => {
    void notify({ title: 'Connected', message: `"${displayName}" was connected.` });
    onDone();
  };

  const pollConnected = async () => {
    try {
      await pollProviderConnected(
        createClientFromServer(server),
        providerID,
        () => !cancelledRef.current,
      );
      if (!cancelledRef.current) {
        setWaiting(false);
        finishConnected();
      }
    } catch {
      // cancelled, timed out, or network error: leave the manual finish button
    }
  };

  const startOAuthMethod = async (index: number, inputs: Record<string, string>) => {
    const selected = methods[index];
    if (!selected || selected.type !== 'oauth') {
      return;
    }
    setBusy(true);
    setFatal(undefined);
    try {
      const result = await authorize.mutateAsync({
        server,
        providerID,
        methodIndex: index,
        inputs,
      });
      if (cancelledRef.current) {
        return;
      }
      setAuthorization(result.authorization);
      if (result.authorization.method === 'auto') {
        setWaiting(true);
        void pollConnected();
      }
    } catch (err) {
      setFatal(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resetMethod = () => {
    setMethodIndex(undefined);
    setApiKey('');
    setPromptValues({});
    setPromptStep(0);
    setAuthorization(undefined);
    setWaiting(false);
    setWaitingError(undefined);
    setCode('');
    setBusy(false);
    setFatal(undefined);
  };

  // Auto-select when there is exactly one method, like the web client.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current || authMethods.isLoading) {
      return;
    }
    if (methods.length === 1) {
      autoStartedRef.current = true;
      setMethodIndex(0);
      if (methods[0].type === 'oauth' && (methods[0].prompts?.length ?? 0) === 0) {
        void startOAuthMethod(0, {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods, authMethods.isLoading]);

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      void notify({ title: 'Cannot open browser', message: url });
    }
  };

  const submitApiKey = async () => {
    if (!apiKey.trim()) {
      void notify({ title: 'API key required', message: 'Enter the API key to continue.' });
      return;
    }
    setBusy(true);
    setFatal(undefined);
    try {
      await setAuth.mutateAsync({ server, providerID, key: apiKey.trim() });
      finishConnected();
    } catch (err) {
      setFatal(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const advancePrompts = (values: Record<string, string>) => {
    const current = method;
    if (!current || current.type !== 'oauth' || methodIndex === undefined) {
      return;
    }
    const prompts = (current.prompts ?? []).filter((prompt) => promptVisible(prompt, values));
    const remaining = prompts.slice(promptStep + 1);
    if (remaining.length === 0) {
      void startOAuthMethod(methodIndex, values);
      return;
    }
    setPromptValues(values);
    setPromptStep(promptStep + 1);
  };

  const handlePromptSelect = (key: string, value: string) => {
    advancePrompts({ ...promptValues, [key]: value });
  };

  const submitTextPrompt = (key: string, value: string) => {
    if (!value.trim()) {
      return;
    }
    const values = { ...promptValues, [key]: value.trim() };
    setPromptValues(values);
    advancePrompts(values);
  };

  const submitCode = async () => {
    if (!code.trim() || methodIndex === undefined) {
      void notify({ title: 'Code required', message: 'Enter the authorization code to continue.' });
      return;
    }
    setBusy(true);
    try {
      await callbackOAuth.mutateAsync({
        server,
        providerID,
        methodIndex,
        code: code.trim(),
      });
      finishConnected();
    } catch (err) {
      void notify({ title: 'Authorization failed', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const finishAuto = async () => {
    if (methodIndex === undefined) {
      return;
    }
    setBusy(true);
    setWaitingError(undefined);
    try {
      await callbackOAuth.mutateAsync({ server, providerID, methodIndex });
      setWaiting(false);
      finishConnected();
    } catch (err) {
      setWaitingError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (authMethods.isLoading) {
    return (
      <View className="items-center py-8">
        <Spinner size={20} />
      </View>
    );
  }

  const visiblePrompts =
    method?.type === 'oauth'
      ? (method.prompts ?? []).filter((prompt) => promptVisible(prompt, promptValues))
      : [];
  const activePrompt = visiblePrompts[promptStep];

  return (
    <View className="gap-4">
      <Text className="text-base font-semibold text-foreground">Connect {displayName}</Text>

      {authMethods.error ? (
        <Text className="text-xs text-muted">
          Could not load login options; you can still connect with an API key.
        </Text>
      ) : null}
      {fatal ? <Text className="text-sm text-danger">{fatal}</Text> : null}

      {method === undefined ? (
        <View className="gap-2">
          <Text className="text-sm text-muted">Choose how to connect {displayName}</Text>
          {methods.map((item, index) => (
            <Pressable
              key={`${item.type}-${index}`}
              className="rounded-xl border border-border px-3 py-3"
              onPress={() => {
                setMethodIndex(index);
                if (item.type === 'oauth' && (item.prompts?.length ?? 0) === 0) {
                  void startOAuthMethod(index, {});
                }
              }}
            >
              <Text className="text-sm font-medium text-foreground">{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {method?.type === 'api' ? (
        <View>
          <Field label={`API key for ${displayName}`}>
            <TextInput
              className={inputClass}
              placeholder="Paste API key"
              placeholderTextColor={colors.muted}
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <View className="flex-row gap-2">
            {methods.length > 1 ? (
              <Button variant="outline" onPress={resetMethod}>
                Back
              </Button>
            ) : null}
            <View className="flex-1">
              <Button onPress={submitApiKey} disabled={busy || setAuth.isPending}>
                {busy || setAuth.isPending ? 'Connecting…' : 'Connect'}
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {method?.type === 'oauth' && activePrompt && !authorization ? (
        <View>
          {activePrompt.type === 'select' ? (
            <View className="gap-2">
              <Text className="text-sm text-foreground">{activePrompt.message}</Text>
              {activePrompt.options.map((option) => (
                <Pressable
                  key={option.value}
                  className="rounded-xl border border-border px-3 py-3"
                  onPress={() => handlePromptSelect(activePrompt.key, option.value)}
                >
                  <Text className="text-sm font-medium text-foreground">{option.label}</Text>
                  {option.hint ? <Text className="text-xs text-muted">{option.hint}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <PromptTextInput prompt={activePrompt} onSubmit={submitTextPrompt} />
          )}
          {methods.length > 1 ? (
            <View className="mt-3">
              <Button variant="outline" onPress={resetMethod}>
                Back
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}

      {method?.type === 'oauth' && !activePrompt && !authorization ? (
        <View className="items-center gap-2 py-6">
          <Spinner size={20} />
          <Text className="text-sm text-muted">Starting authorization…</Text>
        </View>
      ) : null}

      {authorization && authorization.method === 'code' ? (
        <View className="gap-3">
          <Text className="text-sm text-foreground">
            Open this link in your browser to authorize {displayName}, then paste the code below.
          </Text>
          <Button variant="outline" onPress={() => openUrl(authorization.url)}>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-medium text-foreground">Open authorization page</Text>
              <ExternalLinkIcon size={14} color={colors.foreground} />
            </View>
          </Button>
          <Field label="Authorization code">
            <TextInput
              className={inputClass}
              placeholder="Paste code"
              placeholderTextColor={colors.muted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <Button onPress={submitCode} disabled={busy || callbackOAuth.isPending}>
            {busy || callbackOAuth.isPending ? 'Verifying…' : 'Continue'}
          </Button>
        </View>
      ) : null}

      {authorization && authorization.method === 'auto' ? (
        <View className="gap-3">
          <Text className="text-sm text-foreground">
            Open this link in your browser to authorize {displayName}.
          </Text>
          <Button variant="outline" onPress={() => openUrl(authorization.url)}>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-medium text-foreground">Open authorization page</Text>
              <ExternalLinkIcon size={14} color={colors.foreground} />
            </View>
          </Button>
          {authorization.instructions ? (
            <View className="rounded-xl bg-surface-secondary px-3 py-2.5">
              <Text className="font-mono text-sm text-foreground" selectable>
                {authorization.instructions.includes(':')
                  ? authorization.instructions.split(':').pop()?.trim()
                  : authorization.instructions}
              </Text>
            </View>
          ) : null}
          {waitingError ? (
            <Text className="text-sm text-danger">{waitingError}</Text>
          ) : waiting ? (
            <View className="flex-row items-center gap-2">
              <Spinner size={16} />
              <Text className="text-sm text-muted">Waiting for authorization…</Text>
            </View>
          ) : null}
          <Button onPress={finishAuto} disabled={busy || callbackOAuth.isPending}>
            {busy || callbackOAuth.isPending ? 'Checking…' : "I've authorized — finish"}
          </Button>
          <Button variant="outline" onPress={resetMethod}>
            Cancel
          </Button>
        </View>
      ) : null}

      {methods.length > 1 && method && authorization ? (
        <Button variant="outline" onPress={resetMethod}>
          Back
        </Button>
      ) : null}
    </View>
  );
}

function PromptTextInput({
  prompt,
  onSubmit,
}: {
  prompt: Extract<ProviderAuthPrompt, { type: 'text' }>;
  onSubmit: (key: string, value: string) => void;
}) {
  const colors = useThemeColors();
  const [value, setValue] = useState('');
  return (
    <View>
      <Field label={prompt.message}>
        <TextInput
          className={inputClass}
          placeholder={prompt.placeholder}
          placeholderTextColor={colors.muted}
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
      <Button onPress={() => onSubmit(prompt.key, value)} disabled={!value.trim()}>
        Continue
      </Button>
    </View>
  );
}

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
