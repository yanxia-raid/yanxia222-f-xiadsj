export type TavernMacroContext = {
  char: string;
  user: string;
  persona?: string;
  time?: Date;
  vars?: Record<string, string | number | boolean | null | undefined>;
};

export function expandTavernMacros(input: string, ctx: TavernMacroContext): string {
  let out = input;
  const now = ctx.time || new Date();
  const vars = ctx.vars || {};
  const values: Record<string, string> = {
    char: ctx.char,
    user: ctx.user,
    persona: ctx.persona || '',
    time: now.toLocaleTimeString(),
    date: now.toLocaleDateString(),
    datetime: now.toLocaleString(),
  };
  out = out.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    if (key in values) return values[key];
    if (key.startsWith('getvar::')) return String(vars[key.slice(8)] ?? '');
    if (key.startsWith('setvar::')) return '';
    return `{{${key}}}`;
  });
  return out;
}
