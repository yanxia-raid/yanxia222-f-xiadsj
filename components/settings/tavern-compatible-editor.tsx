"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Download, Plus, Trash2 } from "lucide-react";
import type { PresetConfig, Prompt, RegexConfig, RegexRule, WorldBookConfig, WorldBookEntry } from "@/lib/settings-types";

type Kind = "preset" | "worldbook" | "regex";
type Resource = PresetConfig | WorldBookConfig | RegexConfig;

type Props = {
  kind: Kind;
  resource: Resource;
  onChange: (updates: Partial<Resource>) => void;
  onDelete?: () => void;
  onExport?: () => void;
};

const inputClass = "w-full rounded-xl border border-[var(--c-input-border)] bg-[var(--c-input)] px-3 py-2 ts-10";
const areaClass = `${inputClass} resize-y leading-relaxed`;
const cardClass = "rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3 shadow-sm";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block space-y-1.5"><span className="ts-9 font-bold opacity-60">{label}</span>{children}{hint && <span className="block ts-9 opacity-45">{hint}</span>}</label>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 ts-10"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />{label}</label>;
}
function NumberField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number) => void }) {
  return <Field label={label}><input className={inputClass} type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} /></Field>;
}
function TagsField({ label, value, onChange }: { label: string; value?: string[]; onChange: (v: string[]) => void }) {
  return <Field label={label} hint="Tavern 原生数组字段；每行一个。"><textarea className={areaClass} rows={3} value={(value || []).join("\n")} onChange={e => onChange(e.target.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean))} /></Field>;
}

function Header({ kind, resource, onDelete, onExport }: { kind: Kind; resource: Resource; onDelete?: () => void; onExport?: () => void }) {
  const labels = { preset: "Preset / 预设", worldbook: "World Info / 世界书", regex: "Regex Scripts / 正则" };
  return <>
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ts-13 font-black">TAVERN FORMAT · 自适应编辑器</div>
          <div className="mt-1 ts-9 opacity-60">这是针对 Tavern 原生字段重新匹配的编辑界面，不把 Tavern 数据硬套进旧模板。未识别字段仍由原始数据保留。</div>
          <div className="mt-2 inline-flex rounded-full border px-2.5 py-1 ts-9 font-bold">{labels[kind]}</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onExport && <button type="button" onClick={onExport} className="rounded-full border p-2" title="导出"><Download size={15} /></button>}
          {onDelete && <button type="button" onClick={onDelete} className="rounded-full border p-2 text-[var(--c-danger)]" title="删除"><Trash2 size={15} /></button>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 ts-9">
        <div className="rounded-xl bg-black/[.035] p-2 dark:bg-white/[.04]"><b>原生格式</b><br />保留</div>
        <div className="rounded-xl bg-black/[.035] p-2 dark:bg-white/[.04]"><b>运行语义</b><br />Tavern</div>
        <div className="rounded-xl bg-black/[.035] p-2 dark:bg-white/[.04]"><b>未知字段</b><br />不丢弃</div>
      </div>
    </div>
  </>;
}

function PromptEditor({ prompt, index, onChange, onDelete }: { prompt: Prompt; index: number; onChange: (p: Prompt) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(index === 0);
  const set = <K extends keyof Prompt>(key: K, value: Prompt[K]) => onChange({ ...prompt, [key]: value });
  return <div className={cardClass}>
    <div className="flex items-center gap-2">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(v => !v)}>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        <span className="truncate ts-11 font-black">{index + 1}. {prompt.name || prompt.identifier || "Prompt"}</span>
        <span className="rounded-full border px-2 py-0.5 ts-9">{prompt.role}</span>
        {prompt.marker && <span className="rounded-full border px-2 py-0.5 ts-9">marker</span>}
      </button>
      <button type="button" onClick={onDelete} className="rounded-full border p-1.5 text-[var(--c-danger)]"><Trash2 size={14} /></button>
    </div>
    {open && <div className="mt-3 grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="name"><input className={inputClass} value={prompt.name} onChange={e => set("name", e.target.value)} /></Field>
        <Field label="identifier"><input className={inputClass} value={prompt.identifier} onChange={e => set("identifier", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="role"><select className={inputClass} value={prompt.role} onChange={e => set("role", e.target.value)}><option value="system">system</option><option value="user">user</option><option value="assistant">assistant</option></select></Field>
        <NumberField label="injection_depth" value={prompt.injection_depth} onChange={v => set("injection_depth", v)} />
      </div>
      <Field label="content"><textarea className={areaClass} rows={7} value={prompt.content} onChange={e => set("content", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="injection_position" value={prompt.injection_position} onChange={v => set("injection_position", v)} />
        <NumberField label="injection_order" value={prompt.injection_order} onChange={v => set("injection_order", v)} />
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border p-2">
        <Toggle label="enabled" value={prompt.enabled !== false} onChange={v => set("enabled", v)} />
        <Toggle label="marker" value={prompt.marker === true} onChange={v => set("marker", v)} />
        <Toggle label="system_prompt" value={prompt.system_prompt === true} onChange={v => set("system_prompt", v)} />
        <Toggle label="forbid_overrides" value={prompt.forbid_overrides === true} onChange={v => set("forbid_overrides", v)} />
      </div>
      <TagsField label="injection_trigger" value={(prompt.injection_trigger || []).map(String)} onChange={v => set("injection_trigger", v)} />
    </div>}
  </div>;
}

function PresetEditor({ resource, onChange }: { resource: PresetConfig; onChange: (updates: Partial<PresetConfig>) => void }) {
  const [tab, setTab] = useState<"overview" | "prompts" | "order" | "generation">("overview");
  const tabs = [["overview", "基本"], ["prompts", `Prompt · ${resource.prompts.length}`], ["order", "Prompt Order"], ["generation", "生成参数"]] as const;
  const updatePrompt = (index: number, p: Prompt) => onChange({ prompts: resource.prompts.map((x, i) => i === index ? p : x) });
  return <div className="grid gap-3">
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`shrink-0 rounded-full border px-3 py-1.5 ts-9 font-bold ${tab === id ? "bg-black text-white" : ""}`}>{label}</button>)}</div>
    {tab === "overview" && <div className={cardClass}><div className="grid gap-3"><Field label="Tavern preset name"><input className={inputClass} value={resource.name} onChange={e => onChange({ name: e.target.value })} /></Field><Field label="description"><textarea className={areaClass} rows={3} value={resource.description || ""} onChange={e => onChange({ description: e.target.value })} /></Field><div className="grid grid-cols-2 gap-2"><Field label="wi_format"><input className={inputClass} value={resource.wi_format || ""} onChange={e => onChange({ wi_format: e.target.value })} /></Field><Field label="scenario_format"><input className={inputClass} value={resource.scenario_format || ""} onChange={e => onChange({ scenario_format: e.target.value })} /></Field><Field label="personality_format"><input className={inputClass} value={resource.personality_format || ""} onChange={e => onChange({ personality_format: e.target.value })} /></Field><Field label="send_if_empty"><input className={inputClass} value={resource.send_if_empty || ""} onChange={e => onChange({ send_if_empty: e.target.value })} /></Field></div></div></div>}
    {tab === "prompts" && <div className="grid gap-2">{resource.prompts.map((p, i) => <PromptEditor key={`${p.identifier}-${i}`} prompt={p} index={i} onChange={v => updatePrompt(i, v)} onDelete={() => onChange({ prompts: resource.prompts.filter((_, j) => j !== i) })} />)}<button type="button" className="rounded-2xl border border-dashed p-3 ts-10 font-bold" onClick={() => onChange({ prompts: [...resource.prompts, { identifier: `prompt-${Date.now()}`, name: "New Prompt", role: "system", content: "", injection_depth: 0, enabled: true }] })}><Plus size={15} className="mr-1 inline" />添加 Tavern Prompt</button></div>}
    {tab === "order" && <div className={cardClass}><div className="grid gap-2">{(resource.prompt_order || resource.prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled }))).map((entry, i) => <div key={`${entry.identifier}-${i}`} className="flex items-center gap-2 rounded-xl border p-2"><button type="button" disabled={i === 0} onClick={() => { const next = [...(resource.prompt_order || resource.prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled })))]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onChange({ prompt_order: next }); }} className="rounded-lg border p-1 disabled:opacity-30">↑</button><button type="button" disabled={i === (resource.prompt_order || resource.prompts).length - 1} onClick={() => { const next = [...(resource.prompt_order || resource.prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled })))]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; onChange({ prompt_order: next }); }} className="rounded-lg border p-1 disabled:opacity-30">↓</button><span className="min-w-0 flex-1 truncate ts-10 font-semibold">{entry.identifier}</span><Toggle label="enabled" value={entry.enabled} onChange={v => onChange({ prompt_order: (resource.prompt_order || resource.prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled }))).map((x, j) => j === i ? { ...x, enabled: v } : x) })} /></div>)}</div></div>}
    {tab === "generation" && <div className={cardClass}><div className="grid grid-cols-2 gap-2"><NumberField label="temperature" value={resource.temperature} onChange={v => onChange({ temperature: v })}/><NumberField label="top_p" value={resource.top_p} onChange={v => onChange({ top_p: v })}/><NumberField label="top_k" value={resource.top_k} onChange={v => onChange({ top_k: v })}/><NumberField label="frequency_penalty" value={resource.frequency_penalty} onChange={v => onChange({ frequency_penalty: v })}/><NumberField label="presence_penalty" value={resource.presence_penalty} onChange={v => onChange({ presence_penalty: v })}/><NumberField label="repetition_penalty" value={resource.repetition_penalty} onChange={v => onChange({ repetition_penalty: v })}/><NumberField label="max_tokens" value={resource.openai_max_tokens} onChange={v => onChange({ openai_max_tokens: v })}/><NumberField label="max_context" value={resource.openai_max_context} onChange={v => onChange({ openai_max_context: v })}/></div></div>}
  </div>;
}

function WorldBookEntryEditor({ entry, index, onChange, onDelete }: { entry: WorldBookEntry; index: number; onChange: (e: WorldBookEntry) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(index === 0);
  const set = (key: keyof WorldBookEntry, value: any) => onChange({ ...entry, [key]: value });
  return <div className={cardClass}>
    <div className="flex items-center gap-2"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(v => !v)}>{open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}<span className="truncate ts-11 font-black">{index + 1}. {entry.comment || entry.key || "World Info Entry"}</span><span className="rounded-full border px-2 py-0.5 ts-9">{entry.constant ? "constant" : entry.position}</span></button><button type="button" onClick={onDelete} className="rounded-full border p-1.5 text-[var(--c-danger)]"><Trash2 size={14}/></button></div>
    {open && <div className="mt-3 grid gap-3">
      <div className="grid grid-cols-2 gap-2"><Field label="comment"><input className={inputClass} value={entry.comment} onChange={e => set("comment", e.target.value)} /></Field><Field label="uid"><input className={inputClass} value={entry.uid} onChange={e => set("uid", e.target.value)} /></Field></div>
      <TagsField label="key / keys" value={entry.key.split(/\s*,\s*/).filter(Boolean)} onChange={v => set("key", v.join(","))}/>
      <TagsField label="keysecondary / secondary keys" value={entry.tavernSecondaryKeys} onChange={v => set("tavernSecondaryKeys", v)}/>
      <Field label="content"><textarea className={areaClass} rows={7} value={entry.content} onChange={e => set("content", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="position"><input className={inputClass} value={String(entry.position)} onChange={e => set("position", /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value)} /></Field><NumberField label="depth" value={entry.depth} onChange={v => set("depth", v)}/><NumberField label="insertion_order / order" value={entry.insertion_order} onChange={v => set("insertion_order", v)}/><NumberField label="probability" value={entry.probability} onChange={v => set("probability", v)}/><Field label="group"><input className={inputClass} value={entry.tavernGroup || ""} onChange={e => set("tavernGroup", e.target.value)}/></Field><NumberField label="groupWeight" value={entry.tavernGroupWeight} onChange={v => set("tavernGroupWeight", v)}/></div>
      <div className="flex flex-wrap gap-3 rounded-xl border p-2"><Toggle label="enabled" value={!entry.disable} onChange={v => set("disable", !v)}/><Toggle label="constant" value={!!entry.constant} onChange={v => set("constant", v)}/><Toggle label="use_regex" value={!!entry.use_regex} onChange={v => set("use_regex", v)}/><Toggle label="useProbability" value={!!entry.useProbability} onChange={v => set("useProbability", v)}/><Toggle label="caseSensitive" value={!!entry.tavernCaseSensitive} onChange={v => set("tavernCaseSensitive", v)}/><Toggle label="matchWholeWords" value={!!entry.tavernMatchWholeWords} onChange={v => set("tavernMatchWholeWords", v)}/><Toggle label="excludeRecursion" value={!!entry.tavernExcludeRecursion} onChange={v => set("tavernExcludeRecursion", v)}/><Toggle label="preventRecursion" value={!!entry.tavernPreventRecursion} onChange={v => set("tavernPreventRecursion", v)}/><Toggle label="delayUntilRecursion" value={!!entry.tavernDelayUntilRecursion} onChange={v => set("tavernDelayUntilRecursion", v)}/></div>
      <TagsField label="characterFilter" value={entry.tavernCharacterFilter} onChange={v => set("tavernCharacterFilter", v)}/><Toggle label="characterFilterExclude" value={!!entry.tavernCharacterFilterExclude} onChange={v => set("tavernCharacterFilterExclude", v)}/><TagsField label="triggers" value={entry.tavernTriggers} onChange={v => set("tavernTriggers", v)}/><Field label="outlet / outletName"><input className={inputClass} value={entry.tavernOutlet || ""} onChange={e => set("tavernOutlet", e.target.value)}/></Field>
    </div>}
  </div>;
}

function WorldBookEditor({ resource, onChange }: { resource: WorldBookConfig; onChange: (updates: Partial<WorldBookConfig>) => void }) {
  const [tab, setTab] = useState<"overview" | "entries" | "runtime">("entries");
  const updateEntry = (i: number, e: WorldBookEntry) => onChange({ entries: resource.entries.map((x, j) => j === i ? e : x) });
  return <div className="grid gap-3"><div className="flex gap-2 overflow-x-auto pb-1">{[["overview","基本"],["entries",`Entries · ${resource.entries.length}`],["runtime","扫描 / 递归"]].map(([id,label])=><button key={id} type="button" onClick={()=>setTab(id as any)} className={`shrink-0 rounded-full border px-3 py-1.5 ts-9 font-bold ${tab===id?"bg-black text-white":""}`}>{label}</button>)}</div>
    {tab === "overview" && <div className={cardClass}><div className="grid gap-3"><Field label="Tavern world name"><input className={inputClass} value={resource.name} onChange={e=>onChange({name:e.target.value})}/></Field><Field label="description"><textarea className={areaClass} rows={3} value={resource.description || ""} onChange={e=>onChange({description:e.target.value})}/></Field></div></div>}
    {tab === "entries" && <div className="grid gap-2">{resource.entries.map((e,i)=><WorldBookEntryEditor key={e.uid || i} entry={e} index={i} onChange={v=>updateEntry(i,v)} onDelete={()=>onChange({entries:resource.entries.filter((_,j)=>j!==i)})}/>)}<button type="button" className="rounded-2xl border border-dashed p-3 ts-10 font-bold" onClick={()=>onChange({entries:[...resource.entries,{uid:`wb-${Date.now()}`,key:"",content:"",comment:"New Entry",use_regex:false,disable:false,constant:false,position:"before_char",depth:0,probability:100,useProbability:false,role:0,insertion_order:50}]})}><Plus size={15} className="mr-1 inline"/>添加 Tavern World Info 条目</button></div>}
    {tab === "runtime" && <div className={cardClass}><div className="grid grid-cols-2 gap-2"><NumberField label="scan_depth" value={resource.tavernScanDepth} onChange={v=>onChange({tavernScanDepth:v})}/><NumberField label="max_recursion_steps" value={resource.tavernMaxRecursionSteps} onChange={v=>onChange({tavernMaxRecursionSteps:v})}/></div><div className="mt-3 rounded-xl border p-2"><Toggle label="recursive_scanning" value={!!resource.tavernRecursiveScanning} onChange={v=>onChange({tavernRecursiveScanning:v})}/></div></div>}
  </div>;
}

function RegexRuleEditor({ rule, index, onChange, onDelete }: { rule: RegexRule; index: number; onChange: (r: RegexRule) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(index === 0);
  const set = (key: keyof RegexRule, value: any) => onChange({ ...rule, [key]: value });
  const placements = [[1,"user_input"],[2,"ai_output"],[3,"slash_command"],[5,"world_info"],[6,"reasoning"]] as const;
  return <div className={cardClass}><div className="flex items-center gap-2"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={()=>setOpen(v=>!v)}>{open?<ChevronUp size={15}/>:<ChevronDown size={15}/>}<span className="truncate ts-11 font-black">{index+1}. {rule.scriptName || rule.id}</span><span className="rounded-full border px-2 py-0.5 ts-9">{rule.disabled?"disabled":"enabled"}</span></button><button type="button" onClick={onDelete} className="rounded-full border p-1.5 text-[var(--c-danger)]"><Trash2 size={14}/></button></div>
    {open && <div className="mt-3 grid gap-3"><div className="grid grid-cols-2 gap-2"><Field label="script_name"><input className={inputClass} value={rule.scriptName} onChange={e=>set("scriptName",e.target.value)}/></Field><Field label="id"><input className={inputClass} value={rule.id} onChange={e=>set("id",e.target.value)}/></Field></div><Field label="find_regex"><textarea className={areaClass} rows={3} value={rule.findRegex} onChange={e=>set("findRegex",e.target.value)}/></Field><Field label="replace_string"><textarea className={areaClass} rows={3} value={rule.replaceString} onChange={e=>set("replaceString",e.target.value)}/></Field><TagsField label="trim_strings" value={rule.trimStrings} onChange={v=>set("trimStrings",v)}/><div className="rounded-xl border p-2"><div className="mb-2 ts-9 font-bold opacity-60">source / placement</div><div className="flex flex-wrap gap-3">{placements.map(([value,label])=><Toggle key={value} label={`${value} · ${label}`} value={rule.placement.includes(value)} onChange={v=>set("placement",v?[...new Set([...rule.placement,value])]:rule.placement.filter(x=>x!==value))}/>)}</div></div><div className="flex flex-wrap gap-3 rounded-xl border p-2"><Toggle label="disabled" value={!!rule.disabled} onChange={v=>set("disabled",v)}/><Toggle label="markdownOnly" value={!!rule.markdownOnly} onChange={v=>set("markdownOnly",v)}/><Toggle label="promptOnly" value={!!rule.promptOnly} onChange={v=>set("promptOnly",v)}/><Toggle label="runOnEdit" value={!!rule.runOnEdit} onChange={v=>set("runOnEdit",v)}/></div><div className="grid grid-cols-2 gap-2"><NumberField label="substituteRegex" value={rule.substituteRegex} onChange={v=>set("substituteRegex",v)}/><NumberField label="minDepth" value={rule.minDepth} onChange={v=>set("minDepth",v)}/><NumberField label="maxDepth" value={rule.maxDepth} onChange={v=>set("maxDepth",v)}/></div></div>}
  </div>;
}

function RegexEditor({ resource, onChange }: { resource: RegexConfig; onChange: (updates: Partial<RegexConfig>) => void }) {
  const updateRule = (i:number,r:RegexRule)=>onChange({rules:resource.rules.map((x,j)=>j===i?r:x)});
  return <div className="grid gap-3"><div className={cardClass}><div className="grid gap-3"><Field label="Tavern regex group name"><input className={inputClass} value={resource.name} onChange={e=>onChange({name:e.target.value})}/></Field><Field label="description"><textarea className={areaClass} rows={2} value={resource.description || ""} onChange={e=>onChange({description:e.target.value})}/></Field></div></div><div className="grid gap-2">{resource.rules.map((r,i)=><RegexRuleEditor key={r.id || i} rule={r} index={i} onChange={v=>updateRule(i,v)} onDelete={()=>onChange({rules:resource.rules.filter((_,j)=>j!==i)})}/>)}<button type="button" className="rounded-2xl border border-dashed p-3 ts-10 font-bold" onClick={()=>onChange({rules:[...resource.rules,{id:`regex-${Date.now()}`,scriptName:"New Tavern Regex",findRegex:"",replaceString:"",disabled:false,placement:[2]}]})}><Plus size={15} className="mr-1 inline"/>添加 Tavern Regex Script</button></div></div>;
}

export function TavernCompatibleEditor({ kind, resource, onChange, onDelete, onExport }: Props) {
  const typedChange = (updates: any) => onChange(updates);
  return <div className="flex flex-col gap-3 pb-6"><Header kind={kind} resource={resource} onDelete={onDelete} onExport={onExport}/>{kind === "preset" ? <PresetEditor resource={resource as PresetConfig} onChange={typedChange}/> : kind === "worldbook" ? <WorldBookEditor resource={resource as WorldBookConfig} onChange={typedChange}/> : <RegexEditor resource={resource as RegexConfig} onChange={typedChange}/>}</div>;
}
