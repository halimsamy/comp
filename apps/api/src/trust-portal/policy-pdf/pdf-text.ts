// Standard PDF fonts (Helvetica) only cover WinAnsi: strip invisible chars and
// emoji, and map the few common symbols outside it to plain equivalents.
const EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

const INVISIBLE = /[­​-‏‪-‮⁠-⁯﻿�]/g;

// Dashes, curly quotes, ©, ° etc. are WinAnsi and print as-is; nbsp becomes a
// space so long lines can wrap.
const REPLACEMENTS: Record<string, string> = {
  '\u00a0': ' ',
  '≥': '>=',
  '≤': '<=',
  '→': '->',
  '←': '<-',
  '↔': '<->',
};

const REPLACEABLE = new RegExp(`[${Object.keys(REPLACEMENTS).join('')}]`, 'g');

export function cleanTextForPdf(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(EMOJI, '')
    .replace(REPLACEABLE, (char) => REPLACEMENTS[char] ?? char);
}
