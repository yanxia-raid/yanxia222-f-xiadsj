import type { Character } from '@/lib/character-types';
import { loadCharacters, saveCharacters } from '@/lib/character-storage';
import type { TavernCharacterCard, TavernLoreEntry, TavernRegexScript } from './types';

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneTavernCard(card: TavernCharacterCard): TavernCharacterCard {
  return clone(card);
}

export function updateTavernCard(character: Character, updater: (card: TavernCharacterCard) => void): Character {
  if (!character.tavernCard) return character;
  const card = clone(character.tavernCard);
  updater(card);
  const raw = clone(card.raw || card.originalRaw || {});
  if (raw && typeof raw === 'object') {
    if ('data' in raw && raw.data && typeof raw.data === 'object') {
      raw.data = clone(card.data);
    } else {
      Object.assign(raw, clone(card.data));
    }
  }
  card.raw = raw;
  // originalRaw is deliberately never replaced by an editor save.
  card.originalRaw = clone(character.tavernCard.originalRaw || character.tavernCard.raw);
  card.importedAt = character.tavernCard.importedAt;
  return { ...character, tavernCard: card, name: card.data.name || character.name, persona: String(card.data.description || character.persona), personality: String(card.data.personality || character.personality || ''), avatar: card.avatar || character.avatar, updatedAt: new Date().toISOString() };
}

export function saveTavernCharacterCard(characterId: string, updater: (card: TavernCharacterCard) => void): Character | null {
  const chars = loadCharacters();
  const index = chars.findIndex(c => c.id === characterId);
  if (index < 0 || !chars[index].tavernCard) return null;
  const next = updateTavernCard(chars[index], updater);
  chars[index] = next;
  saveCharacters(chars);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tavern-card-updated', { detail: { characterId } }));
  return next;
}

export function getRegexScriptsMutable(card: TavernCharacterCard): TavernRegexScript[] {
  const ext = (card.data.extensions ||= {}) as Record<string, unknown>;
  if (!Array.isArray(ext.regex_scripts)) {
    if (Array.isArray(ext.regexScripts)) ext.regex_scripts = ext.regexScripts;
    else ext.regex_scripts = [];
  }
  return ext.regex_scripts as TavernRegexScript[];
}

export function getCharacterBookMutable(card: TavernCharacterCard): NonNullable<TavernCharacterCard['data']['character_book']> {
  const data = card.data;
  if (!data.character_book || typeof data.character_book !== 'object') data.character_book = { entries: [] };
  if (!Array.isArray(data.character_book.entries)) data.character_book.entries = [];
  return data.character_book;
}

export function restoreTavernCardOriginal(character: Character): Character | null {
  if (!character.tavernCard) return null;
  const original = clone(character.tavernCard.originalRaw || character.tavernCard.raw);
  const rawData = original && typeof original === 'object' && original.data && typeof original.data === 'object' ? original.data : original;
  if (!rawData || typeof rawData !== 'object') return null;
  const card = clone(character.tavernCard);
  card.raw = clone(original);
  card.originalRaw = clone(original);
  card.data = clone(rawData) as typeof card.data;
  return { ...character, name: card.data.name || character.name, persona: String(card.data.description || character.persona), personality: String(card.data.personality || ''), tavernCard: card, updatedAt: new Date().toISOString() };
}
