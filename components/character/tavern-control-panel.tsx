"use client";

import { useMemo, useState } from "react";
import type { Character } from "@/lib/character-types";
import type { TavernCharacterCard, TavernLoreEntry, TavernRegexScript } from "@/lib/tavern/types";
import { detectTavernFormatProfile } from "@/lib/tavern/adaptive";
import { getRegexScripts } from "@/lib/tavern/parser";
import { getCharacterBookMutable, getRegexScriptsMutable, saveTavernCharacterCard, restoreTavernCardOriginal } from "@/lib/tavern/editor";
import { loadBindingConfig, loadPresets, resolveBinding } from "@/lib/settings-storage";

type Tab = "overview" | "worldbook" | "regex" | "prompt" | "greetings" | "ui" | "preset";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "概览" }, { id: "worldbook", label: "世界书" }, { id: "regex", label: "正则" },
  { id: "prompt", label: "Prompt" }, { id: "greetings", label: "开场白" }, { id: "ui", label: "UI / 状态" }, { id: "preset", label: "预设" },
];
function ext(card: TavernCharacterCard) { return (card.data.extensions && typeof card.data.extensions === "object" ? card.data.extensions : {}) as Record<string, unknown>; }
function pretty(v: unknown) { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }
function Badge({ children }: { children: React.ReactNode }) { return <span className="inline-flex rounded-full border border-[var(--c-panel-border)] bg-black/[.035] px-2 py-0.5 ts-10 font-semibold dark:bg-white/[.04]">{children}</span>; }
function Section({ title, count, children }: { title: string; count?: number | string; children: React.ReactNode }) { return <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3 shadow-sm"><div className="mb-2 flex items-center justify-between gap-2"><div className="ts-12 font-black">{title}</div>{count !== undefined && <Badge>{count}</Badge>}</div>{children}</section>; }
function TextArea({ value, onChange, rows = 6, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) { return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="w-full resize-y rounded-xl border border-[var(--c-input-border)] bg-[var(--c-input)] px-3 py-2 ts-10 leading-relaxed" />; }
function Input({ value, onChange, type = "text", placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) { return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-[var(--c-input-border)] bg-[var(--c-input)] px-2 py-1.5 ts-10" />; }
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) { return <label className="flex items-center gap-2 ts-10"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />{label}</label>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1"><span className="ts-9 font-bold opacity-60">{label}</span>{children}</label>; }

function EntryEditor({ entry, index, onChange, onDelete }: { entry: TavernLoreEntry; index: number; onChange: (e: TavernLoreEntry) => void; onDelete: () => void }) {
  const set = (key: string, value: unknown) => onChange({ ...entry, [key]: value });
  const num = (key: string, fallback = 0) => entry[key] == null ? fallback : Number(entry[key]);
  return <div className="rounded-xl border border-[var(--c-panel-border)] bg-black/[.02] p-3 dark:bg-white/[.02]">
    <div className="mb-3 flex items-center justify-between"><b className="ts-11">世界书条目 #{index + 1}</b><button className="ts-10 underline" onClick={onDelete}>删除</button></div>
    <div className="grid gap-2">
      <Field label="keys（每行一个关键词）"><TextArea rows={3} value={Array.isArray(entry.keys) ? entry.keys.join("\n") : ""} onChange={v => set("keys", v.split(/\r?\n/).map(x => x.trim()).filter(Boolean))} /></Field>
      <Field label="secondary_keys（每行一个）"><TextArea rows={2} value={Array.isArray(entry.secondary_keys) ? entry.secondary_keys.join("\n") : ""} onChange={v => set("secondary_keys", v.split(/\r?\n/).map(x => x.trim()).filter(Boolean))} /></Field>
      <Field label="content"><TextArea rows={7} value={String(entry.content || "")} onChange={v => set("content", v)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="insertion_order"><Input type="number" value={String(entry.insertion_order ?? entry.order ?? 100)} onChange={v => set("insertion_order", Number(v))} /></Field>
        <Field label="depth"><Input type="number" value={String(entry.depth ?? 0)} onChange={v => set("depth", Number(v))} /></Field>
        <Field label="priority"><Input type="number" value={String(entry.priority ?? 0)} onChange={v => set("priority", Number(v))} /></Field>
        <Field label="probability %"><Input type="number" value={String(num("probability", 100))} onChange={v => set("probability", Number(v))} /></Field>
        <Field label="group"><Input value={String(entry.group || "")} onChange={v => set("group", v)} /></Field>
        <Field label="position"><Input value={String(entry.position ?? "before_char")} onChange={v => set("position", v)} /></Field>
      </div>
      <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--c-panel-border)] p-2">
        <Toggle label="enabled" value={entry.enabled !== false && entry.disable !== true} onChange={v => { const n = { ...entry }; n.enabled = v; n.disable = !v; onChange(n); }} />
        <Toggle label="constant" value={entry.constant === true} onChange={v => set("constant", v)} />
        <Toggle label="selective" value={entry.selective !== false} onChange={v => set("selective", v)} />
        <Toggle label="case_sensitive" value={entry.case_sensitive === true} onChange={v => set("case_sensitive", v)} />
        <Toggle label="use_regex" value={entry.use_regex === true} onChange={v => set("use_regex", v)} />
        <Toggle label="recursive" value={entry.recursive === true} onChange={v => set("recursive", v)} />
      </div>
    </div>
  </div>;
}

function RegexEditor({ script, index, onChange, onDelete }: { script: TavernRegexScript; index: number; onChange: (s: TavernRegexScript) => void; onDelete: () => void }) {
  const set = (key: string, value: unknown) => onChange({ ...script, [key]: value });
  return <div className="rounded-xl border border-[var(--c-panel-border)] bg-black/[.02] p-3 dark:bg-white/[.02]">
    <div className="mb-3 flex items-center justify-between"><b className="ts-11">Regex #{index + 1}</b><button className="ts-10 underline" onClick={onDelete}>删除</button></div>
    <div className="grid gap-2">
      <Field label="scriptName"><Input value={String(script.scriptName || "")} onChange={v => set("scriptName", v)} /></Field>
      <Field label="id"><Input value={String(script.id || "")} onChange={v => set("id", v)} /></Field>
      <Field label="Find Regex"><TextArea rows={3} value={String(script.findRegex || "")} onChange={v => set("findRegex", v)} /></Field>
      <Field label="Replace String"><TextArea rows={3} value={String(script.replaceString || "")} onChange={v => set("replaceString", v)} /></Field>
      <Field label="trimStrings（每行一个）"><TextArea rows={2} value={Array.isArray(script.trimStrings) ? script.trimStrings.join("\n") : ""} onChange={v => set("trimStrings", v.split(/\r?\n/).filter(Boolean))} /></Field>
      <Field label="placement（逗号分隔）"><Input value={Array.isArray(script.placement) ? script.placement.join(", ") : "2"} onChange={v => set("placement", v.split(",").map(x => Number(x.trim())).filter(Number.isFinite))} /></Field>
      <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--c-panel-border)] p-2">
        <Toggle label="disabled" value={script.disabled === true} onChange={v => set("disabled", v)} />
        <Toggle label="promptOnly" value={script.promptOnly === true} onChange={v => set("promptOnly", v)} />
        <Toggle label="markdownOnly" value={script.markdownOnly === true} onChange={v => set("markdownOnly", v)} />
        <Toggle label="runOnEdit" value={script.runOnEdit === true} onChange={v => set("runOnEdit", v)} />
      </div>
    </div>
  </div>;
}

export function TavernControlPanel({ char, onSaved }: { char: Character; onSaved?: (character: Character) => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [showRaw, setShowRaw] = useState(false);
  const [revision, setRevision] = useState(0);
  const card = char.tavernCard;
  const profile = useMemo(() => card ? detectTavernFormatProfile(card) : null, [card, revision]);
  const scripts = useMemo(() => card ? getRegexScripts(card) : [], [card, revision]);
  const binding = useMemo(() => card ? resolveBinding(loadBindingConfig(), char.id, "chat") : null, [card, char.id, revision]);
  const presets = useMemo(() => loadPresets(), [revision]);
  if (!card) return null;
  const d = card.data;
  const book = d.character_book;
  const extension = ext(card);
  const greetings = [String(d.first_mes || ""), ...(Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String) : [])];
  const save = (updater: (c: TavernCharacterCard) => void) => {
    const updated = saveTavernCharacterCard(char.id, updater);
    if (updated) { setRevision(v => v + 1); onSaved?.(updated); }
  };
  const reset = () => {
    const restored = restoreTavernCardOriginal(char);
    if (!restored) return;
    saveTavernCharacterCard(char.id, c => { c.data = restored.tavernCard!.data; c.raw = restored.tavernCard!.raw; });
    onSaved?.(restored); setRevision(v => v + 1);
  };
  const editField = (key: string, value: string) => save(c => { (c.data as Record<string, unknown>)[key] = value; });
  const setGreeting = (index: number, value: string) => save(c => { if (index === 0) c.data.first_mes = value; else { const a = Array.isArray(c.data.alternate_greetings) ? [...c.data.alternate_greetings] : []; a[index - 1] = value; c.data.alternate_greetings = a; } });
  const addGreeting = () => save(c => { c.data.alternate_greetings = [...(Array.isArray(c.data.alternate_greetings) ? c.data.alternate_greetings : []), ""]; });
  const deleteGreeting = (index: number) => save(c => { if (index === 0) c.data.first_mes = ""; else c.data.alternate_greetings = (Array.isArray(c.data.alternate_greetings) ? c.data.alternate_greetings : []).filter((_, i) => i !== index - 1); });
  const bookEntries = book?.entries || [];
  const regexEntries = scripts;
  const cssKey = ["css", "custom_css", "customCss", "style", "styles", "character_css", "characterCss"].find(k => typeof extension[k] === "string") || "css";
  const statusKey = ["status_template", "statusTemplate", "status_format", "statusFormat", "statusBarTemplate", "state_template", "stateTemplate"].find(k => typeof extension[k] === "string") || "status_template";
  const outputKey = ["output_template", "outputTemplate", "response_template", "responseTemplate", "format_template", "formatTemplate"].find(k => typeof extension[k] === "string") || "output_template";
  const promptKey = ["prompt_template", "promptTemplate", "character_prompt_template", "characterPromptTemplate", "system_prompt_template", "systemPromptTemplate"].find(k => typeof extension[k] === "string") || "prompt_template";
  const boundPreset = binding?.presetId ? presets.find(p => p.id === binding.presetId) : null;

  return <div className="mt-4 rounded-3xl border-2 border-[var(--c-text)]/15 bg-black/[.02] p-3 dark:bg-white/[.02]">
    <div className="mb-3 flex items-start justify-between gap-3"><div><div className="ts-9 font-black tracking-[.16em] opacity-55">TAVERN CARD RUNTIME · V10</div><div className="mt-1 ts-16 font-black">卡片专属控制台</div><div className="mt-1 ts-10 opacity-60">现在可以直接编辑并保存到这个角色；未知字段仍保留，运行时读取角色自己的 Card。</div></div><div className="flex gap-1"><Badge>{card.spec}</Badge><button className="rounded-full border px-2 py-1 ts-9" onClick={reset}>恢复导入原始值</button></div></div>
    <div className="flex gap-1 overflow-x-auto pb-1">{tabs.map(t => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`shrink-0 rounded-full border px-3 py-1.5 ts-10 font-semibold ${tab === t.id ? "bg-[var(--c-text)] text-[var(--c-page-body-bg)]" : "border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)]"}`}>{t.label}{t.id === "worldbook" ? ` ${bookEntries.length}` : t.id === "regex" ? ` ${regexEntries.length}` : ""}</button>)}</div>

    <div className="mt-3 space-y-3">
      {tab === "overview" && <><Section title="运行能力"><div className="flex flex-wrap gap-1.5"><Badge>开场白 {greetings.filter(Boolean).length}</Badge><Badge>World Book {bookEntries.length}</Badge><Badge>Regex {regexEntries.length}</Badge><Badge>{profile?.markup || "plain"}</Badge>{profile?.customCss && <Badge>Custom CSS</Badge>}{profile?.hasStructuredOutput && <Badge>Structured Output</Badge>}</div></Section><Section title="卡片元数据"><div className="grid grid-cols-2 gap-2 ts-10"><div>creator：<b>{String(d.creator || "—")}</b></div><div>version：<b>{String(d.character_version || "—")}</b></div><div>source：<b>{card.sourceFormat}</b></div><div>spec：<b>{card.spec}</b></div><div className="col-span-2">tags：<b>{Array.isArray(d.tags) ? d.tags.join(" · ") || "—" : "—"}</b></div></div></Section></>}

      {tab === "worldbook" && <><Section title={String(book?.name || "角色自带世界书")} count={bookEntries.length}><div className="grid grid-cols-2 gap-2"><Field label="scan_depth"><Input type="number" value={String(book?.scan_depth ?? 10)} onChange={v => save(c => { getCharacterBookMutable(c).scan_depth = Number(v); })} /></Field><Field label="token_budget"><Input type="number" value={String(book?.token_budget ?? 0)} onChange={v => save(c => { getCharacterBookMutable(c).token_budget = Number(v); })} /></Field></div><div className="mt-2"><Toggle label="recursive_scanning" value={book?.recursive_scanning === true} onChange={v => save(c => { getCharacterBookMutable(c).recursive_scanning = v; })} /></div></Section>{bookEntries.map((e, i) => <EntryEditor key={String(e.uid ?? e.id ?? i)} entry={e} index={i} onChange={n => save(c => { getCharacterBookMutable(c).entries[i] = n; })} onDelete={() => save(c => { getCharacterBookMutable(c).entries.splice(i, 1); })} />)}<button className="w-full rounded-xl border border-dashed p-3 ts-10 font-bold" onClick={() => save(c => { getCharacterBookMutable(c).entries.push({ uid: `v10_${Date.now()}`, keys: [], secondary_keys: [], content: "", enabled: true, selective: true }); })}>＋新增世界书条目</button></>}

      {tab === "regex" && <>{regexEntries.map((s, i) => <RegexEditor key={String(s.id ?? s.scriptName ?? i)} script={s} index={i} onChange={n => save(c => { getRegexScriptsMutable(c)[i] = n; })} onDelete={() => save(c => { getRegexScriptsMutable(c).splice(i, 1); })} />)}<button className="w-full rounded-xl border border-dashed p-3 ts-10 font-bold" onClick={() => save(c => { getRegexScriptsMutable(c).push({ id: `v10_regex_${Date.now()}`, scriptName: "New Regex", findRegex: "", replaceString: "", placement: [2], disabled: false }); })}>＋新增 Regex</button></>}

      {tab === "prompt" && <>{(["system_prompt", "description", "personality", "scenario", "creator_notes", "post_history_instructions", "mes_example"] as const).map(k => <Section key={k} title={k}><TextArea value={String((d as Record<string, unknown>)[k] || "")} onChange={v => editField(k, v)} rows={k === "description" || k === "mes_example" ? 9 : 6} /></Section>)}<Section title="Card Prompt Template"><TextArea value={String(extension[promptKey] || "")} onChange={v => save(c => { const e = (c.data.extensions ||= {}) as Record<string, unknown>; e[promptKey] = v; })} rows={7} /></Section></>}

      {tab === "greetings" && <>{greetings.map((g, i) => <Section key={i} title={i === 0 ? "First Message" : `Alternate Greeting ${i}`}><TextArea value={g} onChange={v => setGreeting(i, v)} rows={8} /><button className="mt-2 ts-10 underline" onClick={() => deleteGreeting(i)}>删除此开场白</button></Section>)}<button className="w-full rounded-xl border border-dashed p-3 ts-10 font-bold" onClick={addGreeting}>＋新增 Alternate Greeting</button></>}

      {tab === "ui" && <><Section title="输出模板"><TextArea value={String(extension[outputKey] || "")} onChange={v => save(c => { const e = (c.data.extensions ||= {}) as Record<string, unknown>; e[outputKey] = v; })} rows={7} /></Section><Section title="状态模板"><TextArea value={String(extension[statusKey] || "")} onChange={v => save(c => { const e = (c.data.extensions ||= {}) as Record<string, unknown>; e[statusKey] = v; })} rows={7} /></Section><Section title="Card CSS"><TextArea value={String(extension[cssKey] || "")} onChange={v => save(c => { const e = (c.data.extensions ||= {}) as Record<string, unknown>; e[cssKey] = v; })} rows={10} /><div className="mt-2 ts-9 opacity-60">CSS/模板与交互 HTML 会保存到角色卡；聊天中的卡片 UI 运行在 sandbox iframe 内，避免污染手机页面。</div></Section><Section title="原始扩展字段"><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words ts-9">{pretty(extension)}</pre></Section></>}

      {tab === "preset" && <><Section title="角色卡 Preset / Extensions"><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words ts-9">{pretty(extension)}</pre></Section><Section title="当前聊天绑定 Preset">{boundPreset ? <div className="ts-11 font-bold">{boundPreset.name}</div> : <div className="ts-10 opacity-60">没有角色专属绑定，继续使用应用现有级联设置。</div>}</Section><Section title="可用 Preset" count={presets.length}><div className="space-y-1">{presets.slice(0, 30).map(p => <div key={p.id} className="rounded-lg border border-[var(--c-panel-border)] px-2 py-1 ts-10">{p.name}{p.builtIn ? " · Built-in" : ""}</div>)}</div></Section></>}
    </div>

    <div className="mt-3 border-t border-[var(--c-panel-border)] pt-3"><button type="button" onClick={() => setShowRaw(v => !v)} className="ts-10 font-semibold underline">{showRaw ? "收起原始 Card JSON" : "查看原始 Card JSON"}</button>{showRaw && <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-black/[.05] p-3 ts-9 leading-relaxed">{pretty(card.raw)}</pre>}</div>
  </div>;
}
