import type { Character } from '@/lib/character-types';
import type { RegexConfig, RegexRule, WorldBookConfig, WorldBookEntry } from '@/lib/settings-types';
import type { TavernCharacterCard, TavernRegexScript, TavernLoreEntry } from './types';
import { getRegexScripts } from './parser';
import { readDepthPrompt } from './adaptive';

/** Convert an imported ST regex script to the app's native shape without dropping its source fields. */
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
    createdAt: Date.now(), updatedAt: Date.now(),
    rules: scripts.map(tavernRegexToNative),
  }];
}

function extOf(entry: TavernLoreEntry) {
  return entry.extensions && typeof entry.extensions === 'object' ? entry.extensions : {};
}
function val(entry: TavernLoreEntry, ...keys: string[]) {
  const ext = extOf(entry);
  for (const key of keys) if (entry[key] !== undefined) return entry[key];
  for (const key of keys) if (ext[key] !== undefined) return ext[key];
  return undefined;
}

function toNativeEntry(entry: TavernLoreEntry, index: number): WorldBookEntry {
  const keys = Array.isArray(entry.keys) ? entry.keys.map(String) : [];
  const secondary = Array.isArray(val(entry, 'secondary_keys', 'secondaryKeys', 'keysecondary')) ? (val(entry, 'secondary_keys', 'secondaryKeys', 'keysecondary') as unknown[]).map(String) : [];
  return {
    uid: String(entry.uid ?? `tavern_${index}`),
    key: keys.join(', '),
    content: String(entry.content ?? ''),
    comment: String(entry.comment ?? entry.name ?? ''),
    use_regex: Boolean(val(entry, 'use_regex', 'useRegex')),
    disable: entry.enabled === false || entry.disable === true,
    constant: Boolean(val(entry, 'constant')),
    position: (val(entry, 'position') ?? 'before_char') as WorldBookEntry['position'],
    depth: typeof val(entry, 'depth') === 'number' ? Number(val(entry, 'depth')) : undefined,
    probability: typeof val(entry, 'probability') === 'number' ? Number(val(entry, 'probability')) : undefined,
    useProbability: typeof val(entry, 'probability') === 'number',
    role: typeof val(entry, 'role') === 'number' ? Number(val(entry, 'role')) : undefined,
    insertion_order: Number(val(entry, 'insertion_order', 'order', 'sortOrder', 'priority') ?? 50),
    ...(secondary.length ? { tavernSecondaryKeys: secondary } : {}),
    ...(typeof val(entry, 'selective') === 'boolean' ? { tavernSelective: val(entry, 'selective') } : {}),
    ...(typeof val(entry, 'case_sensitive') === 'boolean' ? { tavernCaseSensitive: val(entry, 'case_sensitive') } : {}),
    ...(typeof val(entry, 'group', 'groupName') === 'string' ? { tavernGroup: val(entry, 'group', 'groupName') } : {}),
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
    createdAt: Date.now(), updatedAt: Date.now(),
    entries: book.entries.map(toNativeEntry),
  };
}

export function getTavernCard(character: Character): TavernCharacterCard | null {
  const value = (character as Character & { tavernCard?: unknown }).tavernCard;
  if (!value || typeof value !== 'object') return null;
  const card = value as TavernCharacterCard;
  return card.data?.name ? card : null;
}

export function mergeTavernRuntimeConfig(character: Character, worldBooks: WorldBookConfig[], regexes: RegexConfig[]) {
  const card = getTavernCard(character);
  if (!card) return { worldBooks, regexes, card: null as TavernCharacterCard | null };

  // Imported cards may now have their embedded resources materialized into the
  // reusable phone libraries and bound through BindingManager. In that case the
  // library copy is already present in `worldBooks` / `regexes`; do not inject a
  // second copy from the card itself. Legacy cards without materialized refs keep
  // the old direct-card fallback so existing saves do not change behavior.
  const materialized = character.tavernResources;
  const hasMaterializedWorldBook = Boolean(materialized?.worldBookId && worldBooks.some(w => w.id === materialized.worldBookId));
  const hasMaterializedRegex = Boolean(materialized?.regexId && regexes.some(r => r.id === materialized.regexId));

  const tavernRegex = hasMaterializedRegex ? [] : getTavernRegexConfigs(card);
  const existingRegexIds = new Set(regexes.map(x => x.id));
  return {
    // Character-owned book is activated directly by the assembler only for legacy
    // cards. Materialized resources are already supplied by the normal binding path.
    worldBooks,
    regexes: tavernRegex.length ? [...regexes, ...tavernRegex.filter(x => !existingRegexIds.has(x.id))] : regexes,
    card,
  };
}

/**
 * Keep the card's own prose authoritative. We intentionally do not invent labels such as
 * "Character Description:" or "Personality:" because many ST cards depend on their own XML/YAML/Markdown layout.
 */
export function buildCharacterOwnedTavernSystem(card: TavernCharacterCard, userName: string): string {
  const d = card.data;
  const ext = (d.extensions || {}) as Record<string, unknown>;
  const custom = typeof ext.system_prompt_template === 'string' ? ext.system_prompt_template : typeof ext.prompt_template === 'string' ? ext.prompt_template : '';
  const expand = (s: string) => s
    .replace(/{{\s*char\s*}}/gi, d.name)
    .replace(/{{\s*user\s*}}/gi, userName);
  if (custom.trim()) return expand(custom.trim());
  return [d.system_prompt, d.description, d.personality, d.scenario, d.creator_notes]
    .map(v => typeof v === 'string' ? expand(v).trim() : '')
    .filter(Boolean)
    .join('\n\n');
}

export function getTavernGreeting(card: TavernCharacterCard, alternateIndex = 0): string {
  const d = card.data;
  const alternates = Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String).filter(Boolean) : [];
  const candidate = alternateIndex > 0 ? alternates[alternateIndex - 1] : d.first_mes;
  return String(candidate || d.first_mes || '')
    .replace(/{{\s*char\s*}}/gi, d.name)
    .trim();
}

export function buildCharacterOwnedTavernPostHistory(card: TavernCharacterCard, userName: string): string {
  return String(card.data.post_history_instructions || '')
    .replace(/{{\s*char\s*}}/gi, card.data.name)
    .replace(/{{\s*user\s*}}/gi, userName)
    .trim();
}

export function getTavernDepthPrompt(card: TavernCharacterCard, userName: string, persona = '') {
  return readDepthPrompt(card, userName, persona);
}

export function getTavernExampleDialogue(card: TavernCharacterCard, userName: string) {
  return String(card.data.mes_example || '')
    .replace(/{{\s*char\s*}}/gi, card.data.name)
    .replace(/{{\s*user\s*}}/gi, userName)
    .trim();
}
