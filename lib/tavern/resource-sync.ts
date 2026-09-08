import type { Character } from '@/lib/character-types';
import type { BindingConfig, PresetConfig, RegexConfig, WorldBookConfig, TavernStatusBarConfig } from '@/lib/settings-types';
import {
  loadBindingConfig,
  saveBindingConfig,
  loadPresets,
  savePresets,
  loadWorldBooks,
  saveWorldBooks,
  loadRegexes,
  saveRegexes,
  loadTavernStatusBars,
  saveTavernStatusBars,
} from '@/lib/settings-storage';
import { parseTavernPreset, parseTavernRegex, parseTavernWorldBook } from '@/lib/tavern-native-adapter';
import { getRegexScripts } from './parser';
import { parseTavernStatusBar } from './status-resource';
import type { TavernCharacterCard } from './types';

function stableId(prefix: string, characterId: string): string {
  const safe = characterId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `tavern_card_${prefix}_${safe}`;
}

function clone<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

function findEmbeddedPreset(card: TavernCharacterCard): unknown | null {
  const ext = card.data.extensions && typeof card.data.extensions === 'object'
    ? card.data.extensions as Record<string, unknown>
    : {};
  const directKeys = ['preset', 'preset_data', 'presetData', 'tavern_preset', 'tavernPreset', 'presetSettings'];
  for (const key of directKeys) {
    const value = ext[key];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && (Array.isArray((parsed as any).prompts) || Array.isArray((parsed as any).prompt_order))) return parsed;
      } catch {}
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.prompts) || Array.isArray(obj.prompt_order) || (obj.data && typeof obj.data === 'object')) return value;
    }
  }
  // Some card exporters put the preset-like object under an extension namespace.
  for (const value of Object.values(ext)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.prompts) && Array.isArray(obj.prompt_order)) return obj;
  }
  return null;
}

function replaceOrAppend<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex(x => x.id === item.id);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}

function mergeBinding(config: BindingConfig, characterId: string, refs: { worldBookId?: string; regexId?: string; presetId?: string; statusBarId?: string }): BindingConfig {
  const index = config.characterBindings.findIndex(b => b.characterId === characterId);
  const current = index >= 0 ? config.characterBindings[index] : { characterId, defaults: {}, appOverrides: {} };
  const defaults = { ...current.defaults };
  if (refs.worldBookId) defaults.worldBookIds = Array.from(new Set([...(defaults.worldBookIds || []), refs.worldBookId]));
  if (refs.regexId) defaults.regexIds = Array.from(new Set([...(defaults.regexIds || []), refs.regexId]));
  // Do not overwrite a manually selected preset. A card preset becomes the character default only when none exists.
  if (refs.presetId && !defaults.presetId) defaults.presetId = refs.presetId;
  if (refs.statusBarId && !defaults.statusBarId) defaults.statusBarId = refs.statusBarId;
  const nextBinding = { ...current, defaults };
  const next = { ...config, characterBindings: [...config.characterBindings] };
  if (index >= 0) next.characterBindings[index] = nextBinding;
  else next.characterBindings.push(nextBinding);
  return next;
}

/**
 * Materialize resources embedded in a Tavern character card into the phone's
 * reusable World Book / Regex / Preset libraries, then bind them to this
 * character. The original card remains authoritative for card-local runtime.
 */
export function syncTavernCardResources(character: Character): Character {
  const card = character.tavernCard;
  if (!card) return character;

  let worldBookId = character.tavernResources?.worldBookId;
  let regexId = character.tavernResources?.regexId;
  let presetId = character.tavernResources?.presetId;
  let statusBarId = character.tavernResources?.statusBarId;
  const now = Date.now();

  // 1) Character Book -> reusable World Book library item.
  if (card.data.character_book?.entries?.length) {
    const source = clone(card.data.character_book);
    const parsed = parseTavernWorldBook(JSON.stringify(source), `${card.data.name} · 角色世界书`);
    if (parsed) {
      worldBookId = stableId('worldbook', character.id);
      const item: WorldBookConfig = { ...parsed, id: worldBookId, name: parsed.name || `${card.data.name} · 角色世界书`, createdAt: parsed.createdAt || now, updatedAt: now };
      saveWorldBooks(replaceOrAppend(loadWorldBooks(), item));
    }
  }

  // 2) extensions.regex_scripts -> reusable Regex group.
  const scripts = getRegexScripts(card);
  if (scripts.length) {
    const source = clone(scripts);
    const parsed = parseTavernRegex(JSON.stringify(source), `${card.data.name} · 角色正则`);
    if (parsed) {
      regexId = stableId('regex', character.id);
      const item: RegexConfig = { ...parsed, id: regexId, name: parsed.name || `${card.data.name} · 角色正则`, createdAt: parsed.createdAt || now, updatedAt: now };
      saveRegexes(replaceOrAppend(loadRegexes(), item));
    }
  }

  // 3) Embedded preset-like extension -> reusable Preset library item.
  const presetRaw = findEmbeddedPreset(card);
  if (presetRaw) {
    const parsed = parseTavernPreset(JSON.stringify(presetRaw), `${card.data.name} · 角色预设`);
    if (parsed) {
      presetId = stableId('preset', character.id);
      const item: PresetConfig = { ...parsed, id: presetId, name: parsed.name || `${card.data.name} · 角色预设`, createdAt: parsed.createdAt || now, updatedAt: now };
      savePresets(replaceOrAppend(loadPresets(), item));
    }
  }

  // 4) A card may carry a status-bar template alongside its normal resources.
  // Only materialize an actual status-bar-looking extension; ordinary regex scripts
  // remain in the Regex library and are not duplicated.
  const ext = card.data.extensions && typeof card.data.extensions === "object"
    ? card.data.extensions as Record<string, unknown> : {};
  const statusKeys = ["status_template", "statusTemplate", "status_format", "statusFormat", "statusBarTemplate", "state_template", "stateTemplate"];
  const hasStatusTemplate = statusKeys.some(k => typeof ext[k] === "string" && String(ext[k]).trim());
  if (hasStatusTemplate) {
    const parsed = parseTavernStatusBar(JSON.stringify(card.raw), `${card.data.name} · 状态栏`);
    if (parsed) {
      statusBarId = stableId('statusbar', character.id);
      const item: TavernStatusBarConfig = { ...parsed, id: statusBarId, name: parsed.name || `${card.data.name} · 状态栏`, createdAt: parsed.createdAt || now, updatedAt: now };
      const bars = loadTavernStatusBars();
      const index = bars.findIndex(x => x.id === statusBarId);
      if (index >= 0) bars[index] = item; else bars.push(item);
      saveTavernStatusBars(bars);
    }
  }

  const refs = { worldBookId, regexId, presetId, statusBarId };
  if (typeof window !== 'undefined') {
    if (worldBookId) window.dispatchEvent(new CustomEvent('settings-worldbooks-updated'));
    if (regexId) window.dispatchEvent(new CustomEvent('settings-regexes-updated'));
    if (presetId) window.dispatchEvent(new CustomEvent('settings-presets-updated'));
    if (statusBarId) window.dispatchEvent(new CustomEvent('settings-tavern-statusbars-updated'));
  }
  const binding = loadBindingConfig();
  saveBindingConfig(mergeBinding(binding, character.id, refs));

  return { ...character, tavernResources: refs };
}
