import type { TavernRegexScript } from './types';

export function applyTavernRegex(input: string, scripts: TavernRegexScript[], stage: 'input' | 'output' = 'output'): string {
  let out = input;
  for (const script of scripts) {
    if (script.disabled || !script.findRegex) continue;
    if (stage === 'input' && script.promptOnly === false) continue;
    try {
      const source = script.findRegex;
      const match = source.match(/^\/(.*)\/([dgimsuvy]*)$/s);
      const re = match ? new RegExp(match[1], match[2]) : new RegExp(source, 'g');
      const replacement = typeof script.replaceString === 'string' ? script.replaceString : '';
      out = out.replace(re, replacement);
      for (const trim of script.trimStrings || []) out = out.replaceAll(trim, '');
    } catch {
      // Preserve the script and skip only malformed runtime regexes.
    }
  }
  return out;
}
