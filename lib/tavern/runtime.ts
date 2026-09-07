import type { Character } from '@/lib/character-types';
import type { RegexConfig, RegexRule, WorldBookConfig, WorldBookEntry } from '@/lib/settings-types';
import type { TavernCharacterCard, TavernRegexScript, TavernLoreEntry } from './types';
import { getRegexScripts } from './parser';

/** Convert an imported ST regex script to this app's native regex shape without dropping unknown fields. */
export function tavernRegexToNative(script: TavernRegexScript, index: number): RegexRule {
  const placement = Array.isArray(script.placement) ? script.placement.filter(v => Number.isFinite(Number(v))).map(Number) : [2];
  return {
    id: String(script.id || `tavern_${index}`),
    scriptName: String(script.scriptName || script.name || `ST Regex ${index + 1}`),
    findRegex: String(script.findRegex || ''),
    replaceString: String(script.replaceString || ''),
    trimStrings: Array.isArray(script.trimStrings) ? script.trimStrings.map(String) : [],
    disabled: Boolean(script.disabled),
    placement,
    markdownOnly: Boolean(script.markdownOnly),
    promptOnly: Boolean(script.promptOnly),
    runOnEdit: Boolean(script.runOnEdit),
    substituteRegex: typeof script.substituteRegex === 'number' ? script.substituteRegex : undefined,
    minDepth: typeof script.minDepth === 'number' ? script.minDepth : undefined,
    maxDepth: typeof script.maxDepth === 'number' ? script.maxDepth : undefined,
  };
}

export function getTavernRegexConfigs(card: TavernCharacterCard): RegexConfig[] {
  const scripts = getRegexScripts(card);
  if (!scripts.length) return [];
  return [{
    id: `tavern:${card.data.name}`,
    name: `${card.data.name} · ST Regex`,
    description: 'Imported from SillyTavern character card extensions.regex_scripts',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rules: scripts.map(tavernRegexToNative),
  }];
}

function toNativeEntry(entry: TavernLoreEntry, index: number): WorldBookEntry {
  const keys = Array.isArray(entry.keys) ? entry.keys.map(String) : [];
  const secondary = Array.isArray(entry.secondary_keys) ? entry.secondary_keys.map(String) : [];
  return {
    uid: String(entry.uid ?? `tavern_${index}`),
    key: keys.join(', '),
    content: String(entry.content ?? ''),
    comment: String(entry.comment ?? entry.name ?? ''),
    use_regex: Boolean(entry.use_regex),
    disable: entry.enabled === false || entry.disable === true,
    constant: Boolean(entry.constant),
    position: (entry.position ?? 'before_char') as WorldBookEntry['position'],
    depth: typeof entry.depth === 'number' ? entry.depth : undefined,
    probability: typeof entry.probability === 'number' ? entry.probability : undefined,
    useProbability: typeof entry.probability === 'number',
    role: typeof entry.role === 'number' ? entry.role : undefined,
    insertion_order: Number(entry.insertion_order ?? entry.order ?? entry.priority ?? 50),
    // Preserve ST-specific activation data for the runtime adapter.
    ...(secondary.length ? { tavernSecondaryKeys: secondary } : {}),
    ...(typeof entry.selective === 'boolean' ? { tavernSelective: entry.selective } : {}),
    ...(typeof entry.case_sensitive === 'boolean' ? { tavernCaseSensitive: entry.case_sensitive } : {}),
    ...(entry.extensions && typeof entry.extensions === 'object' ? { tavernExtensions: entry.extensions } : {}),
  } as WorldBookEntry;
}

export function getTavernWorldBookConfig(card: TavernCharacterCard): WorldBookConfig | null {
  const book = card.data.character_book;
  if (!book?.entries?.length) return null;
  return {
    id: `tavern:${card.data.name}`,
    name: String(book.name || `${card.data.name} · ST World Book`),
    description: String(book.description || 'Imported from SillyTavern character_book'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    entries: book.entries.map(toNativeEntry),
  };
}

export function getTavernCard(character: Character): TavernCharacterCard | null {
  const value = (character as Character & { tavernCard?: unknown }).tavernCard;
  if (!value || typeof value !== 'object') return null;
  const card = value as TavernCharacterCard;
  return card.data?.name ? card : null;
}

/**
 * Resolve character-owned ST runtime data without mutating global settings.
 * Regex rules are merged transiently for this character; the character book is
 * activated directly by the prompt assembler so ST secondary-key semantics are kept.
 */
export function mergeTavernRuntimeConfig(
  character: Character,
  worldBooks: WorldBookConfig[],
  regexes: RegexConfig[],
): { worldBooks: WorldBookConfig[]; regexes: RegexConfig[]; card: TavernCharacterCard | null } {
  const card = getTavernCard(character);
  if (!card) return { worldBooks, regexes, card: null };
  const tavernRegex = getTavernRegexConfigs(card);
  const existingRegexIds = new Set(regexes.map(x => x.id));
  // The assembler injects the character-owned book with ST activation semantics.
  // Do not also append it to the native list, otherwise it would be injected twice.
  const mergedBooks = worldBooks;
  const mergedRegexes = tavernRegex.length ? [...regexes, ...tavernRegex.filter(x => !existingRegexIds.has(x.id))] : regexes;
  return { worldBooks: mergedBooks, regexes: mergedRegexes, card };
}

export function buildCharacterOwnedTavernSystem(card: TavernCharacterCard, userName: string): string {
  const d = card.data;
  const parts: string[] = [];
  if (d.system_prompt?.trim()) parts.push(d.system_prompt.trim());
  if (d.description?.trim()) parts.push(`Character Description:\n${d.description.trim()}`);
  if (d.personality?.trim()) parts.push(`Personality:\n${d.personality.trim()}`);
  if (d.scenario?.trim()) parts.push(`Scenario:\n${d.scenario.trim()}`);
  if (d.creator_notes?.trim()) parts.push(`Creator Notes:\n${d.creator_notes.trim()}`);
  if (d.mes_example?.trim()) parts.push(`Example Dialogue:\n${d.mes_example.trim()}`);
  if (!parts.length) return '';
  return parts.join('\n\n').replace(/\{\{char\}\}/gi, d.name).replace(/\{\{user\}\}/gi, userName);
}

export function getTavernGreeting(card: TavernCharacterCard, alternateIndex = 0): string {
  const d = card.data;
  const alternates = Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String).filter(Boolean) : [];
  const candidate = alternateIndex > 0 ? alternates[alternateIndex - 1] : d.first_mes;
  return String(candidate || d.first_mes || '').replace(/\{\{char\}\}/gi, d.name).trim();
}

export function buildCharacterOwnedTavernPostHistory(card: TavernCharacterCard, userName: string): string {
  return String(card.data.post_history_instructions || '')
    .replace(/\{\{char\}\}/gi, card.data.name)
    .replace(/\{\{user\}\}/gi, userName)
    .trim();
}
