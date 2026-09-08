import type { TavernStatusBarConfig } from '@/lib/settings-types';
import type { TavernRegexScript } from './types';
import { applyTavernRegex } from './regex';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function locatePayload(raw: Record<string, unknown>) {
  if (isRecord(raw.data) && isRecord(raw.data.extensions)) {
    return { payload: raw.data, path: 'data' as const };
  }
  if (isRecord(raw.extensions)) {
    return { payload: raw, path: 'extensions' as const };
  }
  return { payload: raw, path: 'root' as const };
}

function sourceFormat(raw: Record<string, unknown>) {
  const dataSpec = isRecord(raw.data) ? String(raw.data.spec ?? '') : '';
  const spec = String(raw.spec ?? dataSpec ?? '');
  return spec || (isRecord(raw.data) ? 'tavern-card' : 'tavern-native');
}

function collectRegex(payload: Record<string, unknown>, raw: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    payload.regex_scripts,
    payload.regexScripts,
    isRecord(payload.extensions) ? payload.extensions.regex_scripts : undefined,
    isRecord(payload.extensions) ? payload.extensions.regexScripts : undefined,
    raw.regex_scripts,
    raw.regexScripts,
  ];
  const found = candidates.find(Array.isArray);
  return found ? clone(found as Array<Record<string, unknown>>) : [];
}

/**
 * Status-bar import is intentionally permissive: many ST status bars are actually
 * exported as a character card whose `extensions.regex_scripts` contains the UI
 * transformations. We retain the complete JSON and only project the regex list
 * for runtime.
 */
export function parseTavernStatusBar(text: string, fallbackName = '导入的酒馆状态栏'): TavernStatusBarConfig | null {
  try {
    const raw = JSON.parse(text);
    if (!isRecord(raw)) return null;
    const located = locatePayload(raw);
    const data = isRecord(raw.data) ? raw.data : raw;
    const name = String(raw.name ?? data.name ?? fallbackName);
    const now = Date.now();
    return {
      id: `statusbar_${now}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      description: String(raw.description ?? data.description ?? ''),
      createdAt: now,
      updatedAt: now,
      enabled: true,
      sourceFormat: sourceFormat(raw),
      raw: clone(raw),
      regexScripts: collectRegex(located.payload, raw),
      tavernNative: {
        kind: 'statusbar',
        raw: clone(raw),
        payloadPath: located.path,
        baseline: clone(raw),
      },
    };
  } catch {
    return null;
  }
}

export function exportTavernStatusBar(statusBar: TavernStatusBarConfig): unknown {
  return statusBar.tavernNative?.raw ? clone(statusBar.tavernNative.raw) : clone(statusBar.raw);
}

export function getTavernStatusBarRegexScripts(statusBar: TavernStatusBarConfig): TavernRegexScript[] {
  return (statusBar.regexScripts || []).map(x => clone(x) as TavernRegexScript);
}

/**
 * Apply native ST regex scripts belonging to enabled status bars. Placement 2 is
 * the normal AI-output/display stage; the native regex runner handles markdownOnly,
 * promptOnly, trimStrings, depth and ordering.
 */
export function applyTavernStatusBars(text: string, statusBars: TavernStatusBarConfig[]): string {
  let value = text;
  for (const statusBar of statusBars) {
    if (!statusBar.enabled) continue;
    value = applyTavernRegex(value, getTavernStatusBarRegexScripts(statusBar), 'output');
  }
  return value.replace(/```html\s*([\s\S]*?)\s*```/gi, '$1');
}
