const React = require('react');
const { View, Text } = require('./react-native');

// Use markdown-it from @ronradtke/react-native-markdown-display
let MarkdownIt;
try {
  MarkdownIt = require('@ronradtke/react-native-markdown-display/node_modules/markdown-it') || require('markdown-it');
} catch {
  try {
    MarkdownIt = require('markdown-it');
  } catch {
    MarkdownIt = null;
  }
}

const md = MarkdownIt ? new MarkdownIt({ typographer: true }) : null;

function MarkdownDisplay({ children, rules = {}, style = {} }) {
  if (typeof children !== 'string') {
    return React.createElement(View, null, children);
  }

  if (!md) {
    return React.createElement(View, null, React.createElement(Text, null, children));
  }

  // Parse tokens to simulate full markdown AST generation and rule execution
  const tokens = md.parse(children, {});
  const elements = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'fence' || token.type === 'code_block') {
      const ruleFn = rules.fence || rules.code_block;
      if (ruleFn) {
        elements.push(ruleFn({
          key: `token-${i}`,
          content: token.content,
          sourceInfo: token.info,
        }));
      } else {
        elements.push(
          React.createElement(Text, { key: `token-${i}`, style: style.code_inline }, token.content)
        );
      }
    } else if (token.type === 'paragraph_open') {
      const inlineToken = tokens[i + 1];
      if (inlineToken && inlineToken.type === 'inline') {
        elements.push(
          React.createElement(Text, { key: `p-${i}`, style: style.paragraph }, inlineToken.content)
        );
        i++;
      }
    } else if (token.type === 'heading_open') {
      const inlineToken = tokens[i + 1];
      if (inlineToken && inlineToken.type === 'inline') {
        const level = token.tag;
        const headingStyle = style[level] || style.heading1;
        elements.push(
          React.createElement(Text, { key: `h-${i}`, style: headingStyle }, inlineToken.content)
        );
        i++;
      }
    } else if (token.type === 'blockquote_open') {
      elements.push(
        React.createElement(View, { key: `quote-${i}`, style: style.blockquote },
          React.createElement(Text, null, token.content || '')
        )
      );
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      elements.push(
        React.createElement(View, { key: `list-${i}`, style: style.bullet_list })
      );
    }
  }

  return React.createElement(View, null, ...elements);
}

module.exports = React.memo(MarkdownDisplay);
module.exports.default = React.memo(MarkdownDisplay);
