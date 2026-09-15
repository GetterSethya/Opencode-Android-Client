import {
  CheckIcon,
  MoonIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  ServerIcon,
  SmartphoneIcon,
  SunIcon,
  Trash2Icon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
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

import { useChatSettings, type ServerConfig, type ThemePreference } from '@/chat/settings';
import { appVersionLabel } from '@/chat/app-info';
import { useDialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

export type SettingsFormProps = {
  visible: boolean;
  onClose: () => void;
  onOpenProviders?: () => void;
};

const THEMES: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: SmartphoneIcon },
];

const emptyServer: Omit<ServerConfig, 'id'> = {
  name: '',
  serverUrl: 'http://',
  username: 'opencode',
  password: '',
  directory: '',
};

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground';

export function SettingsForm({ visible, onClose, onOpenProviders }: SettingsFormProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const colors = useThemeColors();
  const keyboardHeight = useKeyboardHeight();
  const scrollMaxHeight =
    keyboardHeight > 0
      ? Math.max(240, height - keyboardHeight - 320)
      : Math.min(height * 0.7, 520);
  const {
    servers,
    activeServerId,
    theme,
    setTheme,
    addServer,
    updateServer,
    removeServer,
    setActiveServer,
  } = useChatSettings();
  const { confirm } = useDialog();

  const [editing, setEditing] = useState<ServerConfig | null>(null);
  const [draft, setDraft] = useState<Omit<ServerConfig, 'id'>>(emptyServer);
  const [isFormOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setEditing(null);
      setFormOpen(false);
    }
  }, [visible]);

  const startAdd = () => {
    setEditing(null);
    setDraft({ ...emptyServer, name: `Server ${servers.length + 1}` });
    setFormOpen(true);
  };

  const startEdit = (server: ServerConfig) => {
    setEditing(server);
    setDraft({
      name: server.name,
      serverUrl: server.serverUrl,
      username: server.username,
      password: server.password,
      directory: server.directory,
    });
    setFormOpen(true);
  };

  const cancelForm = () => {
    setEditing(null);
    setDraft(emptyServer);
    setFormOpen(false);
  };

  const handleSave = () => {
    const normalized = {
      ...draft,
      name: draft.name.trim() || 'Server',
      serverUrl: draft.serverUrl.trim().replace(/\/$/, ''),
      username: draft.username.trim() || 'opencode',
      directory: draft.directory.trim(),
    };

    if (editing) {
      updateServer(editing.id, normalized);
    } else {
      addServer(normalized);
    }
    cancelForm();
    onClose();
  };

  const confirmRemove = async (server: ServerConfig) => {
    const confirmed = await confirm({
      title: 'Delete server',
      message: `Remove "${server.name}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      removeServer(server.id);
    }
  };

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
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-foreground">
                {isFormOpen ? (editing ? 'Edit server' : 'New server') : 'Settings'}
              </Text>
              <Pressable hitSlop={8} onPress={isFormOpen ? cancelForm : onClose}>
                <Text className="text-sm text-muted">{isFormOpen ? 'Cancel' : 'Done'}</Text>
              </Pressable>
            </View>

            {isFormOpen ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: scrollMaxHeight }}>
                <Field label="Name">
                  <TextInput
                    className={inputClass}
                    placeholder="Local"
                    placeholderTextColor={colors.muted}
                    value={draft.name}
                    onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
                  />
                </Field>
                <Field label="Server URL">
                  <TextInput
                    className={inputClass}
                    placeholder="http://192.168.1.10:4097"
                    placeholderTextColor={colors.muted}
                    value={draft.serverUrl}
                    onChangeText={(serverUrl) => setDraft((prev) => ({ ...prev, serverUrl }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </Field>
                <Field label="Username" hint="Defaults to opencode">
                  <TextInput
                    className={inputClass}
                    placeholder="opencode"
                    placeholderTextColor={colors.muted}
                    value={draft.username}
                    onChangeText={(username) => setDraft((prev) => ({ ...prev, username }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <Field label="Password" hint="Leave empty for a passwordless server">
                  <TextInput
                    className={inputClass}
                    placeholder="Optional"
                    placeholderTextColor={colors.muted}
                    value={draft.password}
                    onChangeText={(password) => setDraft((prev) => ({ ...prev, password }))}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <Field label="Directory" hint="Optional project directory on the server">
                  <TextInput
                    className={inputClass}
                    placeholder="/home/user/project"
                    placeholderTextColor={colors.muted}
                    value={draft.directory}
                    onChangeText={(directory) => setDraft((prev) => ({ ...prev, directory }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <View className="mt-2">
                  <Button onPress={handleSave}>Save server</Button>
                </View>
              </ScrollView>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: scrollMaxHeight }}>
                {onOpenProviders ? (
                  <>
                    <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      Models & providers
                    </Text>
                    <Pressable
                      className="mb-5 flex-row items-center gap-3 rounded-xl border border-border px-3 py-3"
                      onPress={onOpenProviders}
                    >
                      <PlugIcon size={18} color={colors.muted} />
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-foreground">
                          Manage providers & models
                        </Text>
                        <Text className="text-xs text-muted" numberOfLines={1}>
                          Connect providers, choose visible models
                        </Text>
                      </View>
                    </Pressable>
                  </>
                ) : null}
                <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Appearance
                </Text>
                <View className="mb-5 flex-row gap-2">
                  {THEMES.map((option) => {
                    const Icon = option.icon;
                    const isActive = theme === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        className={cn(
                          'flex-1 items-center gap-2 rounded-xl border py-3',
                          isActive ? 'border-foreground bg-foreground' : 'border-border',
                        )}
                        onPress={() => setTheme(option.value)}
                      >
                        <Icon size={18} color={isActive ? colors.background : colors.muted} />
                        <Text
                          className={cn(
                            'text-xs font-medium',
                            isActive ? 'text-background' : 'text-foreground',
                          )}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Servers
                </Text>
                {servers.map((server) => {
                  const isActive = server.id === activeServerId;
                  return (
                    <View
                      key={server.id}
                      className={cn(
                        'mb-2 flex-row items-center gap-3 rounded-xl border px-3 py-3',
                        isActive ? 'border-foreground' : 'border-border',
                      )}
                    >
                      <Pressable
                        className="flex-1 flex-row items-center gap-3"
                        onPress={() => setActiveServer(server.id)}
                      >
                        <ServerIcon size={18} color={colors.muted} />
                        <View className="flex-1">
                          <Text
                            className="text-sm font-medium text-foreground"
                            numberOfLines={1}
                          >
                            {server.name}
                          </Text>
                          <Text className="text-xs text-muted" numberOfLines={1}>
                            {server.serverUrl}
                          </Text>
                        </View>
                        {isActive ? <CheckIcon size={16} color={colors.success} /> : null}
                      </Pressable>
                      <Pressable hitSlop={8} onPress={() => startEdit(server)}>
                        <PencilIcon size={16} color={colors.muted} />
                      </Pressable>
                      <Pressable hitSlop={8} onPress={() => confirmRemove(server)}>
                        <Trash2Icon size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                  );
                })}

                <Pressable
                  className="mt-1 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3"
                  onPress={startAdd}
                >
                  <PlusIcon size={16} color={colors.muted} />
                  <Text className="text-sm font-medium text-foreground">Add server</Text>
                </Pressable>
              </ScrollView>
            )}
            <Text className="pt-3 text-center text-xs text-muted">
              opencode {appVersionLabel()}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-xs font-medium text-foreground">{label}</Text>
      {children}
      {hint ? <Text className="mt-1 text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}
