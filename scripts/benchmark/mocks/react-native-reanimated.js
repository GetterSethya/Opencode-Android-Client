const React = require('react');

const Animated = {
  View: React.forwardRef((props, ref) => React.createElement('Animated.View', { ...props, ref })),
  Text: React.forwardRef((props, ref) => React.createElement('Animated.Text', { ...props, ref })),
  ScrollView: React.forwardRef((props, ref) => React.createElement('Animated.ScrollView', { ...props, ref })),
};

function useSharedValue(initial) {
  return React.useRef({ value: initial }).current;
}

function useAnimatedStyle(fn) {
  return fn();
}

function withRepeat(val) {
  return val;
}

function withTiming(toValue) {
  return toValue;
}

function withSequence(...vals) {
  return vals[0];
}

const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  inOut: () => (t) => t,
};

const FadeIn = {
  duration: () => FadeIn,
};

module.exports = {
  default: Animated,
  Animated,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
};
