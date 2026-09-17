import { forwardRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, Text } from 'react-native';

import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: 'bg-foreground',
  secondary: 'bg-surface-secondary',
  outline: 'border border-border bg-surface',
  ghost: 'bg-transparent',
  destructive: 'bg-danger',
  link: 'bg-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'h-10 px-4',
  sm: 'h-8 px-3',
  lg: 'h-11 px-6',
  icon: 'h-10 w-10',
  'icon-sm': 'h-8 w-8',
};

const LABEL_CLASSES: Record<ButtonVariant, string> = {
  default: 'text-sm font-medium text-background',
  secondary: 'text-sm font-medium text-foreground',
  outline: 'text-sm font-medium text-foreground',
  ghost: 'text-sm font-medium text-foreground',
  destructive: 'text-sm font-medium text-danger-foreground',
  link: 'text-sm font-medium text-accent underline',
};

export type ButtonProps = Omit<PressableProps, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
};

export const Button = forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  function Button({ className, variant = 'default', size = 'default', children, disabled, ...props }, ref) {
    const content =
      typeof children === 'string' || typeof children === 'number' ? (
        <Text className={LABEL_CLASSES[variant]}>{children}</Text>
      ) : (
        children
      );

    const baseClass = `flex-row items-center justify-center gap-2 rounded-md ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
    const buttonClass = className || disabled
      ? cn(baseClass, disabled && 'opacity-50', className)
      : baseClass;

    return (
      <Pressable
        ref={ref}
        className={buttonClass}
        disabled={disabled}
        {...props}
      >
        {content}
      </Pressable>
    );
  },
);
