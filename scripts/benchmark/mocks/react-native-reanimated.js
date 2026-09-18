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

function withTiming(toValue, config, callback) {
  if (callback) callback(true);
  return toValue;
}

function withSpring(toValue, config, callback) {
  if (callback) callback(true);
  return toValue;
}

function withSequence(...vals) {
  return vals[0];
}

function runOnJS(fn) {
  return fn;
}

const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  inOut: () => (t) => t,
  out: () => (t) => t,
};

const FadeIn = {
  duration: () => FadeIn,
};
const FadeOut = {
  duration: () => FadeOut,
};
const SlideInDown = {
  duration: () => SlideInDown,
  springify: () => SlideInDown,
};
const SlideOutDown = {
  duration: () => SlideOutDown,
};

module.exports = {
  default: Animated,
  Animated,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
};
