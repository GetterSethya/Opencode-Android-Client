import { View } from 'react-native';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import { Shimmer } from './shimmer';

export type LoaderProps = {
  label?: string;
  className?: string;
};

export function Loader({ label = 'Thinking...', className }: LoaderProps) {
  return (
    <View className={cn('flex-row items-center gap-2', className)}>
      <Spinner size={16} />
      <Shimmer duration={1}>{label}</Shimmer>
    </View>
  );
}
