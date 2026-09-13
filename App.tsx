import './global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ChatSettingsProvider } from '@/chat/settings';
import { ChatScreen } from '@/screens/ChatScreen';

const queryClient = new QueryClient();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ChatSettingsProvider>
            <HeroUINativeProvider>
              <QueryClientProvider client={queryClient}>
                <ChatScreen />
              </QueryClientProvider>
            </HeroUINativeProvider>
          </ChatSettingsProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
