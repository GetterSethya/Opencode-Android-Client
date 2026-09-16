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
  const fallbackDark = useColorScheme() === 'dark';
  const dark = context ?? fallbackDark;

  return {
    dark,
    background: dark ? '#09090b' : '#ffffff',
    surface: dark ? '#18181b' : '#ffffff',
    foreground: dark ? '#fafafa' : '#18181b',
    muted: dark ? '#a1a1aa' : '#71717a',
    border: dark ? '#27272a' : '#e4e4e7',
    input: dark ? '#27272a' : '#f4f4f5',
    primary: dark ? '#fafafa' : '#18181b',
    danger: dark ? '#f87171' : '#dc2626',
    success: dark ? '#4ade80' : '#16a34a',
  };
}
