const React = require('react');

function KeyboardAvoidingView(props) {
  return React.createElement('KeyboardAvoidingView', props, props.children);
}

module.exports = {
  KeyboardAvoidingView,
};
