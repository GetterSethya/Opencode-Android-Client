const React = require('react');

function createComponent(name) {
  const Component = React.forwardRef((props, ref) => {
    return React.createElement(name, { ...props, ref });
  });
  Component.displayName = name;
  return Component;
}

const View = createComponent('View');
const Text = createComponent('Text');
const Pressable = createComponent('Pressable');
const TextInput = createComponent('TextInput');
const ScrollView = createComponent('ScrollView');
const Image = createComponent('Image');
const Modal = createComponent('Modal');
const DrawerLayoutAndroid = createComponent('DrawerLayoutAndroid');
const Switch = createComponent('Switch');

function FlatList(props) {
  const { data, renderItem, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, keyExtractor } = props;
  const items = data || [];
  const header = typeof ListHeaderComponent === 'function' ? React.createElement(ListHeaderComponent) : ListHeaderComponent;
  const footer = typeof ListFooterComponent === 'function' ? React.createElement(ListFooterComponent) : ListFooterComponent;
  
  if (items.length === 0 && ListEmptyComponent) {
    const empty = typeof ListEmptyComponent === 'function' ? React.createElement(ListEmptyComponent) : ListEmptyComponent;
    return React.createElement('FlatList', props, header, empty, footer);
  }

  const renderedItems = items.map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : index;
    const element = renderItem ? renderItem({ item, index, separators: {} }) : null;
    return React.createElement(React.Fragment, { key }, element);
  });

  return React.createElement('FlatList', props, header, ...renderedItems, footer);
}

const Clipboard = {
  setString: () => {},
  getString: () => Promise.resolve(''),
};

const Share = {
  share: () => Promise.resolve({ action: 'sharedAction' }),
};

const Keyboard = {
  dismiss: () => {},
  addListener: () => ({ remove: () => {} }),
};

const BackHandler = {
  addEventListener: () => ({ remove: () => {} }),
  removeEventListener: () => {},
};

const Linking = {
  openURL: () => Promise.resolve(),
  canOpenURL: () => Promise.resolve(true),
};

const Platform = {
  OS: 'android',
  select: (obj) => (obj && obj.android !== undefined ? obj.android : (obj && obj.default !== undefined ? obj.default : undefined)),
  isTesting: true,
  Version: 34,
};

const Appearance = {
  getColorScheme: () => 'dark',
  addChangeListener: () => ({ remove: () => {} }),
};

function useColorScheme() {
  return 'dark';
}

const StyleSheet = {
  create: (styles) => styles,
  flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles) : styles),
};

function useWindowDimensions() {
  return { width: 390, height: 844, scale: 3, fontScale: 1 };
}

module.exports = {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  FlatList,
  Image,
  Modal,
  DrawerLayoutAndroid,
  Switch,
  Clipboard,
  Share,
  Keyboard,
  BackHandler,
  Linking,
  Platform,
  Appearance,
  useColorScheme,
  StyleSheet,
  useWindowDimensions,
};
