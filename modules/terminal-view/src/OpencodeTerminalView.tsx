import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { type ComponentType } from 'react';

import type {
  OpencodeTerminalViewProps,
  OpencodeTerminalViewRef,
} from './OpencodeTerminal.types';

const NativeTerminalView: ComponentType<
  OpencodeTerminalViewProps & { ref?: React.Ref<unknown> }
> = requireNativeViewManager('OpencodeTerminal');

export const OpencodeTerminalView = React.forwardRef<
  OpencodeTerminalViewRef,
  OpencodeTerminalViewProps
>((props, ref) => {
  const nativeRef = React.useRef<{
    write?: (data: string) => Promise<void>;
    clear?: () => Promise<void>;
    focus?: () => Promise<void>;
    blur?: () => Promise<void>;
    sendKey?: (key: string) => Promise<void>;
  } | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      write: async (data: string) => {
        if (nativeRef.current?.write) {
          await nativeRef.current.write(data);
        }
      },
      clear: async () => {
        if (nativeRef.current?.clear) {
          await nativeRef.current.clear();
        }
      },
      focus: async () => {
        if (nativeRef.current?.focus) {
          await nativeRef.current.focus();
        }
      },
      blur: async () => {
        if (nativeRef.current?.blur) {
          await nativeRef.current.blur();
        }
      },
      sendKey: async (key: string) => {
        if (nativeRef.current?.sendKey) {
          await nativeRef.current.sendKey(key);
        }
      },
    }),
    [],
  );

  return <NativeTerminalView ref={nativeRef} {...props} />;
});

OpencodeTerminalView.displayName = 'OpencodeTerminalView';
