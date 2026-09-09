"use client";

import { useEffect, useRef, useState } from "react";
import type { TavernStatusBarConfig } from "@/lib/settings-types";
import { deleteTavernStatusBar, loadTavernStatusBars, saveTavernStatusBars } from "@/lib/settings-storage";
import { exportTavernStatusBar, parseTavernStatusBar } from "@/lib/tavern/status-resource";
import { Plus, Upload, Download, Trash2, ChevronLeft, AlertCircle } from "lucide-react";

const newStatusBar = (): TavernStatusBarConfig => ({
  id: `statusbar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: "新状态栏",
  description: "",
  enabled: true,
  sourceFormat: "tavern-native",
  raw: { name: "新状态栏", description: "", extensions: { regex_scripts: [] } },
  regexScripts: [],
  template: "",
  tavernNative: { kind: "statusbar", raw: { name: "新状态栏", description: "", extensions: { regex_scripts: [] } }, payloadPath: "root", baseline: {} },
  updatedAt: Date.now(),
});

export function TavernStatusBarManager() {
  const [items, setItems] = useState<TavernStatusBarConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    const next = loadTavernStatusBars();
    setItems(next);
    setSelectedId(prev => next.some(x => x.id === prev) ? prev : next[0]?.id || "");
    setIsLoaded(true);
  };

  useEffect(() => {
    reload();
    const onUpdate = () => reload();
    window.addEventListener("settings-tavern-statusbars-updated", onUpdate);
    return () => window.removeEventListener("settings-tavern-statusbars-updated", onUpdate);
  }, []);

  const selected = items.find(x => x.id === selectedId) || null;

  const updateSelected = (updates: Partial<TavernStatusBarConfig>) => {
    if (!selected) return;
    const next = { ...selected, ...updates, updatedAt: Date.now() };
    const all = items.map(x => x.id === next.id ? next : x);
    saveTavernStatusBars(all);
    setItems(all);
  };

  const add = () => {
    const next = newStatusBar();
    const all = [...items, next];
    saveTavernStatusBars(all);
    setItems(all);
    setSelectedId(next.id);
  };

  const remove = (id: string) => {
    deleteTavernStatusBar(id);
    reload();
  };

  const importText = (text: string, name?: string) => {
    const parsed = parseTavernStatusBar(text, name || "导入的酒馆状态栏");
    if (!parsed) {
      setImportError("无法识别这个 JSON。请确认它是 Tavern 状态栏或角色卡导出文件。");
      return;
    }
    const all = [...items.filter(x => x.id !== parsed.id), parsed];
    saveTavernStatusBars(all);
    setItems(all);
    setSelectedId(parsed.id);
    setImportError(null);
  };

  const handleImport = async (file: File) => {
    try { importText(await file.text(), file.name.replace(/\.[^.]+$/, "")); }
    catch { setImportError("读取文件失败。"); }
  };

  const exportSelected = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(exportTavernStatusBar(selected), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.name || "tavern-statusbar"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isLoaded) return null;

  return (
    <div className="flex flex-col gap-5 h-full">
      <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e => {
        const file = e.target.files?.[0];
        if (file) void handleImport(file);
        e.currentTarget.value = "";
      }} />

      {importError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-3 ts-10">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {!selected ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="ts-16 font-black">酒馆状态栏</div>
              <div className="mt-1 ts-10 opacity-60">Tavern 导入的数据继续使用本应用原来的编辑方式。</div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border px-3 py-2 ts-10 font-bold" onClick={() => fileRef.current?.click()}><Upload className="mr-1 inline h-4 w-4" />导入</button>
              <button type="button" className="rounded-xl border px-3 py-2 ts-10 font-bold" onClick={add}><Plus className="mr-1 inline h-4 w-4" />新建</button>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed p-8 text-center ts-10 opacity-60">还没有状态栏。可以导入 Tavern JSON，或新建一个状态栏。</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-6">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="rounded-xl border px-3 py-2 ts-10 font-bold" onClick={() => setSelectedId("")}><ChevronLeft className="mr-1 inline h-4 w-4" />返回</button>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border px-3 py-2 ts-10 font-bold" onClick={exportSelected}><Download className="mr-1 inline h-4 w-4" />导出</button>
              <button type="button" className="rounded-xl border border-red-500/20 px-3 py-2 ts-10 font-bold text-red-600" onClick={() => remove(selected.id)}><Trash2 className="mr-1 inline h-4 w-4" />删除</button>
            </div>
          </div>

          <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-4">
            <div className="mb-4 ts-12 font-black">基本信息</div>
            <div className="grid gap-3">
              <label className="grid gap-1"><span className="ts-10 font-bold">名称</span><input className="rounded-xl border bg-transparent px-3 py-2 ts-11" value={selected.name} onChange={e => updateSelected({ name: e.target.value })} /></label>
              <label className="grid gap-1"><span className="ts-10 font-bold">描述</span><textarea className="min-h-20 rounded-xl border bg-transparent px-3 py-2 ts-11" value={selected.description || ""} onChange={e => updateSelected({ description: e.target.value })} /></label>
              <label className="flex items-center justify-between rounded-xl border p-3"><span className="ts-10 font-bold">启用状态栏</span><input type="checkbox" checked={selected.enabled} onChange={e => updateSelected({ enabled: e.target.checked })} /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-4">
            <div className="mb-4 ts-12 font-black">状态模板</div>
            <textarea className="min-h-32 w-full rounded-xl border bg-transparent px-3 py-2 font-mono ts-10" value={selected.template || ""} onChange={e => updateSelected({ template: e.target.value })} placeholder="Tavern 状态栏模板（如果原文件没有模板则可留空）" />
          </section>

          <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-4">
            <div className="mb-4 flex items-center justify-between gap-2"><div className="ts-12 font-black">Regex</div><span className="ts-9 opacity-55">{selected.regexScripts?.length || 0} 条</span></div>
            <div className="grid gap-3">
              {(selected.regexScripts || []).map((rule, index) => (
                <div key={`${rule.id || index}`} className="rounded-xl border p-3">
                  <div className="grid gap-2">
                    <input className="rounded-lg border bg-transparent px-2 py-2 ts-10" value={rule.scriptName || ""} placeholder="规则名称" onChange={e => updateSelected({ regexScripts: selected.regexScripts.map((r, i) => i === index ? { ...r, scriptName: e.target.value } : r) })} />
                    <textarea className="min-h-20 rounded-lg border bg-transparent px-2 py-2 font-mono ts-9" value={rule.findRegex || ""} placeholder="findRegex" onChange={e => updateSelected({ regexScripts: selected.regexScripts.map((r, i) => i === index ? { ...r, findRegex: e.target.value } : r) })} />
                    <textarea className="min-h-16 rounded-lg border bg-transparent px-2 py-2 font-mono ts-9" value={rule.replaceString || ""} placeholder="replaceString" onChange={e => updateSelected({ regexScripts: selected.regexScripts.map((r, i) => i === index ? { ...r, replaceString: e.target.value } : r) })} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-4">
            <div className="mb-2 ts-12 font-black">原始 JSON</div>
            <pre className="max-h-80 overflow-auto rounded-xl bg-black/[.04] p-3 ts-9 leading-relaxed">{JSON.stringify(exportTavernStatusBar(selected), null, 2)}</pre>
          </section>
        </div>
      )}

      {items.length > 0 && !selected && (
        <div className="grid gap-2">
          {items.map(item => (
            <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex items-center justify-between gap-3 rounded-2xl border p-4 text-left">
              <span className="min-w-0"><span className="block truncate ts-11 font-bold">{item.name}</span><span className="block ts-9 opacity-55">{item.sourceFormat || "Tavern Native"} · {item.regexScripts?.length || 0} 条 Regex</span></span>
              <input type="checkbox" checked={item.enabled} onChange={e => { e.stopPropagation(); const next = items.map(x => x.id === item.id ? { ...x, enabled: e.target.checked, updatedAt: Date.now() } : x); saveTavernStatusBars(next); setItems(next); }} onClick={e => e.stopPropagation()} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
