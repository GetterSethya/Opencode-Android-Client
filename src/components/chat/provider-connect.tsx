import { ExternalLinkIcon } from 'lucide-react-native';
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
  useProviderAuthMethods,
  useProviderCatalog,
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

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-xs font-medium text-foreground">{label}</Text>
      {children}
      {hint ? <Text className="mt-1 text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}

export const inputClass =
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
