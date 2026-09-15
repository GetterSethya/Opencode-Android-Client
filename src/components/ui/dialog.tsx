import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { cn } from '@/lib/utils';

import { Button } from './button';

export type DialogAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export type DialogOptions = {
  title: string;
  message?: string;
  /** Confirm button label (confirmations only). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the danger style. */
  destructive?: boolean;
  /** Single dismiss button, no cancel. */
  informational?: boolean;
  /** Choice list instead of confirm/cancel (e.g. pick an attachment source). */
  actions?: DialogAction[];
};

type DialogApi = {
  /** Resolves true when confirmed, false when cancelled/dismissed. */
  confirm: (options: DialogOptions) => Promise<boolean>;
  /** Fire-and-forget message with a single dismiss button. */
  notify: (options: DialogOptions) => Promise<void>;
  /** Choice list; resolves with the chosen action's index, or -1 if dismissed. */
  choose: (options: DialogOptions) => Promise<number>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within <DialogProvider>');
  }
  return context;
}

type Pending = {
  options: DialogOptions;
  resolve: (result: number) => void;
};

/**
 * App-themed replacement for React Native's `Alert`, which always renders the
 * platform dialog and cannot follow the app's dark theme. Mounted once near
 * the root; consumers call `useDialog()`.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolveRef = useRef<((result: number) => void) | null>(null);

  const open = useCallback(
    (options: DialogOptions) =>
      new Promise<number>((resolve) => {
        resolveRef.current = resolve;
        setPending({ options, resolve });
      }),
    [],
  );

  const settle = useCallback((result: number) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      async confirm(options) {
        return (await open(options)) === 1;
      },
      async notify(options) {
        await open({ ...options, informational: true });
      },
      choose(options) {
        return open(options);
      },
    }),
    [open],
  );

  const options = pending?.options;
  const actions = options?.actions;

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        transparent
        statusBarTranslucent
        animationType="fade"
        visible={pending !== null}
        onRequestClose={() => settle(-1)}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Pressable
            className="absolute inset-0 bg-black/50"
            accessibilityLabel="Dismiss dialog"
            onPress={() => settle(-1)}
          />
          {options ? (
            <View className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-surface">
              <View className="gap-1.5 px-5 pb-4 pt-5">
                <Text className="text-base font-semibold text-foreground">{options.title}</Text>
                {options.message ? (
                  <Text className="text-sm leading-5 text-muted">{options.message}</Text>
                ) : null}
              </View>

              {actions && actions.length > 0 ? (
                <ScrollView style={{ maxHeight: 320 }} className="border-t border-border">
                  {actions.map((action, index) => (
                    <Pressable
                      key={action.label}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      className="border-b border-border px-5 py-3.5 active:bg-surface-secondary"
                      onPress={() => {
                        settle(index);
                        action.onPress();
                      }}
                    >
                      <Text
                        className={cn(
                          'text-center text-sm font-medium',
                          action.destructive ? 'text-danger' : 'text-foreground',
                        )}
                      >
                        {action.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <View className="flex-row items-center justify-end gap-2 border-t border-border px-4 py-3">
                {actions && actions.length > 0 ? (
                  <Button size="sm" variant="ghost" onPress={() => settle(-1)}>
                    Cancel
                  </Button>
                ) : options.informational ? (
                  <Button size="sm" variant="secondary" onPress={() => settle(0)}>
                    {options.confirmLabel ?? 'OK'}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onPress={() => settle(-1)}>
                      {options.cancelLabel ?? 'Cancel'}
                    </Button>
                    <Button
                      size="sm"
                      variant={options.destructive ? 'destructive' : 'default'}
                      onPress={() => settle(1)}
                    >
                      {options.confirmLabel ?? 'Confirm'}
                    </Button>
                  </>
                )}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}
