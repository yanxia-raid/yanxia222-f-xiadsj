"use client";
import { useEffect, useMemo, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { applyTavernResponseFormat, detectTavernFormatProfile, extractTavernStatus, type TavernCharacterCard } from "@/lib/tavern";
import type { ReactNode } from "react";
import { TavernStatusBar } from "@/components/chat/tavern-status-bar";

type Props = {
  characterId?: string;
  content: string;
  render: (content: string) => ReactNode;
};

function readString(ext: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = ext[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/**
 * Card-owned CSS is intentionally scoped to the current message surface.
 * Executable/script-like CSS capabilities are stripped; this is styling only.
 */
function scopeCardCss(css: string, scope: string) {
  let safe = css
    .replace(/@import[^;]+;?/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/behavior\s*:\s*[^;]+;?/gi, "")
    .replace(/-moz-binding\s*:\s*[^;]+;?/gi, "");

  safe = safe.replace(/([^{}]+)\{([^{}]*)\}/g, (full, selectors: string, body: string) => {
    const s = selectors.trim();
    if (!s || s.startsWith("@") || s.includes("@keyframes")) return full;
    const scoped = s.split(",").map((part: string) => {
      const p = part.trim();
      if (!p) return p;
      if (/^(html|body|:root)$/i.test(p)) return scope;
      return `${scope} ${p}`;
    }).join(", ");
    return `${scoped}{${body}}`;
  });
  return safe;
}

function getCardCss(card: TavernCharacterCard) {
  const ext = (card.data.extensions || {}) as Record<string, unknown>;
  return readString(ext, ["css", "custom_css", "customCss", "style", "styles", "character_css", "characterCss"]);
}

export function TavernAdaptiveMessage({ characterId, content, render }: Props) {
  const [card, setCard] = useState<TavernCharacterCard | null>(null);

  useEffect(() => {
    let alive = true;
    if (!characterId) { setCard(null); return () => { alive = false; }; }
    try {
      const chars = loadCharacters();
      if (!alive) return;
      const found = chars.find((c: any) => c.id === characterId) as any;
      setCard(found?.tavernCard || null);
    } catch {
      if (alive) setCard(null);
    }
    return () => { alive = false; };
  }, [characterId]);

  const adapted = useMemo(() => {
    if (!card) return content;
    return applyTavernResponseFormat(card, content);
  }, [card, content]);

  const parsed = useMemo(() => extractTavernStatus(adapted), [adapted]);

  const style = useMemo(() => {
    if (!card) return "";
    const css = getCardCss(card);
    if (!css) return "";
    const safeId = String(characterId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    return scopeCardCss(css, `[data-tavern-character="${safeId}"]`);
  }, [card, characterId]);

  const profile = card ? detectTavernFormatProfile(card) : null;
  const safeId = String(characterId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");

  return (
    <div
      data-tavern-adaptive="true"
      data-tavern-character={safeId}
      data-tavern-markup={profile?.markup || "plain"}
      data-tavern-structured={profile?.hasStructuredOutput ? "true" : "false"}
      className="tavern-adaptive-message"
    >
      {style ? <style data-tavern-card-style dangerouslySetInnerHTML={{ __html: style }} /> : null}
      {render(parsed.cleanText)}
      {parsed.values.length ? <TavernStatusBar values={parsed.values} /> : null}
    </div>
  );
}
