export type TavernStatusValue = { key: string; label: string; value: string };

const STATUS_TAGS = ['status', 'state', 'character_status', 'char_status'];

export function extractTavernStatus(text: string): { cleanText: string; values: TavernStatusValue[]; raw: string } {
  for (const tag of STATUS_TAGS) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = text.match(re);
    if (!match) continue;
    const raw = match[1].trim();
    const values: TavernStatusValue[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:[-*•]\s*)?([^:：=]+?)\s*[:：=]\s*(.+?)\s*$/);
      if (m) values.push({ key: m[1].trim().toLowerCase().replace(/\s+/g, '_'), label: m[1].trim(), value: m[2].trim() });
    }
    return { cleanText: text.replace(match[0], '').trim(), values, raw };
  }
  return { cleanText: text, values: [], raw: '' };
}
