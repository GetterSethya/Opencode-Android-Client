import { normalizeTokens, Prism, themes, type Language, type PrismTheme } from 'prism-react-renderer';
import { useMemo } from 'react';
import { Text, View, type TextStyle } from 'react-native';

import { useAdaptiveRenderMode } from '@/chat/adaptive-render';
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

export type HighlightedToken = {
  content: string;
  empty?: boolean;
  style: TextStyle;
};

// Map of theme -> cache of (language:types -> resolved TextStyle)
const themeStyleCache = new Map<PrismTheme, Map<string, TextStyle>>();

function getThemeStyleMap(theme: PrismTheme): Map<string, TextStyle> {
  let map = themeStyleCache.get(theme);
  if (!map) {
    map = new Map();
    themeStyleCache.set(theme, map);
  }
  return map;
}

function resolveTokenStyle(
  types: string[],
  theme: PrismTheme,
  language: string,
  fallbackColor: string,
): TextStyle {
  const styleMap = getThemeStyleMap(theme);
  const cacheKey = `${language}:${types.join(' ')}`;
  const cached = styleMap.get(cacheKey);
  if (cached) {
    return cached;
  }

  let color: string | undefined;
  let fontStyle: TextStyle['fontStyle'];
  let fontWeight: TextStyle['fontWeight'];

  for (const styleRule of theme.styles) {
    if (styleRule.languages && !styleRule.languages.includes(language as any)) {
      continue;
    }
    const hasMatch = styleRule.types.some((t) => types.includes(t));
    if (hasMatch) {
      if (styleRule.style.color) {
        color = styleRule.style.color;
      }
      if (styleRule.style.fontStyle) {
        fontStyle = styleRule.style.fontStyle as TextStyle['fontStyle'];
      }
      if (styleRule.style.fontWeight) {
        fontWeight = styleRule.style.fontWeight as TextStyle['fontWeight'];
      }
    }
  }

  const result: TextStyle = {
    color: color ?? fallbackColor,
    ...(fontStyle ? { fontStyle } : null),
    ...(fontWeight ? { fontWeight } : null),
  };

  styleMap.set(cacheKey, result);
  return result;
}

// Bounded LRU cache for tokenized lines: max 250 items
const MAX_TOKEN_CACHE_SIZE = 250;
const tokenizedLinesCache = new Map<string, HighlightedToken[][]>();

export function getHighlightedTokens(
  code: string,
  language: Language,
  theme: PrismTheme,
  fallbackColor: string,
): HighlightedToken[][] {
  const isDark = theme === themes.vsDark;
  const cacheKey = `${isDark ? 'd' : 'l'}:${language}:${code}`;
  const existing = tokenizedLinesCache.get(cacheKey);
  if (existing) {
    tokenizedLinesCache.delete(cacheKey);
    tokenizedLinesCache.set(cacheKey, existing);
    return existing;
  }

  const grammar = (Prism.languages as Record<string, any>)[language] ?? Prism.languages.javascript;
  let lines: HighlightedToken[][];

  if (!grammar) {
    const rawLines = code.split('\n');
    const defaultStyle: TextStyle = { color: fallbackColor };
    lines = rawLines.map((line) => [{ content: line.length > 0 ? line : ' ', style: defaultStyle }]);
  } else {
    const rawTokens = Prism.tokenize(code, grammar);
    const normalized = normalizeTokens(rawTokens);
    lines = normalized.map((line) => {
      const merged: HighlightedToken[] = [];
      for (let i = 0; i < line.length; i++) {
        const token = line[i];
        if (token.empty) {
          continue;
        }
        const style = resolveTokenStyle(token.types, theme, language, fallbackColor);
        if (
          merged.length > 0 &&
          merged[merged.length - 1].style.color === style.color &&
          merged[merged.length - 1].style.fontStyle === style.fontStyle &&
          merged[merged.length - 1].style.fontWeight === style.fontWeight
        ) {
          merged[merged.length - 1].content += token.content;
        } else {
          merged.push({ content: token.content, style });
        }
      }
      return merged;
    });
  }

  if (tokenizedLinesCache.size >= MAX_TOKEN_CACHE_SIZE) {
    const oldestKey = tokenizedLinesCache.keys().next().value;
    if (oldestKey !== undefined) {
      tokenizedLinesCache.delete(oldestKey);
    }
  }

  tokenizedLinesCache.set(cacheKey, lines);
  return lines;
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
  const renderMode = useAdaptiveRenderMode();

  // Fast path used while the surrounding list is flinging: skip Prism entirely
  // and paint the raw lines. Same layout and line metrics as the highlighted
  // version, so heights do not shift when it swaps back.
  if (renderMode === 'light') {
    const lines = code.split('\n');
    if (selectable) {
      return (
        <View className="flex-row">
          {showLineNumbers ? (
            <LineNumberGutter
              count={lines.length}
              startLine={startLine}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          ) : null}
          <Text
            selectable
            style={{
              fontSize,
              color: colors.foreground,
              ...(lineHeight ? { lineHeight, includeFontPadding: false } : null),
            }}
            className="font-mono"
          >
            {code}
          </Text>
        </View>
      );
    }
    return (
      <View>
        {lines.map((line, lineIndex) => (
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
              style={{ fontSize, color: colors.foreground }}
              className="font-mono"
            >
              {line.length > 0 ? line : ' '}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  const tokens = getHighlightedTokens(code, language, prismTheme, colors.foreground);

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
              {line.map((token, tokenIndex) => (
                <Text key={tokenIndex} style={token.style} className="font-mono">
                  {token.content}
                </Text>
              ))}
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
                <Text key={tokenIndex} style={token.style} className="font-mono">
                  {token.content}
                </Text>
              ))
            )}
          </Text>
        </View>
      ))}
    </View>
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
  const colors = useThemeColors();
  return useMemo(
    () => getHighlightedTokens(code, language, prismTheme, colors.foreground),
    [code, language, prismTheme, colors.foreground],
  );
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
