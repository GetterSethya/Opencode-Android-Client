import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { Text, type TextProps, View, type ViewProps } from 'react-native';

import type { ToolState } from '@/chat/types';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ToolUIState =
  | ToolState
  | 'approval-requested'
  | 'approval-responded'
  | 'output-denied';

type ToolUIPartApproval =
  | {
      id: string;
      approved?: never;
      reason?: never;
    }
  | {
      id: string;
      approved: boolean;
      reason?: string;
    }
  | {
      id: string;
      approved: true;
      reason?: string;
    }
  | {
      id: string;
      approved: false;
      reason?: string;
    }
  | undefined;

interface ConfirmationContextValue {
  approval: ToolUIPartApproval;
  state: ToolUIState;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

const useConfirmation = () => {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error('Confirmation components must be used within Confirmation');
  }

  return context;
};

export type ConfirmationProps = ViewProps & {
  approval?: ToolUIPartApproval;
  state: ToolUIState;
  children?: ReactNode;
  className?: string;
};

export const Confirmation = ({
  className,
  approval,
  state,
  children,
  ...props
}: ConfirmationProps) => {
  const contextValue = useMemo(() => ({ approval, state }), [approval, state]);

  if (!approval || state === 'input-streaming' || state === 'input-available') {
    return null;
  }

  return (
    <ConfirmationContext.Provider value={contextValue}>
      <View className={cn('flex-col gap-2 rounded-lg border border-border p-3', className)} {...props}>
        {children}
      </View>
    </ConfirmationContext.Provider>
  );
};

export type ConfirmationTitleProps = TextProps & {
  children?: ReactNode;
  className?: string;
};

export const ConfirmationTitle = ({ className, ...props }: ConfirmationTitleProps) => (
  <Text className={cn('text-sm text-foreground', className)} {...props} />
);

export interface ConfirmationRequestProps {
  children?: ReactNode;
}

export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
  const { state } = useConfirmation();

  if (state !== 'approval-requested') {
    return null;
  }

  return <>{children}</>;
};

export interface ConfirmationAcceptedProps {
  children?: ReactNode;
}

export const ConfirmationAccepted = ({ children }: ConfirmationAcceptedProps) => {
  const { approval, state } = useConfirmation();

  if (
    !approval?.approved ||
    (state !== 'approval-responded' &&
      state !== 'output-denied' &&
      state !== 'output-available')
  ) {
    return null;
  }

  return <>{children}</>;
};

export interface ConfirmationRejectedProps {
  children?: ReactNode;
}

export const ConfirmationRejected = ({ children }: ConfirmationRejectedProps) => {
  const { approval, state } = useConfirmation();

  if (
    approval?.approved !== false ||
    (state !== 'approval-responded' &&
      state !== 'output-denied' &&
      state !== 'output-available')
  ) {
    return null;
  }

  return <>{children}</>;
};

export type ConfirmationActionsProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const ConfirmationActions = ({
  className,
  ...props
}: ConfirmationActionsProps) => {
  const { state } = useConfirmation();

  if (state !== 'approval-requested') {
    return null;
  }

  return (
    <View
      className={cn('flex-row items-center justify-end gap-2 self-end', className)}
      {...props}
    />
  );
};

export type ConfirmationActionProps = ButtonProps;

export const ConfirmationAction = (props: ConfirmationActionProps) => (
  <Button className="h-8 px-3" {...props} />
);
