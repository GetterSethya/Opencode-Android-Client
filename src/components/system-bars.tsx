import { NavigationBar } from 'expo-navigation-bar';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Keeps the Android navigation bar in sync with the app theme.
 *
 * `light` draws light buttons (for dark backgrounds) and `dark` draws dark
 * buttons (for light backgrounds).
 *
 * On many OEMs (e.g. MIUI) the navigation bar gets an opaque, theme-dependent
 * background in landscape that apps cannot recolor. We hide it in landscape so
 * the app can use the full width without a mismatched system bar.
 */
export function SystemBars() {
  const { dark } = useThemeColors();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      if (!cancelled) {
        NavigationBar.setHidden(isLandscape);
      }
    };
    apply();
    const retry = setTimeout(apply, 300);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [isLandscape]);

  return <NavigationBar style={dark ? 'light' : 'dark'} hidden={isLandscape} />;
}
