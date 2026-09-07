import type { TavernRegexScript } from './types';

function parseRegex(source: string): RegExp | null {
  try {
    const m = source.match(/^\/(.*)\/([dgimsuvy]*)$/s);
    return m ? new RegExp(m[1], m[2]) : new RegExp(source, 'g');
  } catch { return null; }
}

function shouldRun(script: TavernRegexScript, stage: 'input' | 'output' | 'markdown', placement: number) {
  if (script.disabled || !script.findRegex) return false;
  const placements = Array.isArray(script.placement) ? script.placement.map(Number) : [2];
  if (!placements.includes(placement)) return false;
  if (stage === 'input') return script.promptOnly !== false || script.markdownOnly !== true;
  if (stage === 'markdown') return script.markdownOnly !== false;
  return script.promptOnly !== true || script.markdownOnly !== true;
}

/** Execute card regexes in the same conceptual stages as ST: prompt/input and output/display. */
export function applyTavernRegex(
  input: string,
  scripts: TavernRegexScript[],
  stage: 'input' | 'output' | 'markdown' = 'output',
): string {
  let out = input;
  const placement = stage === 'input' ? 1 : 2;
  for (const script of scripts) {
    if (!shouldRun(script, stage, placement)) continue;
    const re = parseRegex(String(script.findRegex || ''));
    if (!re) continue;
    let replacement = typeof script.replaceString === 'string' ? script.replaceString : '';
    replacement = replacement.replace(/\{\{match\}\}/gi, '$&');
    try {
      out = out.replace(re, replacement);
      for (const trim of script.trimStrings || []) out = out.replaceAll(String(trim), '');
    } catch {
      // Preserve the original text if an individual card regex is malformed.
    }
  }
  return out;
}
