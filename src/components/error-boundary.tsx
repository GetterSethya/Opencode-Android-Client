import { Component, type ReactNode } from 'react';
import { View } from 'react-native';

import { ServerErrorState } from './ui/error-state';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Last-resort catch for render crashes: a full 500-style screen instead of a
 * dead app. "Try again" resets the boundary; if the crash is deterministic
 * the screen comes back, which still beats a blank kill.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[app] uncaught render error:', error);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View className="flex-1 bg-background">
          <ServerErrorState
            title="Something went wrong"
            message="The app hit an unexpected error."
            onRetry={this.reset}
            retryLabel="Try again"
          />
        </View>
      );
    }
    return this.props.children;
  }
}
