const Module = require('module');
const path = require('path');

global.__DEV__ = false;
globalThis.expo = {
  EventEmitter: class EventEmitter {
    addListener() { return { remove: () => {} }; }
    removeListener() {}
    emit() {}
    removeAllListeners() {}
  },
  modules: {},
};

const mockDir = path.resolve(__dirname, 'mocks');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'react-native') {
    return path.join(mockDir, 'react-native.js');
  }
  if (request === 'react-native-reanimated') {
    return path.join(mockDir, 'react-native-reanimated.js');
  }
  if (request === 'react-native-safe-area-context') {
    return path.join(mockDir, 'react-native-safe-area-context.js');
  }
  if (request === 'react-native-keyboard-controller') {
    return path.join(mockDir, 'react-native-keyboard-controller.js');
  }
  if (request === 'expo-navigation-bar') {
    return path.join(mockDir, 'expo-navigation-bar.js');
  }
  if (request === 'expo-file-system') {
    return path.join(mockDir, 'expo-file-system.js');
  }
  if (request === 'expo-document-picker') {
    return path.join(mockDir, 'expo-document-picker.js');
  }
  if (request === 'expo-image-picker') {
    return path.join(mockDir, 'expo-image-picker.js');
  }
  if (request === 'react-native-svg') {
    return path.join(mockDir, 'react-native-svg.js');
  }
  if (request === '@ronradtke/react-native-markdown-display') {
    return path.join(mockDir, 'react-native-markdown-display.js');
  }
  if (request === '@react-native-async-storage/async-storage') {
    return path.join(mockDir, 'async-storage.js');
  }
  return origResolve.call(this, request, parent, isMain, options);
};
