"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { applyTavernResponseFormat, detectTavernFormatProfile, extractTavernStatus, type TavernCharacterCard } from "@/lib/tavern";
import type { ReactNode } from "react";
import { TavernStatusBar } from "@/components/chat/tavern-status-bar";

type Props = {
  characterId?: string;
  content: string;
  render: (content: string) => ReactNode;
  onActionSelect?: (text: string) => void;
};

function readString(ext: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = ext[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function getCardCss(card: TavernCharacterCard) {
  const ext = (card.data.extensions || {}) as Record<string, unknown>;
  return readString(ext, ["css", "custom_css", "customCss", "style", "styles", "character_css", "characterCss"]);
}

function hasCardHtml(content: string) {
  const s = content.trim();
  if (!s || !/^</.test(s)) return false;
  return /<style\b/i.test(s) || /<!doctype\s+html\b|<html\b|<head\b|<body\b/i.test(s) || /<(?:div|section|article|main|button|details|table|svg)\b/i.test(s);
}

/**
 * Render a character-card-owned HTML surface in a sandboxed iframe.
 * This is deliberately separate from the phone DOM: card CSS cannot style
 * the phone shell, chat bubbles, input bar, or other messages.
 */
function buildCardHtmlDocument(html: string, css: string) {
  const actionBridge = `
<script>(function(){
  try {
    var sendAction=function(text){
      if(text==null) text="";
      window.parent.postMessage({type:"_tavern_card_action", text:String(text)}, "*");
    };
    window.TavernCardBridge={
      sendAction:sendAction,
      appendText:sendAction,
      resize:function(){ if(typeof send === "function") send(); }
    };
    document.addEventListener("click", function(e){
      var t=e.target && e.target.closest ? e.target.closest("[data-action],[data-tavern-action],[data-send]") : null;
      if(t){
        var action=t.getAttribute("data-action") || t.getAttribute("data-tavern-action") || t.getAttribute("data-send") || "";
        if(action){ e.preventDefault(); sendAction(action); }
      }
    }, true);
    var send=function(){
      var b=document.body;
      if(!b) return;
      var h=Math.max(80, Math.ceil(b.scrollHeight || 0), Math.ceil(b.getBoundingClientRect().height || 0));
      window.parent.postMessage({type:"_tavern_card_resize", h:h}, "*");
    };
    window.TavernCardBridge.resize=send;
    window.addEventListener("load", function(){send(); setTimeout(send,80); setTimeout(send,500); setTimeout(send,1500);});
    if(window.ResizeObserver){
      window.addEventListener("DOMContentLoaded", function(){
        if(document.body) new ResizeObserver(function(){send();}).observe(document.body);
      });
    }
    document.addEventListener("toggle", function(){setTimeout(send,50);}, true);
  } catch (_) {}
})();<\/script>`;

  const cssBlock = css ? `<style data-tavern-card-css>${css}</style>` : "";
  const trimmed = html.trim();

  // Full documents are kept intact. We only append the bridge before </body>.
  if (/<!doctype\s+html\b|<html\b|<head\b|<body\b/i.test(trimmed)) {
    let doc = trimmed;
    if (cssBlock) {
      if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, `${cssBlock}</head>`);
      else doc = `${cssBlock}${doc}`;
    }
    if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${actionBridge}</body>`);
    return `${doc}${actionBridge}`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cssBlock}
<style>html,body{margin:0;padding:0;width:100%;min-height:0;background:transparent;}body{box-sizing:border-box;overflow-wrap:anywhere;}</style>
</head><body>${trimmed}${actionBridge}</body></html>`;
}

function TavernCardHtmlFrame({ html, css, onActionSelect }: { html: string; css: string; onActionSelect?: (text: string) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(100);
  const srcDoc = useMemo(() => buildCardHtmlDocument(html, css), [html, css]);

  useEffect(() => setHeight(100), [srcDoc]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      if (e.data.type === "_tavern_card_resize" && Number.isFinite(e.data.h)) {
        setHeight(Math.max(80, Math.min(20000, Math.ceil(Number(e.data.h)))));
      }
      if (e.data.type === "_tavern_card_action" && typeof e.data.text === "string") {
        onActionSelect?.(e.data.text);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onActionSelect]);

  return (
    <div className="tavern-card-html-surface" data-tavern-card-html="true">
      <iframe
        ref={iframeRef}
        className="tavern-card-html-frame"
        title="角色卡自定义界面"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        srcDoc={srcDoc}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ height, width: "100%", border: 0, display: "block", background: "transparent", pointerEvents: "auto", touchAction: "auto" }}
      />
    </div>
  );
}

export function TavernAdaptiveMessage({ characterId, content, render, onActionSelect }: Props) {
  const [card, setCard] = useState<TavernCharacterCard | null>(null);

  useEffect(() => {
    let alive = true;
    const reload = () => {
      if (!characterId) { setCard(null); return; }
      try {
        const chars = loadCharacters();
        if (!alive) return;
        const found = chars.find((c: any) => c.id === characterId) as any;
        setCard(found?.tavernCard || null);
      } catch {
        if (alive) setCard(null);
      }
    };
    reload();
    window.addEventListener('tavern-card-updated', reload);
    return () => { alive = false; window.removeEventListener('tavern-card-updated', reload); };
  }, [characterId]);

  const adapted = useMemo(() => {
    if (!card) return content;
    return applyTavernResponseFormat(card, content, { preserveInteractiveHtml: true });
  }, [card, content]);

  const parsed = useMemo(() => extractTavernStatus(adapted), [adapted]);
  const profile = card ? detectTavernFormatProfile(card) : null;
  const cardCss = useMemo(() => card ? getCardCss(card) : "", [card]);
  const cardUi = hasCardHtml(parsed.cleanText);

  return (
    <div
      data-tavern-adaptive="true"
      data-tavern-character={String(characterId || "unknown")}
      data-tavern-markup={profile?.markup || "plain"}
      data-tavern-structured={profile?.hasStructuredOutput ? "true" : "false"}
      className="tavern-adaptive-message"
    >
      {cardUi ? (
        <TavernCardHtmlFrame html={parsed.cleanText} css={cardCss} onActionSelect={onActionSelect} />
      ) : (
        render(parsed.cleanText)
      )}
      {parsed.values.length ? <TavernStatusBar values={parsed.values} /> : null}
    </div>
  );
}
