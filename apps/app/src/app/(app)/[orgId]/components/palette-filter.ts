/**
 * ⌘K ranking (cmdk `filter`): exact code > code prefix > title word-start >
 * keyword word-start > substring > fuzzy. Codes are clause/requirement ids
 * like "A.5.15", "8.3.6" or "6.1.3".
 */

const CODE = /^[a-z]{0,3}\.?\d+(\.\d+)*[a-z]?$/;

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);

/** Tokens that look like a code, with trailing dots trimmed ("A.5.15." → "a.5.15"). */
const codes = (texts: string[]) =>
  texts
    .flatMap(words)
    .map((w) => w.replace(/\.+$/, ''))
    .filter((w) => CODE.test(w));

const startsEachWord = (haystack: string[], needles: string[]) =>
  needles.every((needle) => haystack.some((w) => w.startsWith(needle)));

function isSubsequence(text: string, query: string) {
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i += 1;
    if (i === query.length) return true;
  }
  return false;
}

export function paletteScore(value: string, search: string, keywords: string[] = []): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  const label = value.toLowerCase();
  const queryWords = words(query);

  if (/\d/.test(query) && CODE.test(query)) {
    const itemCodes = codes([value, ...keywords]);
    if (itemCodes.includes(query)) return 1;
    if (itemCodes.some((c) => c.startsWith(query))) return 0.9;
  }
  if (label.startsWith(query)) return 0.85;
  if (queryWords.length > 0 && startsEachWord(words(value), queryWords)) return 0.8;
  const keywordWords = keywords.flatMap(words);
  if (queryWords.length > 0 && startsEachWord(keywordWords, queryWords)) return 0.6;
  if (label.includes(query)) return 0.5;
  if (keywords.some((k) => k.toLowerCase().includes(query))) return 0.3;
  if (query.length >= 3 && isSubsequence(label, query.replace(/\s+/g, ''))) return 0.05;
  return 0;
}
