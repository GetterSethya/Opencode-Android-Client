import { forwardRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, Text } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/lib/utils';

const buttonVariants = tv({
  base: 'flex-row items-center justify-center gap-2 rounded-md',
  variants: {
    variant: {
      default: 'bg-foreground',
      secondary: 'bg-surface-secondary',
      outline: 'border border-border bg-surface',
      ghost: 'bg-transparent',
      destructive: 'bg-danger',
      link: 'bg-transparent',
    },
    size: {
      default: 'h-10 px-4',
      sm: 'h-8 px-3',
      lg: 'h-11 px-6',
      icon: 'h-10 w-10',
      'icon-sm': 'h-8 w-8',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

const labelVariants = tv({
  base: 'text-sm font-medium',
  variants: {
    variant: {
      default: 'text-background',
      secondary: 'text-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      destructive: 'text-danger-foreground',
      link: 'text-accent underline',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type ButtonProps = Omit<PressableProps, 'children'> &
  VariantProps<typeof buttonVariants> & {
    children?: ReactNode;
  };

export const Button = forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  function Button({ className, variant, size, children, disabled, ...props }, ref) {
    const content =
      typeof children === 'string' || typeof children === 'number' ? (
        <Text className={labelVariants({ variant })}>{children}</Text>
      ) : (
        children
      );

    return (
      <Pressable
        ref={ref}
        className={cn(buttonVariants({ variant, size }), disabled && 'opacity-50', className)}
        disabled={disabled}
        {...props}
      >
        {content}
      </Pressable>
    );
  },
);
