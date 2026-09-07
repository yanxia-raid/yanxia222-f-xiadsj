"use client";

import { useMemo, useState } from "react";
import type { Character } from "@/lib/character-types";
import type { TavernCharacterCard, TavernLoreEntry, TavernRegexScript } from "@/lib/tavern/types";
import { detectTavernFormatProfile } from "@/lib/tavern/adaptive";
import { getRegexScripts } from "@/lib/tavern/parser";
import { loadBindingConfig, loadPresets, resolveBinding } from "@/lib/settings-storage";

type Tab = "overview" | "worldbook" | "regex" | "prompt" | "greetings" | "ui" | "preset";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "worldbook", label: "世界书" },
  { id: "regex", label: "正则" },
  { id: "prompt", label: "Prompt" },
  { id: "greetings", label: "开场白" },
  { id: "ui", label: "UI / 状态" },
  { id: "preset", label: "预设" },
];

function extensionObject(card: TavernCharacterCard): Record<string, unknown> {
  return card.data.extensions && typeof card.data.extensions === "object"
    ? card.data.extensions as Record<string, unknown>
    : {};
}

function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-[var(--c-panel-border)] bg-black/[0.035] px-2 py-0.5 ts-10 font-semibold dark:bg-white/[0.04]">{children}</span>;
}

function Section({ title, count, children }: { title: string; count?: number | string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="ts-12 font-black tracking-wide">{title}</div>
        {count !== undefined && <Badge>{count}</Badge>}
      </div>
      {children}
    </section>
  );
}

function EntryCard({ entry, index }: { entry: TavernLoreEntry; index: number }) {
  const [open, setOpen] = useState(false);
  const keys = Array.isArray(entry.keys) ? entry.keys.map(String) : [];
  const secondary = Array.isArray(entry.secondary_keys) ? entry.secondary_keys.map(String) : [];
  const probability = entry.probability == null ? undefined : Number(entry.probability);
  return (
    <div className="rounded-xl border border-[var(--c-panel-border)] bg-black/[0.025] p-3 dark:bg-white/[0.025]">
      <button type="button" className="w-full text-left" onClick={() => setOpen(v => !v)}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 ts-10 font-mono opacity-45">#{index + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {entry.constant && <Badge>常驻</Badge>}
              {entry.enabled === false || entry.disable === true ? <Badge>禁用</Badge> : <Badge>启用</Badge>}
              {entry.selective && <Badge>Selective</Badge>}
              {entry.use_regex && <Badge>Regex Key</Badge>}
              {entry.position != null && <Badge>{String(entry.position)}</Badge>}
            </div>
            <div className="mt-1 ts-11 font-semibold break-words">{keys.length ? keys.join(" · ") : "（无主关键词 / 常驻条目）"}</div>
            {secondary.length > 0 && <div className="mt-1 ts-10 opacity-60 break-words">次关键词：{secondary.join(" · ")}</div>}
          </div>
          <span className="ts-12 opacity-50">{open ? "−" : "+"}</span>
        </div>
      </button>
      {open && (
        <div className="mt-3 border-t border-dashed border-[var(--c-panel-border)] pt-3">
          <div className="grid grid-cols-2 gap-2 ts-10">
            <div>insertion_order：<b>{String(entry.insertion_order ?? entry.order ?? "—")}</b></div>
            <div>priority：<b>{String(entry.priority ?? "—")}</b></div>
            <div>depth：<b>{String(entry.depth ?? "—")}</b></div>
            <div>probability：<b>{probability == null ? "—" : `${probability}%`}</b></div>
            <div>group：<b>{String(entry.group ?? "—")}</b></div>
            <div>case_sensitive：<b>{entry.case_sensitive ? "true" : "false"}</b></div>
            <div>recursive：<b>{entry.recursive ? "true" : "false"}</b></div>
            <div>selective：<b>{entry.selective ? "true" : "false"}</b></div>
          </div>
          <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.045] p-2 ts-10 leading-relaxed dark:bg-white/[0.045]">{String(entry.content || "（空内容）")}</pre>
        </div>
      )}
    </div>
  );
}

function RegexCard({ script, index }: { script: TavernRegexScript; index: number }) {
  const [open, setOpen] = useState(false);
  const placement = Array.isArray(script.placement) ? script.placement.join(", ") : "—";
  return (
    <div className="rounded-xl border border-[var(--c-panel-border)] bg-black/[0.025] p-3 dark:bg-white/[0.025]">
      <button type="button" className="w-full text-left" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-2">
          <span className="ts-10 font-mono opacity-45">#{index + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="ts-11 font-semibold truncate">{String(script.scriptName || script.id || `Regex ${index + 1}`)}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge>placement {placement}</Badge>
              {script.disabled ? <Badge>禁用</Badge> : <Badge>启用</Badge>}
              {script.promptOnly && <Badge>promptOnly</Badge>}
              {script.markdownOnly && <Badge>markdownOnly</Badge>}
            </div>
          </div>
          <span className="ts-12 opacity-50">{open ? "−" : "+"}</span>
        </div>
      </button>
      {open && (
        <div className="mt-3 space-y-2 border-t border-dashed border-[var(--c-panel-border)] pt-3">
          <div className="ts-10"><b>Find</b><pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-black/[0.045] p-2 dark:bg-white/[0.045]">{String(script.findRegex || "")}</pre></div>
          <div className="ts-10"><b>Replace</b><pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-black/[0.045] p-2 dark:bg-white/[0.045]">{String(script.replaceString || "")}</pre></div>
          {Array.isArray(script.trimStrings) && script.trimStrings.length > 0 && <div className="ts-10 opacity-70">trimStrings：{script.trimStrings.map(String).join(" · ")}</div>}
        </div>
      )}
    </div>
  );
}

export function TavernControlPanel({ char }: { char: Character }) {
  const card = char.tavernCard;
  const [tab, setTab] = useState<Tab>("overview");
  const [showRaw, setShowRaw] = useState(false);

  const profile = useMemo(() => card ? detectTavernFormatProfile(card) : null, [card]);
  const scripts = useMemo(() => card ? getRegexScripts(card) : [], [card]);
  const binding = useMemo(() => card ? resolveBinding(loadBindingConfig(), char.id, "chat") : null, [card, char.id]);
  const presets = useMemo(() => loadPresets(), []);

  if (!card) return null;

  const d = card.data;
  const book = d.character_book;
  const ext = extensionObject(card);
  const greetings = [d.first_mes, ...(Array.isArray(d.alternate_greetings) ? d.alternate_greetings : [])].filter(x => typeof x === "string") as string[];
  const presetKeys = ["preset", "preset_name", "presetName", "generation_preset", "generationPreset"].filter(k => k in ext);
  const boundPreset = binding?.presetId ? presets.find(p => p.id === binding.presetId) : null;

  return (
    <div className="mt-4 rounded-3xl border-2 border-[var(--c-text)]/15 bg-black/[0.02] p-3 dark:bg-white/[0.02]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="ts-9 font-black tracking-[0.16em] opacity-55">TAVERN CARD RUNTIME</div>
          <div className="mt-1 ts-16 font-black">卡片专属控制台</div>
          <div className="mt-1 ts-10 opacity-60">不改写卡片原始结构；这里展示它实际携带并参与运行的规则。</div>
        </div>
        <Badge>{card.spec === "chara_card_v3" ? "V3" : card.spec}</Badge>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`shrink-0 rounded-full border px-3 py-1.5 ts-10 font-semibold transition ${tab === t.id ? "bg-[var(--c-text)] text-[var(--c-page-body-bg)]" : "border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)]"}`}>
            {t.label}
            {t.id === "worldbook" && book?.entries?.length ? ` ${book.entries.length}` : ""}
            {t.id === "regex" && scripts.length ? ` ${scripts.length}` : ""}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {tab === "overview" && (
          <>
            <Section title="运行能力">
              <div className="flex flex-wrap gap-1.5">
                <Badge>开场白 {greetings.length}</Badge>
                <Badge>World Book {book?.entries?.length ?? 0}</Badge>
                <Badge>Regex {scripts.length}</Badge>
                <Badge>{profile?.markup || "plain"}</Badge>
                {profile?.hasStructuredOutput && <Badge>Structured Output</Badge>}
                {profile?.customCss && <Badge>Custom CSS</Badge>}
              </div>
            </Section>
            <Section title="卡片元数据">
              <div className="grid grid-cols-2 gap-2 ts-10 leading-relaxed">
                <div>creator：<b>{String(d.creator || "—")}</b></div>
                <div>version：<b>{String(d.character_version || "—")}</b></div>
                <div>spec：<b>{String(card.spec)}</b></div>
                <div>source：<b>{String(card.sourceFormat)}</b></div>
                <div className="col-span-2">tags：<b>{Array.isArray(d.tags) && d.tags.length ? d.tags.join(" · ") : "—"}</b></div>
              </div>
            </Section>
            <Section title="运行时识别到的自定义标签">
              {profile?.tags.length ? <div className="flex flex-wrap gap-1.5">{profile.tags.map(t => <Badge key={t}>{`<${t}>`}</Badge>)}</div> : <div className="ts-10 opacity-60">没有从卡片正文中识别到额外标签。</div>}
            </Section>
          </>
        )}

        {tab === "worldbook" && (
          <>
            <Section title={String(book?.name || "角色自带世界书")} count={book?.entries?.length ?? 0}>
              <div className="ts-10 opacity-65 leading-relaxed">scan_depth：{String(book?.scan_depth ?? "默认")}　token_budget：{String(book?.token_budget ?? "默认")}　recursive_scanning：{book?.recursive_scanning ? "true" : "false"}</div>
            </Section>
            {book?.entries?.length ? book.entries.map((entry, i) => <EntryCard key={String(entry.uid ?? entry.id ?? i)} entry={entry} index={i} />) : <Section title="空世界书"><div className="py-6 text-center ts-11 opacity-50">这张角色卡没有 character_book。</div></Section>}
          </>
        )}

        {tab === "regex" && (
          <>
            <Section title="角色卡 Regex Scripts" count={scripts.length}>
              <div className="ts-10 opacity-65">这些规则属于角色卡 extensions，不会被强制转换成旧的全局 Regex 模板。</div>
            </Section>
            {scripts.length ? scripts.map((script, i) => <RegexCard key={String(script.id ?? script.scriptName ?? i)} script={script} index={i} />) : <Section title="空"><div className="py-6 text-center ts-11 opacity-50">没有检测到 regex_scripts。</div></Section>}
          </>
        )}

        {tab === "prompt" && (
          <>
            {(["system_prompt", "description", "personality", "scenario", "creator_notes", "post_history_instructions", "mes_example"] as const).map(key => (
              <Section key={key} title={key}>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words ts-10 leading-relaxed">{String(d[key] || "（空）")}</pre>
              </Section>
            ))}
            {d.extensions && <Section title="depth_prompt"><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words ts-10 leading-relaxed">{pretty((d.extensions as Record<string, unknown>).depth_prompt || "（未设置）")}</pre></Section>}
          </>
        )}

        {tab === "greetings" && (
          <>
            {greetings.map((g, i) => <Section key={i} title={i === 0 ? "First Message" : `Alternate Greeting ${i}`}><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words ts-10 leading-relaxed">{g}</pre></Section>)}
            {!greetings.length && <Section title="开场白"><div className="py-6 text-center ts-11 opacity-50">没有开场白。</div></Section>}
          </>
        )}

        {tab === "ui" && (
          <>
            <Section title="输出格式">
              <div className="space-y-2 ts-10">
                <div>markup：<b>{profile?.markup}</b></div>
                <div>structured：<b>{profile?.hasStructuredOutput ? "yes" : "no"}</b></div>
                <div>识别标签：<b>{profile?.tags.join(", ") || "—"}</b></div>
                {profile?.outputTemplate && <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.045] p-2 dark:bg-white/[0.045]">{profile.outputTemplate}</pre>}
              </div>
            </Section>
            <Section title="状态模板">
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words ts-10 leading-relaxed">{profile?.statusTemplate || "没有发现显式 status_template；聊天会根据卡片输出结构自适应。"}</pre>
            </Section>
            <Section title="Card CSS">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words ts-10 leading-relaxed">{profile?.customCss || "没有检测到卡片 CSS。"}</pre>
            </Section>
            <Section title="安全说明"><div className="ts-10 leading-relaxed opacity-70">卡片 HTML/CSS 可以渲染；script、事件属性和危险外链不会直接执行。需要 Tavern Helper 的能力会通过兼容层映射到小手机已有的会话能力。</div></Section>
          </>
        )}

        {tab === "preset" && (
          <>
            <Section title="角色卡自带 Preset">
              {presetKeys.length ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words ts-10 leading-relaxed">{pretty(Object.fromEntries(presetKeys.map(k => [k, ext[k]])))}</pre> : <div className="ts-10 leading-relaxed opacity-65">这张 ST 角色卡没有携带完整 Preset。ST Preset 通常是独立资源，而不是角色卡 V3 的标准字段。</div>}
            </Section>
            <Section title="当前小手机聊天绑定的 Preset">
              {boundPreset ? <div><div className="ts-12 font-bold">{boundPreset.name}</div><div className="mt-1 ts-10 opacity-60">这是应用绑定的生成预设，不会覆盖角色卡自己的规则。</div></div> : <div className="ts-10 opacity-60">当前没有为此角色单独绑定聊天 Preset，将使用默认级联设置。</div>}
            </Section>
            <Section title="可用 Preset" count={presets.length}>
              <div className="space-y-1.5">{presets.slice(0, 30).map(p => <div key={p.id} className={`rounded-lg border border-[var(--c-panel-border)] px-3 py-2 ts-10 ${p.id === binding?.presetId ? "font-bold" : "opacity-75"}`}>{p.name}{p.builtIn ? " · Built-in" : ""}</div>)}</div>
            </Section>
          </>
        )}
      </div>

      <div className="mt-3 border-t border-[var(--c-panel-border)] pt-3">
        <button type="button" onClick={() => setShowRaw(v => !v)} className="ts-10 font-semibold underline underline-offset-2">{showRaw ? "收起原始 Card JSON" : "查看原始 Card JSON"}</button>
        {showRaw && <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-black/[0.05] p-3 ts-9 leading-relaxed dark:bg-white/[0.05]">{pretty(card.raw)}</pre>}
      </div>
    </div>
  );
}
