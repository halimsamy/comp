import type { JSONContent } from '@tiptap/react';

/**
 * Normalizes policy content from the database into a clean JSONContent[].
 * Handles two known storage patterns:
 *  - { set: [...] } wrapper from a previous createMany bug
 *  - [{type:"doc", content:[...]}] where a full doc was stored as an array element
 */
export function sanitizePolicyContent(raw: unknown): JSONContent[] {
  if (!raw) return [];

  let arr: unknown[] = Array.isArray(raw) ? raw : [raw];

  if (arr.length === 1 && arr[0] && typeof arr[0] === 'object' && !Array.isArray(arr[0])) {
    const first = arr[0] as Record<string, unknown>;

    // Unwrap { set: [...] } wrapper
    if (Array.isArray(first.set)) {
      arr = first.set;
    }
    // Unwrap [{type:"doc", content:[...]}] — extract the doc's children
    else if (first.type === 'doc' && Array.isArray(first.content)) {
      arr = first.content;
    }
  }

  return arr as JSONContent[];
}
