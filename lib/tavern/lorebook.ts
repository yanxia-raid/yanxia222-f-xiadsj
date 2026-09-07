import type { TavernCharacterBook, TavernLoreEntry } from './types';

function matchesKey(text: string, key: string, regex: boolean, caseSensitive: boolean): boolean {
  if (!key) return false;
  if (regex) {
    try { return new RegExp(key.replace(/^\/(.*)\/([a-z]*)$/i, '$1'), key.match(/^\/(.*)\/([a-z]*)$/i)?.[2] || (caseSensitive ? '' : 'i')).test(text); } catch { return false; }
  }
  return caseSensitive ? text.includes(key) : text.toLocaleLowerCase().includes(key.toLocaleLowerCase());
}

export function activateCharacterBook(book: TavernCharacterBook | undefined, scanText: string): TavernLoreEntry[] {
  if (!book?.entries?.length) return [];
  const enabled = book.entries.filter(e => e.enabled !== false && e.disable !== true);
  const activated: TavernLoreEntry[] = [];
  for (const entry of enabled) {
    if (entry.constant) { activated.push(entry); continue; }
    const keys = Array.isArray(entry.keys) ? entry.keys.map(String) : [];
    const secondary = Array.isArray(entry.secondary_keys) ? entry.secondary_keys.map(String) : [];
    const regex = Boolean(entry.use_regex);
    const caseSensitive = Boolean(entry.case_sensitive);
    const primary = keys.some(k => matchesKey(scanText, k, regex, caseSensitive));
    if (!primary) continue;
    if (!secondary.length) { activated.push(entry); continue; }
    const selective = entry.selective !== false;
    const secondaryHit = secondary.some(k => matchesKey(scanText, k, regex, caseSensitive));
    if (!selective || secondaryHit) activated.push(entry);
  }
  return activated.sort((a, b) => Number(a.insertion_order ?? a.order ?? 0) - Number(b.insertion_order ?? b.order ?? 0));
}

export function renderLoreEntries(entries: TavernLoreEntry[]): string {
  return entries.map(e => String(e.content || '').trim()).filter(Boolean).join('\n\n');
}
