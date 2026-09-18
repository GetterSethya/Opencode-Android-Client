import { type ReactNode, useCallback, useEffect } from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { markInteractionPaint } from '@/lib/interaction-perf';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { cn } from '@/lib/utils';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  onLayout?: () => void;
  interactionName?: string;
  animated?: boolean;
}

/**
 * Drawer-style bottom sheet: content stays pre-mounted (like
 * DrawerLayoutAndroid) so opening never pays a mount cost. Visibility is
 * driven purely by UI-thread shared-value animations.
 *
 * The hidden offset is measured from the real content height — a hardcoded
 * offset would leave tall sheets peeking out from the bottom edge.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  className,
  onLayout,
  interactionName = 'session_menu_sheet',
  animated = true,
}: BottomSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  // In-tree sheets don't get the automatic window resize a Modal dialog
  // gets, and the per-sheet KeyboardAvoidingView measures its frame
  // relative to the translated container (so its overlap math yields 0).
  // Lift the whole overlay by the keyboard height instead.
  const keyboardHeight = useKeyboardHeight();
  const progress = useSharedValue(visible ? 1 : 0);
  // Start with a realistic sheet height estimate (~60% window) so initial layout
  // measurement doesn't cause a sudden translateY jump during animation.
  const sheetHeight = useSharedValue(Math.min(windowHeight * 0.65, 520));

  useEffect(() => {
    if (!animated) {
      progress.value = visible ? 1 : 0;
      return;
    }
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 180 : 150,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
    if (visible && interactionName) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          markInteractionPaint(interactionName);
        });
      });
    }
  }, [visible, animated, progress, interactionName]);

  // Intercept Android hardware back button
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const handleSheetLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const measured = event.nativeEvent.layout.height;
      if (measured > 0) {
        sheetHeight.value = measured;
      }
      onLayout?.();
    },
    [sheetHeight, onLayout],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetHeight.value }],
  }));

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          paddingBottom: visible ? keyboardHeight : 0,
          zIndex: visible ? 10 : 0,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, backdropStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          style={StyleSheet.absoluteFill}
          className="bg-black"
          onPress={onClose}
        />
      </Animated.View>
      <View className="flex-1 justify-end" pointerEvents="box-none">
        <Animated.View
          style={sheetStyle}
          className={cn('rounded-t-3xl bg-surface pt-4', className)}
          onLayout={handleSheetLayout}
        >
          {children}
        </Animated.View>
      </View>
    </View>
  );
}
