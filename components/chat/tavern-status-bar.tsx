'use client';
import type { TavernStatusValue } from '@/lib/tavern';
export function TavernStatusBar({ values }: { values: TavernStatusValue[] }) {
  if (!values.length) return null;
  return <div className="mx-3 my-2 flex gap-2 overflow-x-auto rounded-2xl border bg-white/80 p-2 text-xs shadow-sm backdrop-blur dark:bg-zinc-900/80">
    {values.map(v => <div key={v.key} className="shrink-0 rounded-xl bg-black/5 px-2.5 py-1.5 dark:bg-white/10"><span className="opacity-60">{v.label}</span><span className="ml-1 font-medium">{v.value}</span></div>)}
  </div>;
}
