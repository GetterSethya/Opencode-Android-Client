const React = require('react');

function useSafeAreaInsets() {
  return { top: 48, bottom: 34, left: 0, right: 0 };
}

function SafeAreaView(props) {
  return React.createElement('SafeAreaView', props, props.children);
}

module.exports = {
  useSafeAreaInsets,
  SafeAreaView,
};
