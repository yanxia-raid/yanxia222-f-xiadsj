import type { TavernCharacterCard } from './types';
import { activateCharacterBook, renderLoreEntries } from './lorebook';
import { applyTavernRegex } from './regex';
import { expandTavernMacros } from './macros';
import { getRegexScripts } from './parser';

export type TavernPromptOptions = {
  userName: string;
  persona?: string;
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  statusText?: string;
  maxHistory?: number;
};

export function buildTavernPrompt(card: TavernCharacterCard, options: TavernPromptOptions) {
  const d = card.data;
  const macro = (s: string) => expandTavernMacros(s, { char: d.name, user: options.userName, persona: options.persona });
  const scanText = options.history.map(x => x.content).join('\n');
  const lore = renderLoreEntries(activateCharacterBook(d.character_book, scanText));
  const systemParts = [d.system_prompt, d.description, d.personality && `Personality:\n${d.personality}`, d.scenario && `Scenario:\n${d.scenario}`, lore].filter(Boolean).map(String).map(macro);
  const messages = options.history.slice(-(options.maxHistory || 40)).map(m => ({ role: m.role, content: applyTavernRegex(macro(m.content), getRegexScripts(card), 'input') }));
  if (options.statusText) messages.push({ role: 'system', content: macro(`Current status:\n${options.statusText}`) });
  return {
    system: systemParts.join('\n\n'),
    postHistoryInstructions: macro(d.post_history_instructions || ''),
    messages,
    firstMessage: macro(d.first_mes || ''),
    alternateGreetings: (d.alternate_greetings || []).map(macro),
  };
}
