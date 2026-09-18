import { createContext, type ReactNode, useContext } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeColors = {
  dark: boolean;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  input: string;
  primary: string;
  danger: string;
  success: string;
};

export const surfaceClass = (_dark: boolean) => 'bg-surface';
export const backgroundClass = (_dark: boolean) => 'bg-background';
export const foregroundClass = (_dark: boolean) => 'text-foreground';
export const mutedTextClass = (_dark: boolean) => 'text-muted';
export const borderClass = (_dark: boolean) => 'border-border';
export const inputClass = (_dark: boolean) => 'bg-surface-secondary';

export const DARK_THEME_COLORS: ThemeColors = Object.freeze({
  dark: true,
  background: '#09090b',
  surface: '#18181b',
  foreground: '#fafafa',
  muted: '#a1a1aa',
  border: '#27272a',
  input: '#27272a',
  primary: '#fafafa',
  danger: '#f87171',
  success: '#4ade80',
});

export const LIGHT_THEME_COLORS: ThemeColors = Object.freeze({
  dark: false,
  background: '#ffffff',
  surface: '#ffffff',
  foreground: '#18181b',
  muted: '#71717a',
  border: '#e4e4e7',
  input: '#f4f4f5',
  primary: '#18181b',
  danger: '#dc2626',
  success: '#16a34a',
});

/**
 * Provides the app-level resolved dark mode. Using context (rather than
 * useColorScheme in every component) keeps theming consistent inside RN Modals
 * and when the user picks an explicit light/dark theme in settings.
 */
export const ThemeSchemeContext = createContext<boolean | null>(null);

export function ThemeSchemeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: boolean;
}) {
  const scheme = useColorScheme();
  const dark = value ?? scheme === 'dark';

  return <ThemeSchemeContext.Provider value={dark}>{children}</ThemeSchemeContext.Provider>;
}

export function useThemeColors(): ThemeColors {
  const context = useContext(ThemeSchemeContext);
  // Default to dark when outside provider without attaching per-component native Appearance listeners
  const dark = context ?? true;
  return dark ? DARK_THEME_COLORS : LIGHT_THEME_COLORS;
}
