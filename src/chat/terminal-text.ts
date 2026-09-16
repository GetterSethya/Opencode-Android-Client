/**
 * Scrollback helpers for the lightweight PTY terminal. The server streams raw
 * VT output; without a full emulator we strip escape sequences and show plain
 * text, which covers line-oriented programs (the fullscreen ones need xterm).
 */

// CSI … final byte, e.g. `\x1b[32m`, `\x1b[2K`, `\x1b[?25l`.
const CSI_PATTERN = new RegExp('\x1b\\[[0-?]*[ -/]*[@-~]', 'g');
// OSC … terminated by BEL or ST, e.g. window titles.
const OSC_PATTERN = new RegExp('\x1b\\][^\x07\x1b]*(?:\x07|\x1b\\\\)', 'g');
// Other C0 controls except \n and \t (kept); \x7f (DEL) is dropped too.
// Written as a code-point filter so no raw control bytes live in the source.
function stripControls(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || (code >= 32 && code !== 127)) {
      out += char;
    }
  }
  return out;
}

/** Strip VT sequences from a raw PTY chunk for plain-text scrollback. */
export function sanitizeTerminalChunk(chunk: string): string {
  return stripControls(
    chunk
      .replace(OSC_PATTERN, '')
      .replace(CSI_PATTERN, '')
      .replace(/\r\n?/g, '\n'),
  );
}

/** Keep only the tail of a scrollback buffer so long outputs stay bounded. */
export function appendCapped(previous: string, next: string, limit = 64 * 1024): string {
  if (!next) {
    return previous;
  }
  const combined = previous + next;
  return combined.length > limit ? combined.slice(combined.length - limit) : combined;
}

/**
 * Parse the binary cursor frame (0x00 + `{"cursor": N}`) the server sends
 * after replay. Returns undefined for anything else. The same shape may
 * arrive as text when the socket delivers binary frames as strings.
 */
export function parseCursorFrame(data: ArrayBuffer): number | undefined {
  const bytes = new Uint8Array(data);
  if (bytes.length < 2 || bytes[0] !== 0) {
    return undefined;
  }
  try {
    const json = new TextDecoder().decode(bytes.subarray(1));
    return cursorFromJson(json);
  } catch {
    return undefined;
  }
}

export function parseCursorText(text: string): number | undefined {
  if (text.charCodeAt(0) !== 0) {
    return undefined;
  }
  try {
    return cursorFromJson(text.slice(1));
  } catch {
    return undefined;
  }
}

function cursorFromJson(json: string): number | undefined {
  const cursor = (JSON.parse(json) as { cursor?: unknown }).cursor;
  return typeof cursor === 'number' && Number.isSafeInteger(cursor) && cursor >= 0
    ? cursor
    : undefined;
}

/** Blob → ArrayBuffer for sockets that deliver binary frames as Blobs. */
export function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read binary frame'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read binary frame'));
    reader.readAsArrayBuffer(blob);
  });
}
