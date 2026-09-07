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
 * 角色卡 HTML 直接嵌入聊天 DOM。
 * 不使用 iframe / sandbox，这样卡片本身就是聊天内容的一部分，
 * 不会再出现沙盒白边、独立视口或 iframe 截断问题。
 */
function extractEmbeddedHtml(html: string) {
  const trimmed = html.trim();
  if (!/<html\b|<body\b|<head\b|<!doctype\s+html\b/i.test(trimmed)) {
    return { body: trimmed, headStyles: "", scripts: [] as string[] };
  }

  try {
    const doc = new DOMParser().parseFromString(trimmed, "text/html");
    const headStyles = Array.from(doc.head.querySelectorAll("style")).map((el) => el.textContent || "").join("\n");
    const scripts = Array.from(doc.querySelectorAll("script")).map((el) => el.outerHTML);
    return {
      body: doc.body?.innerHTML || trimmed,
      headStyles,
      scripts,
    };
  } catch {
    return { body: trimmed, headStyles: "", scripts: [] as string[] };
  }
}

function TavernCardDirectEmbed({ html, css, onActionSelect }: { html: string; css: string; onActionSelect?: (text: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(80);
  const source = useMemo(() => extractEmbeddedHtml(html), [html]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    canvas.innerHTML = "";
    canvas.style.transform = "none";
    canvas.style.width = "max-content";
    canvas.style.maxWidth = "none";
    canvas.style.height = "auto";
    canvas.style.minHeight = "0";
    canvas.style.transformOrigin = "top left";

    const style = document.createElement("style");
    style.setAttribute("data-tavern-card-css", "true");
    style.textContent = `${source.headStyles}\n${css}`;
    canvas.appendChild(style);

    const content = document.createElement("div");
    content.setAttribute("data-tavern-card-content", "true");
    content.innerHTML = source.body;
    canvas.appendChild(content);

    // 直接嵌入时浏览器不会因为 innerHTML 自动执行 script，
    // 所以重新创建 script 节点，让原卡片自己的交互代码继续工作。
    const scriptNodes = Array.from(content.querySelectorAll("script"));
    for (const oldScript of scriptNodes) {
      const nextScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        nextScript.setAttribute(attr.name, attr.value);
      }
      nextScript.textContent = oldScript.textContent || "";
      oldScript.replaceWith(nextScript);
    }

    const bridge = (text: string) => onActionSelect?.(String(text ?? ""));
    const clickHandler = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest("[data-action],[data-tavern-action],[data-send]")
        : null;
      if (!target || !host.contains(target)) return;
      const action = target.getAttribute("data-action") || target.getAttribute("data-tavern-action") || target.getAttribute("data-send") || "";
      if (action) {
        event.preventDefault();
        bridge(action);
      }
    };
    host.addEventListener("click", clickHandler, true);

    const fit = () => {
      const available = Math.max(1, host.clientWidth);
      canvas.style.transform = "none";

      // 先取得卡片自己的自然尺寸，再只在超过聊天区域时缩放“卡片本身”。
      // 不改变卡片内部布局，因此不会再出现内容只显示一半的问题。
      const rect = canvas.getBoundingClientRect();
      const naturalWidth = Math.max(1, Math.ceil(rect.width), canvas.scrollWidth);
      const naturalHeight = Math.max(1, Math.ceil(rect.height), canvas.scrollHeight);
      const scale = naturalWidth > available ? Math.min(1, available / naturalWidth) : 1;

      canvas.style.transformOrigin = "top left";
      canvas.style.transform = scale < 0.9999 ? `scale(${scale})` : "none";
      canvas.style.marginBottom = scale < 0.9999 ? `${-(naturalHeight * (1 - scale))}px` : "0px";
      setHeight(Math.max(40, Math.ceil(naturalHeight * scale)));
    };

    const runFit = () => {
      fit();
      requestAnimationFrame(fit);
      setTimeout(fit, 60);
      setTimeout(fit, 250);
      setTimeout(fit, 800);
    };

    runFit();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(runFit) : null;
    observer?.observe(host);
    observer?.observe(canvas);
    window.addEventListener("resize", runFit);

    return () => {
      host.removeEventListener("click", clickHandler, true);
      observer?.disconnect();
      window.removeEventListener("resize", runFit);
    };
  }, [source, css, onActionSelect]);

  return (
    <div
      ref={hostRef}
      className="tavern-card-html-surface"
      data-tavern-card-html="true"
      style={{
        width: "100%",
        maxWidth: "none",
        margin: 0,
        padding: 0,
        border: 0,
        outline: "none",
        background: "transparent",
        overflow: "visible",
        lineHeight: 0,
        minHeight: height,
        height,
        position: "relative",
        zIndex: 2,
      }}
    >
      <div
        ref={canvasRef}
        className="tavern-card-html-canvas"
        style={{
          display: "block",
          width: "max-content",
          maxWidth: "none",
          margin: 0,
          padding: 0,
          border: 0,
          background: "transparent",
          overflow: "visible",
          lineHeight: "normal",
          transformOrigin: "top left",
        }}
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
    window.addEventListener("tavern-card-updated", reload);
    return () => { alive = false; window.removeEventListener("tavern-card-updated", reload); };
  }, [characterId]);

  const adapted = useMemo(() => {
    if (!card) return content;
    return applyTavernResponseFormat(card, content, { preserveInteractiveHtml: true });
  }, [card, content]);

  const parsed = useMemo(() => extractTavernStatus(adapted), [adapted]);
  const profile = card ? detectTavernFormatProfile(card) : null;
  const cardCss = useMemo(() => card ? getCardCss(card) : "", [card]);
  const cardUi = hasCardHtml(parsed.cleanText);

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
    const previousAvatar = avatar ? { display: avatar.style.display } : null;

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
      if (row.dataset.tavernStandaloneCardRow === "true") delete row.dataset.tavernStandaloneCardRow;
      row.style.display = previousRow.display;
      row.style.width = previousRow.width;
      row.style.maxWidth = previousRow.maxWidth;
      row.style.alignItems = previousRow.alignItems;
      row.style.gap = previousRow.gap;
      if (avatar && previousAvatar) avatar.style.display = previousAvatar.display;
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
      style={{ width: "100%", maxWidth: "none", margin: 0, padding: 0, background: "transparent" }}
    >
      {cardUi ? (
        <TavernCardDirectEmbed html={parsed.cleanText} css={cardCss} onActionSelect={onActionSelect} />
      ) : (
        render(parsed.cleanText)
      )}
      {parsed.values.length ? <TavernStatusBar values={parsed.values} /> : null}
    </div>
  );
}
