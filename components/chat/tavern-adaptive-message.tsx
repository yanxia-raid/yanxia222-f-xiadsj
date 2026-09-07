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
  const [layout, setLayout] = useState({ width: 1, height: 80, scale: 1 });
  const source = useMemo(() => extractEmbeddedHtml(html), [html]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    canvas.innerHTML = "";
    canvas.style.transform = "none";
    canvas.style.width = "fit-content";
    canvas.style.maxWidth = "none";
    canvas.style.height = "auto";
    canvas.style.minHeight = "0";
    canvas.style.display = "inline-block";
    canvas.style.transformOrigin = "top center";

    const style = document.createElement("style");
    style.setAttribute("data-tavern-card-css", "true");
    style.textContent = `${source.headStyles}\n${css}`;
    canvas.appendChild(style);

    const content = document.createElement("div");
    content.setAttribute("data-tavern-card-content", "true");
    content.innerHTML = source.body;
    content.style.display = "inline-block";
    content.style.width = "fit-content";
    content.style.maxWidth = "none";
    content.style.minWidth = "0";
    canvas.appendChild(content);

    // innerHTML 不会自动执行 script；重新创建节点以保留角色卡自己的交互。
    const scriptNodes = Array.from(content.querySelectorAll("script"));
    for (const oldScript of scriptNodes) {
      const nextScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) nextScript.setAttribute(attr.name, attr.value);
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

    // 从卡片自身样式里提取少量颜色，只用于外围玻璃底，不修改卡片本身。
    const colorMatches = `${source.headStyles}\n${css}\n${source.body}`.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
    const colors = colorMatches.filter((c) => !/^#(?:fff|ffffff|fff0|ffffff00)$/i.test(c)).slice(0, 3);
    const accent = colors[0] || "rgba(255,255,255,.32)";
    host.style.setProperty("--tavern-card-accent", accent);

    const fit = () => {
      const available = Math.max(1, host.clientWidth);
      canvas.style.transform = "none";

      // 只测量卡片自己的自然尺寸，不把外层 host 的宽度灌给卡片。
      const rect = canvas.getBoundingClientRect();
      const naturalWidth = Math.max(1, Math.ceil(rect.width), canvas.scrollWidth);
      const naturalHeight = Math.max(1, Math.ceil(canvas.getBoundingClientRect().height), canvas.scrollHeight);
      const scale = naturalWidth > available ? Math.min(1, available / naturalWidth) : 1;

      canvas.style.transformOrigin = "top center";
      canvas.style.transform = scale < 0.9999 ? `scale(${scale})` : "none";
      canvas.style.marginLeft = "auto";
      canvas.style.marginRight = "auto";
      canvas.style.marginBottom = scale < 0.9999 ? `${-(naturalHeight * (1 - scale))}px` : "0px";
      setLayout({ width: Math.ceil(naturalWidth * scale), height: Math.max(40, Math.ceil(naturalHeight * scale)), scale });
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
      data-tavern-card-html-host="true"
      style={{
        width: "calc(100% - 104px)",
        maxWidth: "calc(100% - 104px)",
        margin: "0 auto",
        padding: 0,
        border: 0,
        outline: "none",
        background: "transparent",
        overflow: "visible",
        lineHeight: 0,
        minHeight: layout.height + 14,
        height: layout.height + 14,
        position: "relative",
        zIndex: 2,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <div
        className="tavern-card-html-surface"
        data-tavern-card-html="true"
        style={{
          width: Math.max(1, layout.width) + 16,
          maxWidth: "100%",
          margin: 0,
          padding: "7px 8px",
          border: 0,
          outline: "none",
          background: "linear-gradient(135deg, color-mix(in srgb, var(--tavern-card-accent) 18%, transparent), rgba(255,255,255,.07) 50%, color-mix(in srgb, var(--tavern-card-accent) 12%, transparent))",
          backdropFilter: "blur(18px) saturate(140%)",
          WebkitBackdropFilter: "blur(18px) saturate(140%)",
          borderRadius: 18,
          boxSizing: "border-box",
          overflow: "visible",
          lineHeight: 0,
          minHeight: layout.height + 14,
          height: layout.height + 14,
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 6px 20px rgba(0,0,0,.07)",
        }}
      >
        <div
          ref={canvasRef}
          className="tavern-card-html-canvas"
          style={{
            display: "inline-block",
            width: "fit-content",
            maxWidth: "none",
            margin: 0,
            padding: 0,
            border: 0,
            background: "transparent",
            overflow: "visible",
            lineHeight: "normal",
            transformOrigin: "top center",
            flex: "0 0 auto",
          }}
        />
      </div>
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
    const bubble = root?.closest("[class*='chat-bubble-role-']") as HTMLElement | null;
    const avatar = row.querySelector(":scope > .chat-msg-avatar") as HTMLElement | null;

    const snapshot = (el: HTMLElement | null) => el ? {
      display: el.style.display,
      width: el.style.width,
      maxWidth: el.style.maxWidth,
      minWidth: el.style.minWidth,
      flex: el.style.flex,
      margin: el.style.margin,
      padding: el.style.padding,
      background: el.style.background,
      border: el.style.border,
      boxShadow: el.style.boxShadow,
      borderRadius: el.style.borderRadius,
      overflow: el.style.overflow,
    } : null;

    const previousRow = snapshot(row);
    const previousContent = snapshot(contentWrap);
    const previousBubble = snapshot(bubble);
    const previousAvatar = avatar ? { display: avatar.style.display } : null;

    row.dataset.tavernStandaloneCardRow = "true";
    row.style.display = "block";
    row.style.width = "100%";
    row.style.maxWidth = "none";
    row.style.minWidth = "0";
    row.style.margin = "0";
    row.style.padding = "0";

    if (avatar) avatar.style.display = "none";

    if (contentWrap) {
      contentWrap.style.display = "block";
      contentWrap.style.width = "100%";
      contentWrap.style.maxWidth = "none";
      contentWrap.style.minWidth = "0";
      contentWrap.style.flex = "none";
      contentWrap.style.margin = "0";
      contentWrap.style.padding = "0";
    }

    if (bubble) {
      bubble.style.width = "100%";
      bubble.style.maxWidth = "none";
      bubble.style.minWidth = "0";
      bubble.style.margin = "0";
      bubble.style.padding = "0";
      bubble.style.background = "transparent";
      bubble.style.border = "0";
      bubble.style.boxShadow = "none";
      bubble.style.borderRadius = "0";
      bubble.style.overflow = "visible";
    }

    return () => {
      if (row.dataset.tavernStandaloneCardRow === "true") delete row.dataset.tavernStandaloneCardRow;
      const restore = (el: HTMLElement | null, state: ReturnType<typeof snapshot>) => {
        if (!el || !state) return;
        el.style.display = state.display;
        el.style.width = state.width;
        el.style.maxWidth = state.maxWidth;
        el.style.minWidth = state.minWidth;
        el.style.flex = state.flex;
        el.style.margin = state.margin;
        el.style.padding = state.padding;
        el.style.background = state.background;
        el.style.border = state.border;
        el.style.boxShadow = state.boxShadow;
        el.style.borderRadius = state.borderRadius;
        el.style.overflow = state.overflow;
      };
      restore(row, previousRow);
      restore(contentWrap, previousContent);
      restore(bubble, previousBubble);
      if (avatar && previousAvatar) avatar.style.display = previousAvatar.display;
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
