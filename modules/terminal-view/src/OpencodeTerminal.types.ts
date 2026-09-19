import type { ViewProps } from 'react-native';

export type TerminalTheme = {
  background?: string;
  foreground?: string;
  cursor?: string;
  color0?: string;
  color1?: string;
  color2?: string;
  color3?: string;
  color4?: string;
  color5?: string;
  color6?: string;
  color7?: string;
  color8?: string;
  color9?: string;
  color10?: string;
  color11?: string;
  color12?: string;
  color13?: string;
  color14?: string;
  color15?: string;
};

export type OpencodeTerminalViewProps = ViewProps & {
  fontSize?: number;
  fontFamily?: string;
  cursorBlink?: boolean;
  theme?: TerminalTheme;
  onInput?: (event: { nativeEvent: { data: string } }) => void;
  onResize?: (event: { nativeEvent: { cols: number; rows: number } }) => void;
  onTitleChanged?: (event: { nativeEvent: { title: string } }) => void;
  onBell?: () => void;
};

export type OpencodeTerminalViewRef = {
  write: (data: string) => Promise<void>;
  clear: () => Promise<void>;
  focus: () => Promise<void>;
  blur: () => Promise<void>;
  sendKey: (key: string) => Promise<void>;
};
