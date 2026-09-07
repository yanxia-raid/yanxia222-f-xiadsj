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
    var fitScale=1;
    var naturalWidth=0;
    var naturalHeight=0;
    var fitToViewport=function(){
      try {
        var root=document.documentElement;
        var b=document.body;
        if(!root || !b) return;

        // 保持角色卡原本布局，只缩放整张画布。不要让 iframe 的视口
        // 高度参与卡片高度计算，否则会产生大块空白或内容被截断。
        root.style.margin="0";
        root.style.padding="0";
        root.style.width="max-content";
        root.style.maxWidth="none";
        root.style.height="auto";
        root.style.minHeight="0";
        root.style.overflow="visible";
        root.style.position="relative";
        root.style.left="0";
        root.style.top="0";

        b.style.margin="0";
        b.style.width="max-content";
        b.style.maxWidth="none";
        b.style.minWidth="0";
        b.style.height="auto";
        b.style.minHeight="0";
        b.style.maxHeight="none";
        b.style.overflow="visible";
        b.style.position="relative";
        b.style.left="0";
        b.style.top="0";
        b.style.transformOrigin="top left";
        b.style.overflowWrap="normal";
        b.style.wordBreak="normal";

        b.style.transform="none";
        root.style.transform="none";

        var bodyRect=b.getBoundingClientRect();
        var rootRect=root.getBoundingClientRect();
        naturalWidth=Math.max(1, Math.ceil(bodyRect.width||0), Math.ceil(b.scrollWidth||0), Math.ceil(rootRect.width||0), Math.ceil(root.scrollWidth||0));
        naturalHeight=Math.max(1, Math.ceil(bodyRect.height||0), Math.ceil(b.scrollHeight||0), Math.ceil(rootRect.height||0), Math.ceil(root.scrollHeight||0));

        var viewport=Math.max(1, window.innerWidth||root.clientWidth||1);
        fitScale=naturalWidth>viewport+1 ? Math.min(1, viewport/naturalWidth) : 1;
        b.style.transform=fitScale<0.9999 ? "scale("+fitScale+")" : "none";
      } catch (_) { fitScale=1; }
    };
    var send=function(){
      if(!document.body) return;
      fitToViewport();
      var h=Math.ceil(Math.max(1,naturalHeight)*fitScale);
      window.parent.postMessage({type:"_tavern_card_resize", h:Math.max(40,h)}, "*");
    };
    window.TavernCardBridge.resize=send;
    var schedule=function(){
      send();
      requestAnimationFrame(function(){send();});
      setTimeout(send,80);
      setTimeout(send,250);
      setTimeout(send,600);
      setTimeout(send,1200);
    };
    window.addEventListener("load",schedule);
    window.addEventListener("resize",schedule);
    window.addEventListener("orientationchange",schedule);
    document.addEventListener("DOMContentLoaded",schedule);
    if(window.ResizeObserver){
      try {
        new ResizeObserver(function(){schedule();}).observe(document.documentElement);
        if(document.body) new ResizeObserver(function(){schedule();}).observe(document.body);
      } catch (_) {}
    }
    document.addEventListener("toggle",function(){setTimeout(send,50);},true);
  } catch (_) {}
})();<\/script>`;

  const cssBlock = css ? `<style data-tavern-card-css>${css}</style>` : "";
  const trimmed = html.trim();

  // Full documents are kept intact. We only append the bridge before </body>.
  if (/<!doctype\s+html\b|<html\b|<head\b|<body\b/i.test(trimmed)) {
    let doc = trimmed;
    const responsiveBlock = `<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style data-tavern-responsive>
html{margin:0 !important;padding:0 !important;background:transparent !important;}html,body{margin:0 !important;padding:0 !important;width:max-content !important;max-width:none !important;height:auto !important;min-height:0 !important;overflow:hidden !important;overscroll-behavior:none !important;}
body{box-sizing:border-box !important;position:relative !important;left:0 !important;top:0 !important;}
</style>`;
    if (/<\/head>/i.test(doc)) {
      doc = doc.replace(/<\/head>/i, `${responsiveBlock}${cssBlock}</head>`);
    } else {
      doc = `${responsiveBlock}${cssBlock}${doc}`;
    }
    if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${actionBridge}</body>`);
    return `${doc}${actionBridge}`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cssBlock}
<style>html{margin:0 !important;padding:0 !important;background:transparent !important;}html,body{margin:0 !important;padding:0 !important;background:transparent;overflow:hidden !important;overscroll-behavior:none !important;width:max-content !important;height:auto !important;min-height:0 !important;}body{box-sizing:border-box !important;position:relative !important;left:0 !important;top:0 !important;}</style>
</head><body>${trimmed}${actionBridge}</body></html>`;
}

function TavernCardHtmlFrame({ html, css, onActionSelect }: { html: string; css: string; onActionSelect?: (text: string) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(100);
  const srcDoc = useMemo(() => buildCardHtmlDocument(html, css), [html, css]);

  useEffect(() => setHeight(100), [srcDoc]);

  // 角色卡不再受 70% 聊天气泡宽度限制。
  // 直接读取消息行宽度，并按照原生状态栏的“左右留出约 64px”规则给卡片可用宽度。
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
    <div
      className="tavern-card-html-surface"
      data-tavern-card-html="true"
      style={{
        // 卡片作为“系统消息”独立占一行；宽度参考原生状态栏区域，
        // 不再跟随角色头像后的 70% 气泡宽度。
        margin: "0 0 0 52px",
        padding: 0,
        background: "transparent",
        overflow: "visible",
        width: "calc(100% - 64px)",
        maxWidth: "none",
        lineHeight: 0,
        position: "relative",
        zIndex: 2,
      }}
    >
      <iframe
        ref={iframeRef}
        className="tavern-card-html-frame"
        title="角色卡自定义界面"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        scrolling="no"
        srcDoc={srcDoc}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ height, width: "100%", margin: 0, padding: 0, border: 0, outline: "none", display: "block", background: "transparent", pointerEvents: "auto", overflow: "hidden", verticalAlign: "top" }}
      />
    </div>
  );
}

export function TavernAdaptiveMessage({ characterId, content, render, onActionSelect }: Props) {
  const [card, setCard] = useState<TavernCharacterCard | null>(null);
  const adaptiveRef = useRef<HTMLDivElement>(null);

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

  // HTML 角色卡直接占用“系统消息”式的整行区域：
  // - 隐藏角色头像占位
  // - 去掉 70% 的内容列限制
  // - 内容列改成整行宽度
  // - 卡片自身再按原生状态栏的约 52px 左偏移 / 64px 总留白计算最大宽度
  // 只在当前消息确实是角色卡 HTML 时操作，并且只沿当前消息 DOM 向上查找，
  // 不会影响朋友圈、其他消息或全局 CSS。
  useEffect(() => {
    if (!cardUi) return;

    const root = adaptiveRef.current;
    const row = root?.closest(".chat-msg-wrapper") as HTMLElement | null;
    if (!row) return;

    const contentWrap = root?.closest(".chat-msg-content-wrap") as HTMLElement | null;
    const avatar = row.querySelector(":scope > .chat-msg-avatar") as HTMLElement | null;

    const previousRow = {
      display: row.style.display,
      width: row.style.width,
      maxWidth: row.style.maxWidth,
      alignItems: row.style.alignItems,
      gap: row.style.gap,
    };
    const previousContent = contentWrap ? {
      width: contentWrap.style.width,
      maxWidth: contentWrap.style.maxWidth,
      flex: contentWrap.style.flex,
      minWidth: contentWrap.style.minWidth,
      margin: contentWrap.style.margin,
      padding: contentWrap.style.padding,
    } : null;
    const previousAvatar = avatar ? {
      display: avatar.style.display,
    } : null;

    row.dataset.tavernStandaloneCardRow = "true";
    row.style.display = "block";
    row.style.width = "100%";
    row.style.maxWidth = "none";
    row.style.alignItems = "stretch";
    row.style.gap = "0";

    if (avatar) avatar.style.display = "none";

    if (contentWrap) {
      contentWrap.style.width = "100%";
      contentWrap.style.maxWidth = "none";
      contentWrap.style.flex = "none";
      contentWrap.style.minWidth = "0";
      contentWrap.style.margin = "0";
      contentWrap.style.padding = "0";
    }

    return () => {
      if (row.dataset.tavernStandaloneCardRow === "true") {
        delete row.dataset.tavernStandaloneCardRow;
      }
      row.style.display = previousRow.display;
      row.style.width = previousRow.width;
      row.style.maxWidth = previousRow.maxWidth;
      row.style.alignItems = previousRow.alignItems;
      row.style.gap = previousRow.gap;

      if (avatar && previousAvatar) {
        avatar.style.display = previousAvatar.display;
      }

      if (contentWrap && previousContent) {
        contentWrap.style.width = previousContent.width;
        contentWrap.style.maxWidth = previousContent.maxWidth;
        contentWrap.style.flex = previousContent.flex;
        contentWrap.style.minWidth = previousContent.minWidth;
        contentWrap.style.margin = previousContent.margin;
        contentWrap.style.padding = previousContent.padding;
      }
    };
  }, [cardUi, characterId, parsed.cleanText]);

  return (
    <div
      ref={adaptiveRef}
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
