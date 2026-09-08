"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TavernStatusBarConfig } from "@/lib/settings-types";
import { deleteTavernStatusBar, loadTavernStatusBars, saveTavernStatusBars, upsertTavernStatusBar } from "@/lib/settings-storage";
import { exportTavernStatusBar, parseTavernStatusBar, applyTavernStatusBars } from "@/lib/tavern/status-resource";

function pretty(value: unknown) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function TavernStatusBarManager() {
  const [items, setItems] = useState<TavernStatusBarConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rawText, setRawText] = useState("");
  const [sample, setSample] = useState("<live_forum>\n[header|示例状态]\n[comment|系统|状态栏已载入]\n</live_forum>");
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
    setRawText(selected ? pretty(exportTavernStatusBar(selected)) : "");
    setError("");
  }, [selectedId, selected]);

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

  const saveRaw = () => {
    if (!selected) return;
    try {
      const parsed = parseTavernStatusBar(rawText, selected.name);
      if (!parsed) throw new Error();
      parsed.id = selected.id;
      parsed.createdAt = selected.createdAt;
      parsed.enabled = selected.enabled;
      parsed.name = selected.name;
      parsed.updatedAt = Date.now();
      upsertTavernStatusBar(parsed);
      reload();
      setError("");
    } catch {
      setError("JSON 无效，未保存。");
    }
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
        <>
          <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              <button className="rounded-xl border px-3 py-2 ts-10" onClick={() => toggle(selected.id)}>{selected.enabled ? "停用运行" : "启用运行"}</button>
              <button className="rounded-xl border px-3 py-2 ts-10" onClick={exportSelected}>导出原生 JSON</button>
              <button className="rounded-xl border px-3 py-2 ts-10" onClick={() => remove(selected.id)}>删除</button>
            </div>
            <textarea value={rawText} onChange={e => setRawText(e.target.value)} className="min-h-[360px] w-full rounded-xl border border-[var(--c-input-border)] bg-[var(--c-input)] p-3 font-mono text-[11px] leading-relaxed" spellCheck={false} />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="ts-9 text-[var(--c-danger)]">{error}</span>
              <button className="rounded-xl bg-[var(--c-text)] px-4 py-2 ts-10 font-bold text-[var(--c-page-body-bg)]" onClick={saveRaw}>保存原生 JSON</button>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--c-panel-border)] bg-[var(--c-page-body-bg)] p-3">
            <div className="mb-2 ts-12 font-black">运行测试</div>
            <textarea value={sample} onChange={e => setSample(e.target.value)} rows={7} className="w-full rounded-xl border border-[var(--c-input-border)] bg-[var(--c-input)] p-2 font-mono text-[11px]" />
            <div className="mt-2 rounded-xl border border-[var(--c-panel-border)] bg-black/[.025] p-3 dark:bg-white/[.025]">
              <div className="mb-1 ts-9 font-bold opacity-55">经过原生 Regex 后的输出</div>
              <pre className="whitespace-pre-wrap break-words ts-9">{preview}</pre>
            </div>
          </section>
        </>
      )}

      {!items.length && <div className="rounded-2xl border border-dashed p-6 text-center ts-10 opacity-60">还没有状态栏。导入一个 Tavern JSON 即可开始。</div>}
    </div>
  );
}
