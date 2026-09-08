"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Download, Plus, Trash2 } from "lucide-react";
import type { TavernStatusBarConfig } from "@/lib/settings-types";

const inputClass = "w-full rounded-xl border border-[var(--c-input-border)] bg-[var(--c-input)] px-3 py-2 ts-10";
const areaClass = `${inputClass} resize-y leading-relaxed`;
const cardClass = "rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3 shadow-sm";

type NativeScript = Record<string, any>;

type Props = {
  resource: TavernStatusBarConfig;
  onChange: (updates: Partial<TavernStatusBarConfig>) => void;
  onDelete?: () => void;
  onExport?: () => void;
};

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1.5"><span className="ts-9 font-bold opacity-60">{label}</span>{children}{hint && <span className="block ts-9 opacity-45">{hint}</span>}</label>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!value)} className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 ts-9 ${value ? "bg-[var(--c-text)] text-[var(--c-page-body-bg)]" : ""}`}><span className={`h-2 w-2 rounded-full ${value ? "bg-current" : "border border-current opacity-50"}`} />{label}</button>;
}
function NumberField({ label, value, onChange }: { label: string; value: any; onChange: (v: number) => void }) {
  return <Field label={label}><input type="number" className={inputClass} value={value ?? ""} onChange={e => onChange(Number(e.target.value || 0))} /></Field>;
}
function TagsField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string[]) => void }) {
  const list = Array.isArray(value) ? value.map(String) : [];
  return <Field label={label} hint="多个值用逗号分隔"><input className={inputClass} value={list.join(", ")} onChange={e => onChange(e.target.value.split(",").map(x => x.trim()).filter(Boolean))} /></Field>;
}

function ScriptEditor({ script, index, onChange, onDelete }: { script: NativeScript; index: number; onChange: (s: NativeScript) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(index === 0);
  const set = (key: string, value: any) => onChange({ ...script, [key]: value });
  const placement = Array.isArray(script.placement) ? script.placement.map(Number) : [];
  const togglePlacement = (n: number) => set("placement", placement.includes(n) ? placement.filter(x => x !== n) : [...new Set([...placement, n])]);
  const placements = [[1, "user_input"], [2, "ai_output"], [3, "slash_command"], [5, "world_info"], [6, "reasoning"]] as const;
  return <div className={cardClass}>
    <div className="flex items-center gap-2">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(v => !v)}>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        <span className="truncate ts-11 font-black">{index + 1}. {String(script.scriptName || script.id || "Tavern Regex")}</span>
        <span className="rounded-full border px-2 py-0.5 ts-9">{script.disabled ? "disabled" : "enabled"}</span>
      </button>
      <button type="button" onClick={onDelete} className="rounded-full border p-1.5 text-[var(--c-danger)]"><Trash2 size={14} /></button>
    </div>
    {open && <div className="mt-3 grid gap-3">
      <div className="grid grid-cols-2 gap-2"><Field label="scriptName"><input className={inputClass} value={String(script.scriptName ?? "")} onChange={e => set("scriptName", e.target.value)} /></Field><Field label="id"><input className={inputClass} value={String(script.id ?? "")} onChange={e => set("id", e.target.value)} /></Field></div>
      <Field label="findRegex"><textarea className={areaClass} rows={3} value={String(script.findRegex ?? "")} onChange={e => set("findRegex", e.target.value)} /></Field>
      <Field label="replaceString"><textarea className={areaClass} rows={3} value={String(script.replaceString ?? "")} onChange={e => set("replaceString", e.target.value)} /></Field>
      <TagsField label="trimStrings" value={script.trimStrings} onChange={v => set("trimStrings", v)} />
      <div className="rounded-xl border p-2"><div className="mb-2 ts-9 font-bold opacity-60">Tavern placement / 来源</div><div className="flex flex-wrap gap-2">{placements.map(([n, label]) => <Toggle key={n} label={`${n} · ${label}`} value={placement.includes(n)} onChange={() => togglePlacement(n)} />)}</div></div>
      <div className="flex flex-wrap gap-2 rounded-xl border p-2"><Toggle label="disabled" value={!!script.disabled} onChange={v => set("disabled", v)} /><Toggle label="markdownOnly" value={!!script.markdownOnly} onChange={v => set("markdownOnly", v)} /><Toggle label="promptOnly" value={!!script.promptOnly} onChange={v => set("promptOnly", v)} /><Toggle label="runOnEdit" value={!!script.runOnEdit} onChange={v => set("runOnEdit", v)} /></div>
      <div className="grid grid-cols-2 gap-2"><NumberField label="substituteRegex" value={script.substituteRegex} onChange={v => set("substituteRegex", v)} /><NumberField label="minDepth" value={script.minDepth} onChange={v => set("minDepth", v)} /><NumberField label="maxDepth" value={script.maxDepth} onChange={v => set("maxDepth", v)} /></div>
    </div>}
  </div>;
}

function pretty(value: unknown) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function TavernStatusBarEditor({ resource, onChange, onDelete, onExport }: Props) {
  const [tab, setTab] = useState<"overview" | "template" | "regex" | "advanced">("overview");
  const [advanced, setAdvanced] = useState(pretty(resource.tavernNative?.raw ?? resource.raw));
  const scripts = Array.isArray(resource.regexScripts) ? resource.regexScripts : [];

  const updateScript = (i: number, script: NativeScript) => onChange({ regexScripts: scripts.map((x, j) => j === i ? script : x) });
  const addScript = () => onChange({ regexScripts: [...scripts, { id: `status_regex_${Date.now()}`, scriptName: "New Tavern Regex", findRegex: "", replaceString: "", placement: [2], disabled: false }] });

  return <div className="flex flex-col gap-3 pb-6">
    <div className="rounded-3xl border-2 border-[var(--c-text)]/15 bg-black/[.02] p-3 dark:bg-white/[.02]">
      <div className="mb-3 flex items-start justify-between gap-3"><div><div className="ts-9 font-black tracking-[.16em] opacity-55">TAVERN STATUS BAR RUNTIME</div><div className="mt-1 ts-16 font-black">酒馆状态栏控制台</div><div className="mt-1 ts-10 opacity-60">按 Tavern 原生语义编辑；未知字段保留在原生 JSON 中，不强制转换成旧状态栏格式。</div></div><div className="flex flex-wrap justify-end gap-1"><span className="rounded-full border px-2 py-1 ts-9">{resource.sourceFormat || "Tavern Native"}</span><span className={`rounded-full border px-2 py-1 ts-9 ${resource.enabled ? "" : "opacity-50"}`}>{resource.enabled ? "运行中" : "已停用"}</span></div></div>
      <div className="flex gap-1 overflow-x-auto pb-1">{[["overview", "概览"], ["template", "状态模板"], ["regex", `Regex ${scripts.length}`], ["advanced", "原生字段"]].map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id as any)} className={`shrink-0 rounded-full border px-3 py-1.5 ts-10 font-semibold ${tab === id ? "bg-[var(--c-text)] text-[var(--c-page-body-bg)]" : "border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)]"}`}>{label}</button>)}</div>
    </div>

    {tab === "overview" && <div className={cardClass}><div className="grid gap-3"><Field label="Tavern status bar name"><input className={inputClass} value={resource.name} onChange={e => onChange({ name: e.target.value })} /></Field><Field label="description"><textarea className={areaClass} rows={3} value={resource.description || ""} onChange={e => onChange({ description: e.target.value })} /></Field><div className="flex flex-wrap gap-2"><Toggle label="enabled" value={resource.enabled} onChange={v => onChange({ enabled: v })} /></div><div className="grid grid-cols-2 gap-2"><div className="rounded-xl border p-2 ts-9"><div className="opacity-55">native spec</div><b>{resource.sourceFormat || "—"}</b></div><div className="rounded-xl border p-2 ts-9"><div className="opacity-55">regex scripts</div><b>{scripts.length}</b></div></div></div></div>}

    {tab === "template" && <div className={cardClass}><Field label={resource.templateKey || "status_template"} hint="这是从 Tavern 原生 payload 中识别出的状态模板字段；保存时会写回原来的字段位置。"><textarea className={areaClass} rows={14} value={resource.template || ""} onChange={e => onChange({ template: e.target.value })} /></Field><div className="mt-3 rounded-xl border p-3 ts-9 opacity-65">如果这个状态栏只通过 Regex 生成 UI，而没有独立模板，这里会保持为空；不要为了显示效果强行套用旧模板。</div></div>}

    {tab === "regex" && <div className="grid gap-2">{scripts.map((script, i) => <ScriptEditor key={String(script.id || i)} script={script} index={i} onChange={v => updateScript(i, v)} onDelete={() => onChange({ regexScripts: scripts.filter((_, j) => j !== i) })} />)}<button type="button" className="rounded-2xl border border-dashed p-3 ts-10 font-bold" onClick={addScript}><Plus size={15} className="mr-1 inline" />添加 Tavern Regex Script</button></div>}

    {tab === "advanced" && <div className={cardClass}><Field label="原生 JSON" hint="这里用于查看/直接修正 Tavern 未被结构化编辑器覆盖的字段。保存后仍保留完整原生结构。"><textarea className={`${areaClass} min-h-[420px] font-mono text-[11px]`} value={advanced} onChange={e => setAdvanced(e.target.value)} spellCheck={false} /></Field><div className="mt-2 flex justify-end"><button type="button" className="rounded-xl bg-[var(--c-text)] px-4 py-2 ts-10 font-bold text-[var(--c-page-body-bg)]" onClick={() => { try { const parsed = JSON.parse(advanced); onChange({ raw: parsed, tavernNative: resource.tavernNative ? { ...resource.tavernNative, raw: parsed } : undefined }); } catch { /* keep editor open */ } }}>写回原生 JSON</button></div></div>}

    <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3"><button className="rounded-xl border px-3 py-2 ts-10 font-bold" onClick={() => onChange({ enabled: !resource.enabled })}>{resource.enabled ? "停用运行" : "启用运行"}</button><button className="rounded-xl border px-3 py-2 ts-10" onClick={onExport}><Download size={14} className="mr-1 inline" />导出原生 JSON</button><button className="rounded-xl border px-3 py-2 ts-10 text-[var(--c-danger)]" onClick={onDelete}>删除状态栏</button></div>
  </div>;
}
