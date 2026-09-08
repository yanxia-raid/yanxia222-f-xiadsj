"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TavernStatusBarConfig } from "@/lib/settings-types";
import { deleteTavernStatusBar, loadTavernStatusBars, saveTavernStatusBars, upsertTavernStatusBar } from "@/lib/settings-storage";
import { exportTavernStatusBar, parseTavernStatusBar, applyTavernStatusBars, patchTavernStatusBar } from "@/lib/tavern/status-resource";
import { TavernStatusBarEditor } from "./tavern-statusbar-editor";


export function TavernStatusBarManager() {
  const [items, setItems] = useState<TavernStatusBarConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    const next = loadTavernStatusBars();
    setItems(next);
    setSelectedId(prev => next.some(x => x.id === prev) ? prev : next[0]?.id || "");
  };

  useEffect(() => {
    reload();
    const onUpdate = () => reload();
    window.addEventListener("settings-tavern-statusbars-updated", onUpdate);
    return () => window.removeEventListener("settings-tavern-statusbars-updated", onUpdate);
  }, []);

  const selected = useMemo(() => items.find(x => x.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    setError("");
  }, [selectedId, selected]);

  const updateSelected = (updates: Partial<TavernStatusBarConfig>) => {
    if (!selected) return;
    const next = patchTavernStatusBar(selected, updates);
    upsertTavernStatusBar(next);
    setItems(prev => prev.map(item => item.id === next.id ? next : item));
    setError("");
  };

  const importText = (text: string, name?: string) => {
    const parsed = parseTavernStatusBar(text, name || "导入的酒馆状态栏");
    if (!parsed) {
      setError("无法识别这个文件。请确认它是 JSON 格式的酒馆状态栏/角色卡导出。");
      return;
    }
    const next = [...items.filter(x => x.id !== parsed.id), parsed];
    saveTavernStatusBars(next);
    setItems(next);
    setSelectedId(parsed.id);
    setError("");
  };

  const onFile = async (file: File) => {
    try { importText(await file.text(), file.name.replace(/\.[^.]+$/, "")); }
    catch { setError("读取文件失败。"); }
  };


  const toggle = (id: string) => {
    const next = items.map(x => x.id === id ? { ...x, enabled: !x.enabled, updatedAt: Date.now() } : x);
    saveTavernStatusBars(next);
    setItems(next);
  };

  const remove = (id: string) => {
    deleteTavernStatusBar(id);
    reload();
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

  const preview = selected ? applyTavernStatusBars(sample, [selected]) : sample;

  return (
    <div className="grid gap-3">
      <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e => {
        const file = e.target.files?.[0];
        if (file) void onFile(file);
        e.currentTarget.value = "";
      }} />

      <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="ts-13 font-black">酒馆状态栏</div>
            <div className="mt-1 ts-9 opacity-60">原生 JSON 保存；不套用旧状态栏模板。角色卡式状态栏也可以直接导入。</div>
          </div>
          <button className="rounded-xl border px-3 py-2 ts-10 font-bold" onClick={() => fileRef.current?.click()}>导入 JSON</button>
        </div>
      </section>

      {items.length > 0 && (
        <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3">
          <div className="grid gap-2">
            {items.map(item => (
              <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left ${item.id === selectedId ? "ring-2 ring-[var(--c-text)]/20" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate ts-11 font-bold">{item.name}</span>
                  <span className="block ts-9 opacity-55">{item.sourceFormat || "Tavern Native"} · {item.regexScripts?.length || 0} 条原生 Regex</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="ts-9">{item.enabled ? "运行中" : "已停用"}</span>
                  <input type="checkbox" checked={item.enabled} onChange={() => toggle(item.id)} onClick={e => e.stopPropagation()} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <TavernStatusBarEditor
          resource={selected}
          onChange={updateSelected}
          onDelete={() => remove(selected.id)}
          onExport={exportSelected}
        />
      )}

      {!items.length && <div className="rounded-2xl border border-dashed p-6 text-center ts-10 opacity-60">还没有状态栏。导入一个 Tavern JSON 即可开始。</div>}
    </div>
  );
}
