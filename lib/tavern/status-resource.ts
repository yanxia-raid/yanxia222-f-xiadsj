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
  const statusObject = findStatusObject(raw);
  if (statusObject) return { payload: statusObject, path: 'root' as const };
  // Character-card exports store the useful status/regex payload under data.extensions.
  if (isRecord(raw.data) && isRecord(raw.data.extensions)) {
    return { payload: raw.data, path: 'data' as const };
  }
  if (isRecord(raw.extensions)) {
    return { payload: raw, path: 'extensions' as const };
  }
  if (isRecord(raw.data)) {
    return { payload: raw.data, path: 'data' as const };
  }
  return { payload: raw, path: 'root' as const };
}

function sourceFormat(raw: Record<string, unknown>) {
  const dataSpec = isRecord(raw.data) ? String(raw.data.spec ?? '') : '';
  const spec = String(raw.spec ?? dataSpec ?? '');
  return spec || (isRecord(raw.data) ? 'tavern-card' : 'tavern-native');
}

function findTemplate(payload: Record<string, unknown>, raw: Record<string, unknown>): { value: string; key: string } {
  const keys = ['status_template', 'statusTemplate', 'status_format', 'statusFormat', 'statusBarTemplate', 'state_template', 'stateTemplate'];
  const sources: Array<Record<string, unknown>> = [];
  if (isRecord(payload.extensions)) sources.push(payload.extensions);
  sources.push(payload, raw);
  for (const source of sources) {
    for (const key of keys) {
      if (typeof source[key] === 'string') return { value: String(source[key]), key };
    }
  }
  return { value: '', key: keys[0] };
}

function findRegexKey(payload: Record<string, unknown>, raw: Record<string, unknown>): { value: Array<Record<string, unknown>>; key: string; target: Record<string, unknown> } {
  const candidates: Array<[Record<string, unknown>, string]> = [];
  if (isRecord(payload.extensions)) { candidates.push([payload.extensions, 'regex_scripts'], [payload.extensions, 'regexScripts']); }
  candidates.push([payload, 'regex_scripts'], [payload, 'regexScripts'], [raw, 'regex_scripts'], [raw, 'regexScripts']);
  const found = candidates.find(([obj, key]) => Array.isArray(obj[key]));
  if (found) return { value: clone(found[0][found[1]] as Array<Record<string, unknown>>), key: found[1], target: found[0] };
  const target = isRecord(payload.extensions) ? payload.extensions : payload;
  return { value: [], key: 'regex_scripts', target };
}

function collectRegex(payload: Record<string, unknown>, raw: Record<string, unknown>): Array<Record<string, unknown>> {
  const seen = new Set<Record<string, unknown>>();
  const queue: Record<string, unknown>[] = [raw, payload];
  const add = (value: unknown) => {
    if (isRecord(value) && !seen.has(value)) queue.push(value);
  };
  while (queue.length) {
    const obj = queue.shift()!;
    if (seen.has(obj)) continue;
    seen.add(obj);
    for (const key of ['regex_scripts', 'regexScripts', 'scripts']) {
      if (Array.isArray(obj[key])) {
        const rows = obj[key].filter(isRecord);
        if (rows.length) return clone(rows);
      }
    }
    add(obj.data);
    add(obj.extensions);
    add(obj.statusbar);
    add(obj.statusBar);
    add(obj.status_bar);
    add(obj.statusBarData);
    add(obj.status_bar_data);
  }
  return [];
}

function findStatusObject(raw: Record<string, unknown>): Record<string, unknown> | null {
  const keys = ['statusbar', 'statusBar', 'status_bar', 'status', 'state', 'statusBarData', 'status_bar_data'];
  for (const key of keys) {
    const value = raw[key];
    if (isRecord(value)) return value;
  }
  if (isRecord(raw.data)) {
    for (const key of keys) {
      const value = raw.data[key];
      if (isRecord(value)) return value;
    }
  }
  return null;
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
    const name = String((located.payload.name ?? raw.name ?? data.name ?? fallbackName));
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
      template: findTemplate(located.payload, raw).value,
      templateKey: findTemplate(located.payload, raw).key,
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

export function patchTavernStatusBar(statusBar: TavernStatusBarConfig, patch: Partial<TavernStatusBarConfig>): TavernStatusBarConfig {
  const next = clone(statusBar);
  if (typeof patch.name === 'string') next.name = patch.name;
  if (typeof patch.description === 'string') next.description = patch.description;
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (typeof patch.template === 'string') next.template = patch.template;
  if (Array.isArray(patch.regexScripts)) next.regexScripts = clone(patch.regexScripts);
  let raw = clone((next.tavernNative?.raw ?? next.raw) as any);
  if (!isRecord(raw)) raw = {};
  const located = locatePayload(raw);
  const payload = located.payload;
  const data = isRecord(raw.data) ? raw.data : null;
  const extensionTarget = isRecord(payload.extensions) ? payload.extensions : payload;
  if (typeof patch.name === 'string') {
    if (data && typeof data.name === 'string') data.name = patch.name;
    else raw.name = patch.name;
  }
  if (typeof patch.description === 'string') {
    if (data && typeof data.description === 'string') data.description = patch.description;
    else raw.description = patch.description;
  }
  if (typeof patch.template === 'string') extensionTarget[next.templateKey || 'status_template'] = patch.template;
  if (Array.isArray(patch.regexScripts)) {
    const regexKey = findRegexKey(payload, raw).key;
    extensionTarget[regexKey] = clone(patch.regexScripts);
  }
  next.raw = raw;
  next.tavernNative = next.tavernNative ? { ...next.tavernNative, raw: clone(raw) } : undefined;
  next.updatedAt = Date.now();
  return next;
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
  let value = String(text ?? '');
  for (const statusBar of statusBars) {
    if (!statusBar.enabled) continue;
    const scripts = getTavernStatusBarRegexScripts(statusBar);
    if (!scripts.length) continue;
    value = applyTavernRegex(value, scripts, 'output');
  }
  // Tavern status-bar replacements are commonly stored as fenced HTML in the
  // replaceString. The phone renders the resulting HTML directly, so remove
  // only the outer fence and keep the HTML/CSS/JS intact.
  return value.replace(/```(?:html)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
}
