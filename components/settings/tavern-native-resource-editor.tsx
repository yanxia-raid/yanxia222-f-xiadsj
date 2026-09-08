"use client";

import { useEffect, useState } from "react";
import { Download, Save } from "lucide-react";

export function TavernNativeResourceEditor({
    title,
    description,
    value,
    onSave,
    onExport,
}: {
    title: string;
    description: string;
    value: unknown;
    onSave: (text: string) => string | null;
    onExport: () => void;
}) {
    const [text, setText] = useState(() => JSON.stringify(value, null, 2));
    const [error, setError] = useState("");

    useEffect(() => {
        setText(JSON.stringify(value, null, 2));
        setError("");
    }, [value]);

    const save = () => {
        const message = onSave(text);
        setError(message || "");
    };

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div>
                    <h2 className="m-0 ts-20 font-bold leading-none text-black">{title}</h2>
                    <p className="mt-2 max-w-[720px] ts-10 opacity-60">{description}</p>
                </div>
                <span className="ui-badge shrink-0" data-variant="success">Tavern Native</span>
            </div>

            <div className="ui-entry-card flex flex-col gap-3" style={{ cursor: "default" }}>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={save} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[20px] bg-black px-4 text-xs font-bold text-white">
                        <Save size={15} strokeWidth={1.8} /> 保存原生 JSON
                    </button>
                    <button type="button" onClick={onExport} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[20px] border border-black/10 bg-white px-4 text-xs font-bold text-gray-800">
                        <Download size={15} strokeWidth={1.8} /> 导出原生 JSON
                    </button>
                </div>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    spellCheck={false}
                    className="min-h-[62vh] w-full rounded-2xl border border-[var(--c-input-border)] bg-[var(--c-input)] p-3 font-mono text-[11px] leading-relaxed outline-none"
                />
                {error ? <div className="ts-10 text-[var(--c-danger)]">{error}</div> : <div className="ts-9 opacity-50">不会把 Tavern 字段重新套进本应用的旧固定模板；未知字段也会原样保留。</div>}
            </div>
        </div>
    );
}
