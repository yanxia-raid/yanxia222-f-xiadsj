export type TavernStatusValue = { key: string; label: string; value: string };

const STATUS_TAGS = ['status', 'state', 'character_status', 'char_status', 'su'];

function parseLines(raw: string): TavernStatusValue[] {
  const values: TavernStatusValue[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    // ST cards often emit compact status records such as
    // [TimeInfo|01:02 AM|(深夜·...)] rather than key:value lines.
    const bracket = trimmed.match(/^\[([^|\]]+)\|([^|\]]*)(?:\|([\s\S]*?))?\]$/);
    if (bracket) {
      const label = bracket[1].trim();
      const first = bracket[2].trim();
      const third = bracket[3] ? bracket[3].trim() : '';
      const value = third ? `${first} ${third}`.trim() : first;
      if (label && value) values.push({ key: label.toLowerCase().replace(/\s+/g, '_'), label, value });
      continue;
    }
    const m = trimmed.match(/^(?:[-*•]\s*)?([^:：=]+?)\s*[:：=]\s*(.+?)\s*$/);
    if (m) values.push({ key: m[1].trim().toLowerCase().replace(/\s+/g, '_'), label: m[1].trim(), value: m[2].trim() });
  }
  return values;
}

export function extractTavernStatus(text: string): { cleanText: string; values: TavernStatusValue[]; raw: string } {
  let cleanText = text;
  const rawBlocks: string[] = [];
  const values: TavernStatusValue[] = [];

  // Use RegExp constructors with escaped backslashes so the character classes
  // really mean any character. This keeps multiline <su> blocks matchable.
  for (const tag of STATUS_TAGS) {
    const re = new RegExp(String.raw`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'gi');
    cleanText = cleanText.replace(re, (_whole, body: string) => {
      const raw = String(body || '').trim();
      if (raw) {
        rawBlocks.push(raw);
        values.push(...parseLines(raw));
      }
      return '';
    });
  }

  cleanText = cleanText.trim();
  if (values.length > 0 || rawBlocks.length > 0) {
    return { cleanText, values, raw: rawBlocks.join('\n\n') };
  }

  // Also accept a bare run of bracket-style status lines. This is useful for
  // cards that use <su> in ST but have already lost that wrapper through a feed formatter.
  const lines = text.split(/\r?\n/);
  const nonEmptyLines = lines.filter(x => x.trim());
  const statusLines = lines.filter(line => /^\s*\[[^|\]]+\|/.test(line));
  if (statusLines.length >= 2 && statusLines.length === nonEmptyLines.length) {
    const raw = statusLines.join('\n');
    return { cleanText: '', values: parseLines(raw), raw };
  }

  return { cleanText: text, values: [], raw: '' };
}
