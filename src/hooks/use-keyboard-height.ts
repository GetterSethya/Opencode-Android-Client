import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Tracks the on-screen keyboard height so bottom sheets can shrink their
 * scroll area to fit above it. The modal dialog window does not resize for
 * the keyboard, so content must adapt manually (paired with
 * KeyboardAvoidingView, which positions the sheet).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
