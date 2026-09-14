import { Highlight, themes, type Language, type PrismTheme } from 'prism-react-renderer';
import { useMemo } from 'react';
import { Text, View, type TextStyle } from 'react-native';

import { useThemeColors } from '@/hooks/use-theme-colors';

/** Languages bundled with prism-react-renderer that we map file extensions to. */
const EXTENSION_LANGUAGE: Record<string, Language> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
  markdown: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  graphql: 'graphql',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  m: 'objectivec',
  rs: 'rust',
  go: 'go',
  py: 'python',
  rb: 'clike',
  java: 'clike',
  sh: 'clike',
  bash: 'clike',
};

export function languageForPath(path: string): Language {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_LANGUAGE[ext] ?? ('plaintext' as Language);
}

export function normalizeLanguage(value?: string): Language {
  if (!value) {
    return 'plaintext' as Language;
  }
  const key = value.toLowerCase();
  return EXTENSION_LANGUAGE[key] ?? (key as Language);
}

function usePrismTheme(): PrismTheme {
  const { dark } = useThemeColors();
  return dark ? themes.vsDark : themes.vsLight;
}

/**
 * Highlighted code that can render either as a plain block or as fixed-height
 * numbered rows (used by the virtualized file viewer).
 *
 * `selectable` switches to a single-paragraph layout: Android text selection is
 * scoped to one native text node, so one <Text> per line would only allow
 * selecting a single line at a time. In that mode the line numbers move to a
 * separate gutter so they are not included in the copied text.
 */
export function HighlightedCode({
  code,
  language,
  fontSize = 12,
  lineHeight,
  showLineNumbers = false,
  startLine = 1,
  selectable = false,
}: {
  code: string;
  language: Language;
  fontSize?: number;
  lineHeight?: number;
  showLineNumbers?: boolean;
  startLine?: number;
  selectable?: boolean;
}) {
  const prismTheme = usePrismTheme();
  const colors = useThemeColors();

  return (
    <Highlight theme={prismTheme} code={code} language={language}>
      {({ tokens, getTokenProps }) => {
        const tokenStyleFor = (token: (typeof tokens)[number][number]): TextStyle => {
          const { style } = getTokenProps({ token });
          const tokenStyle: TextStyle = {
            fontSize,
            color: (style?.color as string) ?? colors.foreground,
          };
          if (style?.fontStyle === 'italic') {
            tokenStyle.fontStyle = 'italic';
          }
          if (style?.fontWeight) {
            tokenStyle.fontWeight = style.fontWeight as TextStyle['fontWeight'];
          }
          return tokenStyle;
        };

        if (selectable) {
          return (
            <View className="flex-row">
              {showLineNumbers ? (
                <LineNumberGutter
                  count={tokens.length}
                  startLine={startLine}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                />
              ) : null}
              <Text
                selectable
                style={{
                  fontSize,
                  ...(lineHeight ? { lineHeight, includeFontPadding: false } : null),
                }}
                className="font-mono"
              >
                {tokens.map((line, lineIndex) => (
                  <Text key={lineIndex} style={{ fontSize }} className="font-mono">
                    {line.map((token, tokenIndex) =>
                      // Prism marks blank lines with a synthetic "\n" token; the
                      // line separator below already accounts for those.
                      token.empty ? null : (
                        <Text key={tokenIndex} style={tokenStyleFor(token)} className="font-mono">
                          {token.content}
                        </Text>
                      ),
                    )}
                    {lineIndex < tokens.length - 1 ? '\n' : ''}
                  </Text>
                ))}
              </Text>
            </View>
          );
        }

        return (
          <View>
            {tokens.map((line, lineIndex) => (
              <View
                key={lineIndex}
                className="flex-row"
                style={lineHeight ? { height: lineHeight } : undefined}
              >
                {showLineNumbers ? (
                  <Text
                    style={{ fontSize, color: colors.muted, width: 44, textAlign: 'right' }}
                    className="pr-2 font-mono"
                  >
                    {startLine + lineIndex}
                  </Text>
                ) : null}
                <Text
                  numberOfLines={lineHeight ? 1 : undefined}
                  style={{ fontSize }}
                  className="font-mono"
                >
                  {line.length === 0 ? (
                    <Text style={{ fontSize }}> </Text>
                  ) : (
                    line.map((token, tokenIndex) => (
                      <Text key={tokenIndex} style={tokenStyleFor(token)} className="font-mono">
                        {token.content}
                      </Text>
                    ))
                  )}
                </Text>
              </View>
            ))}
          </View>
        );
      }}
    </Highlight>
  );
}

/** Line numbers rendered beside a selectable code paragraph so they aren't copied. */
function LineNumberGutter({
  count,
  startLine,
  fontSize,
  lineHeight,
}: {
  count: number;
  startLine: number;
  fontSize: number;
  lineHeight?: number;
}) {
  const colors = useThemeColors();
  return (
    <View>
      {Array.from({ length: count }, (_, index) => (
        <Text
          key={index}
          style={{
            fontSize,
            color: colors.muted,
            width: 44,
            textAlign: 'right',
            ...(lineHeight ? { height: lineHeight, lineHeight, includeFontPadding: false } : null),
          }}
          className="pr-2 font-mono"
        >
          {startLine + index}
        </Text>
      ))}
    </View>
  );
}

/**
 * Tokenizes once and returns per-line token arrays so a virtualized list can
 * render individual lines without re-highlighting the whole file.
 */
export function useHighlightedLines(code: string, language: Language) {
  const prismTheme = usePrismTheme();
  return useMemo(() => ({ code, language, prismTheme }), [code, language, prismTheme]);
}

/**
 * Maximum rendered line length. Minified files pack megabytes into a single
 * line; feeding those to Prism (regex-heavy) or a single native text node
 * hangs or OOMs the app, so callers cap lines before rendering.
 */
export const MAX_RENDERED_LINE_LENGTH = 2000;

export function truncateLongLines(code: string, maxLength = MAX_RENDERED_LINE_LENGTH) {
  if (code.length <= maxLength) {
    return code;
  }
  return code
    .split('\n')
    .map((line) => (line.length > maxLength ? `${line.slice(0, maxLength)}…` : line))
    .join('\n');
}
