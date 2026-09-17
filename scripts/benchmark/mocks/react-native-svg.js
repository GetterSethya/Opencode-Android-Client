const React = require('react');

function createSvgComponent(name) {
  return function(props) {
    return React.createElement(name, props, props.children);
  };
}

module.exports = {
  default: createSvgComponent('Svg'),
  Svg: createSvgComponent('Svg'),
  Circle: createSvgComponent('Circle'),
  Rect: createSvgComponent('Rect'),
  Path: createSvgComponent('Path'),
  G: createSvgComponent('G'),
  Line: createSvgComponent('Line'),
};
