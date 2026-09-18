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
const tokenAstCache = new Map<string, Array<Array<{ types: string[]; content: string; empty?: boolean }>>>();

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

  const astKey = `${language}:${code}`;
  let normalized = tokenAstCache.get(astKey);

  if (!normalized) {
    const grammar = (Prism.languages as Record<string, any>)[language] ?? Prism.languages.javascript;
    if (!grammar) {
      const rawLines = code.split('\n');
      const defaultStyle: TextStyle = { color: fallbackColor };
      const lines = rawLines.map((line) => [{ content: line.length > 0 ? line : ' ', style: defaultStyle }]);
      tokenizedLinesCache.set(cacheKey, lines);
      return lines;
    }
    const rawTokens = Prism.tokenize(code, grammar);
    normalized = normalizeTokens(rawTokens);
    if (tokenAstCache.size >= MAX_TOKEN_CACHE_SIZE) {
      const oldestAstKey = tokenAstCache.keys().next().value;
      if (oldestAstKey !== undefined) tokenAstCache.delete(oldestAstKey);
    }
    tokenAstCache.set(astKey, normalized);
  }

  const lines = normalized.map((line) => {
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
  const colors = useThemeColors();
  const prismTheme = colors.dark ? themes.vsDark : themes.vsLight;
  const renderMode = useAdaptiveRenderMode();

  // Fast path used while the surrounding list is flinging: skip Prism entirely
  // and paint the raw lines. Same layout and line metrics as the highlighted
  // version, so heights do not shift when it swaps back.
  if (renderMode === 'light') {
    const lines = code.split('\n');
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
          selectable={selectable}
          style={{
            fontSize,
            color: colors.foreground,
            flexShrink: 1,
            ...(lineHeight ? { lineHeight, includeFontPadding: false } : null),
          }}
          className="font-mono"
        >
          {code}
        </Text>
      </View>
    );
  }

  const tokens = getHighlightedTokens(code, language, prismTheme, colors.foreground);

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
        selectable={selectable}
        style={{
          fontSize,
          fontFamily: 'monospace',
          flexShrink: 1,
          ...(lineHeight ? { lineHeight, includeFontPadding: false } : null),
        }}
        className="font-mono"
      >
        {tokens.map((line, lineIndex) => (
          <Text key={lineIndex}>
            {line.length === 0 ? (
              ' '
            ) : (
              line.map((token, tokenIndex) => (
                <Text key={tokenIndex} style={token.style}>
                  {token.content}
                </Text>
              ))
            )}
            {lineIndex < tokens.length - 1 ? '\n' : ''}
          </Text>
        ))}
      </Text>
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
  const colors = useThemeColors();
  const prismTheme = colors.dark ? themes.vsDark : themes.vsLight;
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
