import { inspect } from 'node:util';
import stringify from 'safe-stable-stringify';
import { redactSensitiveData } from './evidence-redaction';

/**
 * Clean text for safe PDF rendering (jsPDF's standard fonts cannot draw
 * invisible/control unicode or smart punctuation).
 */
export function cleanTextForPDF(text: string): string {
  if (!text) return '';

  // Strip invisible/control unicode chars
  const stripped = text
    .replace(/­/g, '')
    .replace(/[​-‏]/g, '')
    .replace(/[‪-‮]/g, '')
    .replace(/[⁠-⁯]/g, '')
    .replace(/﻿/g, '')
    .replace(/�/g, '');

  const replacements: Record<string, string> = {
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '–': '-',
    '—': '-',
    '…': '...',
    ' ': ' ',
    '•': '*',
  };

  let cleaned = stripped;
  for (const [unicode, replacement] of Object.entries(replacements)) {
    cleaned = cleaned.replace(new RegExp(unicode, 'g'), replacement);
  }

  return cleaned;
}

const MAX_INSPECT_DEPTH = 4;

const safeStringify = stringify.configure({
  bigint: true,
  circularValue: '[Circular]',
});

function safeJsonStringify(data: unknown): string | null {
  try {
    return (
      safeStringify(
        data,
        (_key, value) => {
          if (value instanceof Date) {
            return value.toISOString();
          }
          if (value instanceof Error) {
            return {
              name: value.name,
              message: value.message,
              stack: value.stack,
            };
          }
          if (value instanceof Map) {
            return { type: 'Map', entries: Array.from(value.entries()) };
          }
          if (value instanceof Set) {
            return { type: 'Set', values: Array.from(value.values()) };
          }
          if (typeof value === 'function') {
            return `[Function ${value.name || 'anonymous'}]`;
          }
          if (typeof value === 'symbol') {
            return value.toString();
          }
          return value;
        },
        2,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** Redacted, pretty-printed JSON (or plain text) for a PDF code block. */
export function formatJsonForPDF(data: unknown): string {
  const redacted = redactSensitiveData(data);

  if (redacted === null || redacted === undefined) return 'N/A';

  if (typeof redacted === 'string') {
    return cleanTextForPDF(redacted);
  }

  if (typeof redacted === 'number' || typeof redacted === 'boolean') {
    return String(redacted);
  }

  if (typeof redacted === 'bigint') {
    return redacted.toString();
  }

  const json = safeJsonStringify(redacted);
  if (json !== null && json !== undefined) {
    return cleanTextForPDF(json);
  }

  return cleanTextForPDF(
    inspect(redacted, {
      depth: MAX_INSPECT_DEPTH,
      breakLength: 80,
      maxArrayLength: 50,
    }),
  );
}
