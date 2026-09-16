import { forwardRef, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-foreground',
  secondary: 'bg-surface-secondary',
  outline: 'border border-border bg-transparent',
  destructive: 'bg-danger',
};

export type BadgeProps = ViewProps & {
  variant?: BadgeVariant;
  children?: ReactNode;
};

export const Badge = forwardRef<React.ElementRef<typeof View>, BadgeProps>(
  function Badge({ className, variant = 'secondary', children, ...props }, ref) {
    return (
      <View
        ref={ref}
        className={cn('flex-row items-center rounded-full px-2 py-0.5', variantClasses[variant], className)}
        {...props}
      >
        {children}
      </View>
    );
  },
);
