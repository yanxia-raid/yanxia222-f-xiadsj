import type { TavernCharacterCard } from './types';
import { applyTavernRegex } from './regex';
import { getRegexScripts } from './parser';
import { detectTavernFormatProfile } from './adaptive';

/** Strip executable/network-bearing HTML while retaining card-authored visual markup and CSS. */
export function sanitizeTavernHtml(text: string): string {
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/url\s*\(\s*['"]?\s*javascript:[^)]*\)/gi, 'none');
}

export function applyTavernResponseFormat(card: TavernCharacterCard, text: string) {
  let value = applyTavernRegex(text, getRegexScripts(card), 'output');
  const profile = detectTavernFormatProfile(card);
  if (profile.outputTemplate && /{{\s*response\s*}}/i.test(profile.outputTemplate)) {
    value = profile.outputTemplate.replace(/{{\s*response\s*}}/gi, value);
  }
  // A common ST pattern is an inline regex replacement that wraps a complete UI in
  // ```html fences. The fence is transport syntax, not the card's intended UI, so
  // unwrap only explicit html fences; ordinary code blocks remain untouched.
  value = value.replace(/```html\s*([\s\S]*?)\s*```/gi, '$1');
  return sanitizeTavernHtml(value);
}
