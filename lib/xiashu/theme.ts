/** Best-effort CSS scoper for imported Tavern theme custom_css. It keeps the theme
 * inside one story root so a story's beautification cannot style the rest of 夏书. */
export function scopeXiaShuCss(css: string, scope: string): string {
  const source = String(css || "").replace(/\/\*[\s\S]*?\*\//g, m => m);
  const prefix = `[data-xiashu-theme="${scope}"]`;
  const keyPrefix = `xs_${scope.replace(/[^a-zA-Z0-9_-]/g, "_")}_`;
  const keyframes = new Set<string>();
  css.replace(/@(?:-webkit-)?keyframes\s+([\w-]+)/gi, (_, name) => { keyframes.add(String(name)); return _; });
  const renameAnimationNames = (value: string) => {
    let next = value;
    keyframes.forEach(name => {
      const renamed = `${keyPrefix}${name}`;
      next = next.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), renamed);
    });
    return next;
  };

  function splitSelectors(header: string) {
    return header.split(",").map(s => s.trim()).filter(Boolean).map(selector => {
      if (/^(?:from|to|\d+%)$/i.test(selector)) return selector;
      if (/^(html|body|:root)$/i.test(selector)) return prefix;
      if (selector.includes(":root")) return selector.replace(/:root/g, prefix);
      if (selector.startsWith(prefix)) return selector;
      return `${prefix} ${selector}`;
    }).join(", ");
  }

  function walk(text: string): string {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) { out += text.slice(i); break; }
      const header = text.slice(i, open).trim();
      let depth = 1, j = open + 1, quote = "";
      for (; j < text.length && depth; j++) {
        const ch = text[j];
        if (quote) { if (ch === quote && text[j - 1] !== "\\") quote = ""; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      const body = text.slice(open + 1, j - 1);
      if (/^@(media|supports|container|layer|document|scope)\b/i.test(header)) {
        out += `${text.slice(i, open).trim()}{${walk(body)}}`;
      } else if (/^@(keyframes|-webkit-keyframes|font-face|property|page)\b/i.test(header)) {
        out += `${text.slice(i, open).trim()}{${body}}`;
      } else if (header.startsWith("@")) {
        out += `${text.slice(i, open).trim()}{${body}}`;
      } else {
        out += `${splitSelectors(text.slice(i, open))}{${body}}`;
      }
      i = j;
    }
    return out;
  }
  return renameAnimationNames(walk(source));
}

export function extractTavernCustomCss(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const seen = new Set<object>();
  const visit = (value: unknown): string => {
    if (!value || typeof value !== "object" || seen.has(value as object)) return "";
    seen.add(value as object);
    if (Array.isArray(value)) return value.map(visit).find(Boolean) || "";
    const obj = value as Record<string, unknown>;
    for (const key of ["custom_css", "customCss", "css"]) {
      if (typeof obj[key] === "string" && obj[key].trim()) return obj[key].trim();
    }
    for (const key of ["data", "extensions", "theme", "payload"]) {
      const found = visit(obj[key]);
      if (found) return found;
    }
    return "";
  };
  return visit(raw);
}
