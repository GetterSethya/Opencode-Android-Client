import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/utils';

export type ShimmerProps = {
  children: string;
  duration?: number;
  className?: string;
};

export function Shimmer({ children, duration = 2, className }: ShimmerProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    const half = Math.max((duration * 1000) / 2, 1);
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: half, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: half, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [duration, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text className={cn('text-zinc-500', className)} style={animatedStyle}>
      {children}
    </Animated.Text>
  );
}
