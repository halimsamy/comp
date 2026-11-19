import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

// The layout is a server component whose imports (built workspace packages,
// next/font) don't load under vitest, so this checks its source instead.
const source = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8');
const providersSource = readFileSync(resolve(__dirname, 'providers.tsx'), 'utf8');

describe('portal root layout', () => {
  it('passes only the user id and email to client Providers, never the session', () => {
    const tag = source.match(/<Providers\b([^>]*)>/);
    expect(tag).not.toBeNull();
    const attrs = [...tag![1].matchAll(/(\w+)=\{/g)].map((m) => m[1]);
    expect(attrs).toEqual(['userId', 'userEmail']);
  });

  it('Providers accepts no session prop', () => {
    expect(providersSource).not.toMatch(/\bsession\s*[?]?:/);
  });
});
