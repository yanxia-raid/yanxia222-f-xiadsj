import type { TavernCharacterBook, TavernLoreEntry } from './types';

const EXT = (entry: TavernLoreEntry): Record<string, unknown> =>
  entry.extensions && typeof entry.extensions === 'object' ? entry.extensions : {};

function field<T = unknown>(entry: TavernLoreEntry, ...keys: string[]): T | undefined {
  const ext = EXT(entry);
  for (const key of keys) {
    if (entry[key] !== undefined) return entry[key] as T;
    if (ext[key] !== undefined) return ext[key] as T;
  }
  return undefined;
}

function parseRegexKey(key: string, caseSensitive: boolean): RegExp | null {
  const trimmed = key.trim();
  const m = trimmed.match(/^\/(.*)\/([dgimsuvy]*)$/s);
  try {
    if (m) return new RegExp(m[1], m[2] || (caseSensitive ? '' : 'i'));
    return new RegExp(trimmed, caseSensitive ? '' : 'i');
  } catch {
    return null;
  }
}

function matchesKey(text: string, key: string, regex: boolean, caseSensitive: boolean): boolean {
  if (!key) return false;
  if (regex) return parseRegexKey(key, caseSensitive)?.test(text) ?? false;
  return caseSensitive ? text.includes(key) : text.toLocaleLowerCase().includes(key.toLocaleLowerCase());
}

function entryEnabled(entry: TavernLoreEntry) {
  return entry.enabled !== false && entry.disable !== true;
}

function entryKeys(entry: TavernLoreEntry) {
  return Array.isArray(entry.keys) ? entry.keys.map(String).filter(Boolean) : [];
}

function secondaryKeys(entry: TavernLoreEntry) {
  const value = field<unknown>(entry, 'secondary_keys', 'secondaryKeys', 'keysecondary');
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function selectiveLogic(entry: TavernLoreEntry) {
  return Number(field(entry, 'selectiveLogic', 'selective_logic') ?? 0) || 0;
}

function triggers(entry: TavernLoreEntry) {
  const value = field<unknown>(entry, 'triggers', 'trigger');
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function triggerSatisfied(entry: TavernLoreEntry, scanText: string) {
  const list = triggers(entry);
  if (!list.length) return true;
  const cs = isCaseSensitive(entry);
  const regex = isRegex(entry);
  return list.some(k => matchesKey(scanText, k, regex, cs));
}

function isCaseSensitive(entry: TavernLoreEntry) {
  return field<boolean>(entry, 'case_sensitive', 'caseSensitive') === true;
}

function isRegex(entry: TavernLoreEntry) {
  return field<boolean>(entry, 'use_regex', 'useRegex') === true;
}

function isConstant(entry: TavernLoreEntry) {
  return field<boolean>(entry, 'constant') === true;
}

function isSelective(entry: TavernLoreEntry) {
  return field<boolean>(entry, 'selective') !== false;
}

function probability(entry: TavernLoreEntry) {
  const p = Number(field(entry, 'probability', 'triggerProbability'));
  return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 100;
}

function groupName(entry: TavernLoreEntry) {
  const g = field<string>(entry, 'group', 'group_name', 'groupName');
  return typeof g === 'string' && g.trim() ? g.trim() : '';
}

function orderOf(entry: TavernLoreEntry) {
  return Number(field(entry, 'insertion_order', 'order', 'sortOrder') ?? 0) || 0;
}

function score(entry: TavernLoreEntry) {
  return Number(field(entry, 'priority', 'groupWeight', 'group_weight') ?? 0) || 0;
}

function activatedByKeys(entry: TavernLoreEntry, scanText: string) {
  if (isConstant(entry)) return true;
  const keys = entryKeys(entry);
  if (!keys.length) return false;
  const regex = isRegex(entry);
  const cs = isCaseSensitive(entry);
  if (!keys.some(k => matchesKey(scanText, k, regex, cs))) return false;
  const secondary = secondaryKeys(entry);
  if (!secondary.length) return true;
  if (!isSelective(entry)) return true;
  const hits = secondary.map(k => matchesKey(scanText, k, regex, cs));
  switch (selectiveLogic(entry)) {
    case 1: return !hits.every(Boolean);
    case 2: return !hits.some(Boolean);
    case 3: return hits.every(Boolean);
    case 0:
    default: return hits.some(Boolean);
  }
}

function weightedGroupPick(entries: TavernLoreEntry[]): TavernLoreEntry[] {
  const grouped = new Map<string, TavernLoreEntry[]>();
  const standalone: TavernLoreEntry[] = [];
  for (const entry of entries) {
    const group = groupName(entry);
    if (!group) standalone.push(entry);
    else grouped.set(group, [...(grouped.get(group) || []), entry]);
  }
  const picked = [...standalone];
  for (const groupEntries of grouped.values()) {
    const eligible = groupEntries.filter(e => probability(e) > 0);
    if (!eligible.length) continue;
    const total = eligible.reduce((sum, e) => sum + Math.max(1, score(e) || 1), 0);
    let cursor = Math.random() * total;
    let selected = eligible[eligible.length - 1];
    for (const entry of eligible) {
      cursor -= Math.max(1, score(entry) || 1);
      if (cursor <= 0) { selected = entry; break; }
    }
    picked.push(selected);
  }
  return picked;
}

export type TavernLoreActivation = {
  entries: TavernLoreEntry[];
  scanText: string;
  passes: number;
};

/**
 * Character-book activation with the important ST semantics used by V2/V3 cards:
 * scan depth, constant entries, primary/secondary keys, probability, groups and
 * recursive scanning. Unknown entry fields remain untouched on the original card.
 */
export function activateCharacterBookDetailed(
  book: TavernCharacterBook | undefined,
  historyText: string,
): TavernLoreActivation {
  if (!book?.entries?.length) return { entries: [], scanText: historyText, passes: 0 };
  const scanDepth = Math.max(1, Math.floor(Number(book.scan_depth ?? 10) || 10));
  const sourceLines = historyText.split(/\n/);
  const scanText = sourceLines.slice(-scanDepth).join('\n');
  const active = new Map<TavernLoreEntry, true>();
  let workingText = scanText;
  let passes = 0;

  for (; passes < (book.recursive_scanning ? 5 : 1); passes++) {
    const newly = book.entries.filter(entry =>
      entryEnabled(entry) && !active.has(entry) && triggerSatisfied(entry, workingText) && activatedByKeys(entry, workingText) && Math.random() * 100 < probability(entry),
    );
    const picked = weightedGroupPick(newly);
    if (!picked.length) break;
    picked.forEach(e => active.set(e, true));
    if (!book.recursive_scanning) break;
    const recursiveText = picked.map(e => String(e.content || '')).join('\n');
    if (!recursiveText.trim()) break;
    workingText += `\n${recursiveText}`;
  }

  const entries = [...active.keys()].sort((a, b) => {
    const orderDiff = orderOf(a) - orderOf(b);
    return orderDiff || score(b) - score(a);
  });
  return { entries, scanText, passes };
}

export function activateCharacterBook(book: TavernCharacterBook | undefined, scanText: string): TavernLoreEntry[] {
  return activateCharacterBookDetailed(book, scanText).entries;
}

export function renderLoreEntries(entries: TavernLoreEntry[]): string {
  return entries.map(e => String(e.content || '').trim()).filter(Boolean).join('\n\n');
}

export function getTavernLorePosition(entry: TavernLoreEntry): 'before_char' | 'after_char' | 'at_depth' | 'outlet' | 'unknown' {
  const raw = String(field(entry, 'position', 'insertionPosition', 'strategy') ?? '').toLowerCase();
  if (raw === 'before_char' || raw === 'beforechar' || raw === '0') return 'before_char';
  if (raw === 'after_char' || raw === 'afterchar' || raw === '1') return 'after_char';
  if (raw === 'at_depth' || raw === 'depth' || raw === '4') return 'at_depth';
  if (raw === '2' || raw === 'before_an') return 'before_char';
  if (raw === '3' || raw === 'after_an') return 'after_char';
  if (raw === '5' || raw === 'before_em') return 'before_char';
  if (raw === '6' || raw === 'after_em') return 'after_char';
  if (raw === 'outlet' || raw === '7') return 'outlet';
  return 'unknown';
}

export function getTavernLoreDepth(entry: TavernLoreEntry): number {
  return Math.max(0, Number(field(entry, 'depth', 'insertion_depth') ?? 0) || 0);
}

export function getTavernLoreOutlet(entry: TavernLoreEntry): string {
  return String(field(entry, 'outlet', 'outletName') ?? '').trim();
}

/** Runtime activation for standalone/bound World Books. It intentionally mirrors
 * the native fields retained by the adapter instead of collapsing them into the
 * phone's simpler keyword model. */
export function activateBoundWorldBook(
  book: import('../settings-types').WorldBookConfig,
  historyText: string,
  options: { characterName?: string; recursive?: boolean; maxPasses?: number } = {},
): import('../settings-types').WorldBookEntry[] {
  const scanDepth = Math.max(1, Math.floor(Number(book.tavernScanDepth ?? 10) || 10));
  const scanText = historyText.split(/\n/).slice(-scanDepth).join('\n');
  const characterName = String(options.characterName || '').trim();
  const active = new Map<import('../settings-types').WorldBookEntry, true>();
  const maxPasses = Math.max(1, Math.min(32, Number(options.maxPasses ?? book.tavernMaxRecursionSteps ?? (book.tavernRecursiveScanning ? 8 : 1)) || 1));
  let working = scanText;

  const match = (text: string, key: string, regex: boolean, cs: boolean, whole: boolean) => {
    if (!key) return false;
    try {
      if (regex) {
        const m = key.match(/^\/(.*)\/([dgimsuvy]*)$/s);
        const re = m ? new RegExp(m[1], m[2]) : new RegExp(key, cs ? '' : 'i');
        return re.test(text);
      }
      const hay = cs ? text : text.toLocaleLowerCase();
      const needle = cs ? key : key.toLocaleLowerCase();
      if (!whole) return hay.includes(needle);
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
    } catch { return false; }
  };

  const activated = (entry: import('../settings-types').WorldBookEntry, text: string, recursivePass: boolean) => {
    if (entry.disable) return false;
    if (entry.tavernCharacterFilter?.length && characterName) {
      const hit = entry.tavernCharacterFilter.some(x => x.toLocaleLowerCase() === characterName.toLocaleLowerCase());
      if (entry.tavernCharacterFilterExclude ? hit : !hit) return false;
    }
    if (entry.tavernDelayUntilRecursion && !recursivePass) return false;
    if (entry.tavernRecursionLevel != null && Number(entry.tavernRecursionLevel) > 0) {
      const currentLevel = recursivePass ? 1 : 0;
      if (currentLevel !== Number(entry.tavernRecursionLevel)) return false;
    }
    if (entry.tavernTriggers?.length) {
      const triggerHit = entry.tavernTriggers.some(k => match(text, String(k), entry.use_regex, entry.tavernCaseSensitive === true, entry.tavernMatchWholeWords === true));
      if (!triggerHit) return false;
    }
    if (entry.constant) return true;
    const keys = entry.key.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
    if (!keys.length) return false;
    const cs = entry.tavernCaseSensitive === true;
    const whole = entry.tavernMatchWholeWords === true;
    const primary = keys.some(k => match(text, k, entry.use_regex, cs, whole));
    if (!primary) return false;
    const secondary = entry.tavernSecondaryKeys || [];
    if (!secondary.length) return true;
    const hits = secondary.map(k => match(text, k, entry.use_regex, cs, whole));
    switch (Number(entry.tavernSelectiveLogic ?? 0)) {
      case 0: return hits.some(Boolean); // AND ANY
      case 1: return !hits.every(Boolean); // NOT ALL
      case 2: return !hits.some(Boolean); // NOT ANY
      case 3: return hits.every(Boolean); // AND ALL
      default: return hits.some(Boolean);
    }
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    const recursivePass = pass > 0;
    const candidates = book.entries.filter(e => !active.has(e) && activated(e, working, recursivePass));
    const eligible = candidates.filter(e => {
      if (e.tavernExcludeRecursion && recursivePass) return false;
      const p = e.useProbability ? Number(e.probability ?? 100) : 100;
      return p >= 100 || (p > 0 && Math.random() * 100 < p);
    });
    const grouped = new Map<string, typeof eligible>();
    const picked: typeof eligible = [];
    for (const e of eligible) {
      const g = e.tavernGroup?.trim();
      if (!g) picked.push(e); else grouped.set(g, [...(grouped.get(g) || []), e]);
    }
    for (const entries of grouped.values()) {
      const total = entries.reduce((n, e) => n + Math.max(1, Number(e.tavernGroupWeight ?? 100)), 0);
      let cursor = Math.random() * total;
      let selected = entries[entries.length - 1];
      for (const e of entries) { cursor -= Math.max(1, Number(e.tavernGroupWeight ?? 100)); if (cursor <= 0) { selected = e; break; } }
      picked.push(selected);
    }
    if (!picked.length) break;
    for (const e of picked) active.set(e, true);
    if (!(book.tavernRecursiveScanning || options.recursive)) break;
    if (picked.some(e => e.tavernPreventRecursion || e.tavernPreventFurtherRecursion)) break;
    const added = picked.map(e => e.content).filter(Boolean).join('\n');
    if (!added.trim()) break;
    working += `\n${added}`;
  }
  return [...active.keys()].sort((a, b) => Number(a.insertion_order ?? 0) - Number(b.insertion_order ?? 0));
}
