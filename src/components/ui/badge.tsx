import { forwardRef, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'flex-row items-center rounded-full px-2 py-0.5 bg-foreground',
  secondary: 'flex-row items-center rounded-full px-2 py-0.5 bg-surface-secondary',
  outline: 'flex-row items-center rounded-full px-2 py-0.5 border border-border bg-transparent',
  destructive: 'flex-row items-center rounded-full px-2 py-0.5 bg-danger',
};

export type BadgeProps = ViewProps & {
  variant?: BadgeVariant;
  children?: ReactNode;
};

export const Badge = forwardRef<React.ElementRef<typeof View>, BadgeProps>(
  function Badge({ className, variant = 'secondary', children, ...props }, ref) {
    const baseClass = variantClasses[variant];
    const badgeClass = className ? cn(baseClass, className) : baseClass;
    return (
      <View
        ref={ref}
        className={badgeClass}
        {...props}
      >
        {children}
      </View>
    );
  },
);
