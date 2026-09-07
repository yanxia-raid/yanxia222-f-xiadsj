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
  return secondary.some(k => matchesKey(scanText, k, regex, cs));
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
      entryEnabled(entry) && !active.has(entry) && activatedByKeys(entry, workingText) && Math.random() * 100 < probability(entry),
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
  if (raw === 'outlet') return 'outlet';
  return 'unknown';
}

export function getTavernLoreDepth(entry: TavernLoreEntry): number {
  return Math.max(0, Number(field(entry, 'depth', 'insertion_depth') ?? 0) || 0);
}

export function getTavernLoreOutlet(entry: TavernLoreEntry): string {
  return String(field(entry, 'outlet', 'outletName') ?? '').trim();
}
