import type { PresetConfig, Prompt, PromptOrderEntry, RegexConfig, RegexRule, WorldBookConfig, WorldBookEntry } from "./settings-types";

/**
 * Native SillyTavern/Tavern import bridge.
 *
 * The app keeps its own stable `id` for bindings, while the original Tavern
 * payload is retained separately so unknown/future fields are not discarded.
 */
export const TAVERN_NATIVE_META = "__tavernNative";

type NativeMeta = {
    kind: "worldbook" | "regex" | "preset";
    raw: any;
    payloadPath: "root" | "data" | "preset";
    entryShape?: "array" | "object";
    ruleShape?: "array" | "object";
};

function clone<T>(value: T): T {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function attach<T extends object>(value: T, meta: NativeMeta): T {
    Object.defineProperty(value, TAVERN_NATIVE_META, {
        value: meta,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return value;
}

function getPayload(raw: any, path: NativeMeta["payloadPath"]): any {
    if (path === "data") return raw?.data;
    if (path === "preset") return raw?.preset;
    return raw;
}

function setPayload(raw: any, path: NativeMeta["payloadPath"], payload: any): any {
    if (path === "data") return { ...raw, data: payload };
    if (path === "preset") return { ...raw, preset: payload };
    return payload;
}

function getNativeMeta(value: any): NativeMeta | undefined {
    return value?.[TAVERN_NATIVE_META] as NativeMeta | undefined;
}

function numeric(value: any, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function worldEntryFromNative(e: any, index: number): WorldBookEntry {
    const key = Array.isArray(e?.key)
        ? e.key.join(",")
        : String(e?.key ?? e?.keyword ?? "");
    const secondary = Array.isArray(e?.secondary_keys)
        ? e.secondary_keys.map(String)
        : Array.isArray(e?.keysecondary) ? e.keysecondary.map(String) : [];
    return {
        uid: String(e?.uid ?? e?.id ?? `wb-entry-${Date.now()}-${index}`),
        key: key || (Array.isArray(e?.keys) ? e.keys.map(String).join(", ") : ""),
        content: String(e?.content ?? ""),
        comment: String(e?.comment ?? e?.name ?? ""),
        use_regex: Boolean(e?.use_regex ?? e?.isRegex ?? false),
        disable: Boolean(e?.disable ?? e?.disabled ?? (e?.enabled === false)),
        constant: Boolean(e?.constant ?? false),
        position: e?.position !== undefined
            ? (typeof e.position === "string" && /^\d+$/.test(e.position) ? Number(e.position) : e.position)
            : "before_char",
        depth: numeric(e?.depth ?? e?.insertion_depth, 0),
        probability: numeric(e?.probability, 100),
        useProbability: Boolean(e?.useProbability ?? (typeof e?.probability === "number")),
        role: numeric(e?.role, 0),
        insertion_order: numeric(e?.order ?? e?.insertion_order ?? e?.priority, 50),
        ...(secondary.length ? { tavernSecondaryKeys: secondary } : {}),
        ...(typeof e?.selective === "boolean" ? { tavernSelective: e.selective } : {}),
        ...(typeof e?.case_sensitive === "boolean" ? { tavernCaseSensitive: e.case_sensitive } : {}),
        ...(typeof e?.selectiveLogic === "number" ? { tavernSelectiveLogic: e.selectiveLogic } : {}),
        ...(typeof e?.group === "string" ? { tavernGroup: e.group } : {}),
        ...(e?.extensions && typeof e.extensions === "object" ? { tavernExtensions: clone(e.extensions) } : {}),
    } as WorldBookEntry;
}

function locateWorldBook(raw: any): { payload: any; path: NativeMeta["payloadPath"]; entries: any[]; shape: "array" | "object" } | null {
    const candidates: Array<{ payload: any; path: NativeMeta["payloadPath"] }> = [
        { payload: raw, path: "root" },
        { payload: raw?.data, path: "data" },
    ];
    for (const candidate of candidates) {
        const entries = candidate.payload?.entries;
        if (Array.isArray(entries)) return { ...candidate, entries, shape: "array" };
        if (entries && typeof entries === "object") return { ...candidate, entries: Object.values(entries), shape: "object" };
    }
    return null;
}

export function parseTavernWorldBook(text: string, fallbackName = "导入的世界书"): WorldBookConfig | null {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const located = locateWorldBook(raw);
    if (!located) return null;

    const payload = located.payload;
    const entries = located.entries.map((e, i) => worldEntryFromNative(e, i));
    const now = Date.now();
    const book = {
        id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: String(payload.name ?? raw.name ?? fallbackName),
        description: String(payload.description ?? ""),
        createdAt: now,
        updatedAt: now,
        entries,
    } as WorldBookConfig;
    return attach(book, { kind: "worldbook", raw: clone(raw), payloadPath: located.path, entryShape: located.shape });
}

function nativeWorldEntryFromInternal(current: WorldBookEntry, original?: any): any {
    const out = original && typeof original === "object" ? { ...clone(original) } : {};
    out.uid = current.uid;
    out.key = current.key;
    out.content = current.content;
    out.comment = current.comment;
    out.use_regex = current.use_regex;
    out.disable = current.disable;
    out.constant = current.constant;
    out.position = current.position;
    out.depth = current.depth;
    out.probability = current.probability;
    out.useProbability = current.useProbability;
    out.role = current.role;
    out.order = current.insertion_order;
    return out;
}

export function exportTavernWorldBook(book: WorldBookConfig): any {
    const meta = getNativeMeta(book);
    const raw = meta?.raw ? clone(meta.raw) : null;
    if (!raw || meta?.kind !== "worldbook") {
        return {
            name: book.name,
            description: book.description ?? "",
            entries: Object.fromEntries(book.entries.map(e => [e.uid, nativeWorldEntryFromInternal(e)])),
        };
    }

    const payload = getPayload(raw, meta.payloadPath);
    const originalEntries = payload?.entries;
    const originalList = Array.isArray(originalEntries)
        ? originalEntries
        : originalEntries && typeof originalEntries === "object" ? Object.values(originalEntries) : [];
    const byUid = new Map(originalList.map((e: any) => [String(e?.uid ?? e?.id), e]));
    const nextEntries = book.entries.map(e => nativeWorldEntryFromInternal(e, byUid.get(String(e.uid))));
    const nextPayload = { ...payload, name: book.name, description: book.description ?? "" };
    nextPayload.entries = meta.entryShape === "array"
        ? nextEntries
        : Object.fromEntries(nextEntries.map((e: any) => [String(e.uid), e]));
    return setPayload(raw, meta.payloadPath, nextPayload);
}

function regexRuleFromNative(r: any, index: number): RegexRule {
    let placement = Array.isArray(r?.placement) ? r.placement.map(Number).filter(Number.isFinite) : [];
    if (placement.length === 0) placement = [1];
    return {
        id: String(r?.id ?? `regex-rule-${Date.now()}-${index}`),
        scriptName: String(r?.scriptName ?? r?.name ?? "未命名规则"),
        findRegex: String(r?.findRegex ?? r?.regex ?? ""),
        replaceString: String(r?.replaceString ?? r?.replace ?? ""),
        tags: Array.isArray(r?.tags) ? r.tags.map(String) : undefined,
        trimStrings: Array.isArray(r?.trimStrings) ? r.trimStrings.map(String) : undefined,
        disabled: Boolean(r?.disabled ?? false),
        placement,
        markdownOnly: r?.markdownOnly === true ? true : undefined,
        promptOnly: r?.promptOnly === true ? true : undefined,
        runOnEdit: r?.runOnEdit === true ? true : undefined,
        substituteRegex: typeof r?.substituteRegex === "number" ? r.substituteRegex : undefined,
        minDepth: typeof r?.minDepth === "number" ? r.minDepth : undefined,
        maxDepth: typeof r?.maxDepth === "number" ? r.maxDepth : undefined,
    };
}

function locateRegex(raw: any): { payload: any; path: NativeMeta["payloadPath"]; rules: any[]; shape: "array" | "object" } | null {
    if (Array.isArray(raw)) return { payload: raw, path: "root", rules: raw, shape: "array" };
    const candidates: Array<{ payload: any; path: NativeMeta["payloadPath"] }> = [
        { payload: raw, path: "root" },
        { payload: raw?.data, path: "data" },
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate.payload?.rules)) return { ...candidate, rules: candidate.payload.rules, shape: "array" };
        if (candidate.payload?.rules && typeof candidate.payload.rules === "object") return { ...candidate, rules: Object.values(candidate.payload.rules), shape: "object" };
    }
    if (raw && typeof raw === "object" && (raw.findRegex || raw.scriptName)) return { payload: raw, path: "root", rules: [raw], shape: "array" };
    return null;
}

export function parseTavernRegex(text: string, fallbackName = "导入的正则组"): RegexConfig | null {
    const raw = JSON.parse(text);
    const located = locateRegex(raw);
    if (!located) return null;
    const payload = located.payload;
    const sourceRules = located.rules;
    const now = Date.now();
    const group = {
        id: `regex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: String(payload?.name ?? fallbackName),
        description: String(payload?.description ?? ""),
        createdAt: now,
        updatedAt: now,
        rules: sourceRules.map(regexRuleFromNative),
    } as RegexConfig;
    return attach(group, { kind: "regex", raw: clone(raw), payloadPath: located.path, ruleShape: located.shape });
}

function nativeRegexRuleFromInternal(current: RegexRule, original?: any): any {
    const out = original && typeof original === "object" ? { ...clone(original) } : {};
    out.id = current.id;
    out.scriptName = current.scriptName;
    out.findRegex = current.findRegex;
    out.replaceString = current.replaceString;
    out.tags = current.tags;
    out.trimStrings = current.trimStrings;
    out.disabled = current.disabled;
    out.placement = current.placement;
    out.markdownOnly = current.markdownOnly;
    out.promptOnly = current.promptOnly;
    out.runOnEdit = current.runOnEdit;
    out.substituteRegex = current.substituteRegex;
    out.minDepth = current.minDepth;
    out.maxDepth = current.maxDepth;
    return out;
}

export function exportTavernRegex(group: RegexConfig): any {
    const meta = getNativeMeta(group);
    const raw = meta?.raw ? clone(meta.raw) : null;
    if (!raw || meta?.kind !== "regex") {
        return group.rules.map(r => nativeRegexRuleFromInternal(r));
    }
    if (meta.payloadPath === "root" && Array.isArray(raw)) {
        const byId = new Map(raw.map((r: any) => [String(r?.id), r]));
        return group.rules.map(r => nativeRegexRuleFromInternal(r, byId.get(String(r.id))));
    }
    const payload = getPayload(raw, meta.payloadPath);
    const originalRules = Array.isArray(payload?.rules)
        ? payload.rules
        : payload?.rules && typeof payload.rules === "object" ? Object.values(payload.rules) : [];
    const byId = new Map(originalRules.map((r: any) => [String(r?.id), r]));
    const nextRules = group.rules.map(r => nativeRegexRuleFromInternal(r, byId.get(String(r.id))));
    const nextPayload = { ...payload, name: group.name, description: group.description ?? "" };
    nextPayload.rules = meta.ruleShape === "array" ? nextRules : Object.fromEntries(nextRules.map((r: any) => [String(r.id), r]));
    return setPayload(raw, meta.payloadPath, nextPayload);
}

function promptFromNative(p: any, index: number): Prompt {
    return {
        identifier: String(p?.identifier ?? p?.name ?? `prompt_${Date.now()}_${index}`),
        name: String(p?.name ?? p?.identifier ?? "未命名"),
        role: String(p?.role ?? "system"),
        content: String(p?.content ?? ""),
        injection_depth: numeric(p?.injection_depth, 0),
        injection_order: typeof p?.injection_order === "number" ? p.injection_order : undefined,
        enabled: p?.enabled !== false,
        system_prompt: p?.system_prompt === true ? true : undefined,
        marker: p?.marker === true ? true : undefined,
        forbid_overrides: p?.forbid_overrides === true ? true : undefined,
        injection_position: typeof p?.injection_position === "number" ? p.injection_position : undefined,
        featureTag: typeof p?.featureTag === "string" ? p.featureTag : undefined,
        followUpOnly: p?.followUpOnly === true ? true : undefined,
        tags: Array.isArray(p?.tags) ? p.tags.map(String) : undefined,
    };
}

function locatePreset(raw: any): { payload: any; path: NativeMeta["payloadPath"] } | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (Array.isArray(raw.prompts) || Array.isArray(raw.prompt_order)) return { payload: raw, path: "root" };
    if (raw.preset && typeof raw.preset === "object") return { payload: raw.preset, path: "preset" };
    if (raw.data && typeof raw.data === "object" && (Array.isArray(raw.data.prompts) || Array.isArray(raw.data.prompt_order))) return { payload: raw.data, path: "data" };
    return { payload: raw, path: "root" };
}

export function parseTavernPreset(text: string, fallbackName = "导入的预设"): PresetConfig | null {
    const raw = JSON.parse(text);
    const located = locatePreset(raw);
    if (!located) return null;
    const obj = located.payload;
    const now = Date.now();
    const prompts = Array.isArray(obj.prompts) ? obj.prompts.map(promptFromNative) : [];
    const preset: any = {
        ...clone(obj),
        id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: String(obj.name ?? fallbackName),
        description: String(obj.description ?? ""),
        createdAt: now,
        updatedAt: now,
        temperature: numeric(obj.temperature, 0.7),
        top_p: numeric(obj.top_p, 1),
        top_k: numeric(obj.top_k, 0),
        frequency_penalty: numeric(obj.frequency_penalty, 0),
        presence_penalty: numeric(obj.presence_penalty, 0),
        repetition_penalty: numeric(obj.repetition_penalty, 1),
        openai_max_tokens: numeric(obj.openai_max_tokens, 0),
        openai_max_context: numeric(obj.openai_max_context, 100000),
        prompts,
        prompt_order: Array.isArray(obj.prompt_order)
            ? obj.prompt_order.map((e: any) => ({ identifier: String(e?.identifier ?? ""), enabled: e?.enabled !== false })).filter((e: PromptOrderEntry) => e.identifier)
            : prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled })),
    } as PresetConfig;
    return attach(preset, { kind: "preset", raw: clone(raw), payloadPath: located.path });
}

export function exportTavernPreset(preset: PresetConfig): any {
    const meta = getNativeMeta(preset);
    const raw = meta?.raw ? clone(meta.raw) : null;
    const current: any = { ...preset };
    delete current.id;
    delete current.createdAt;
    delete current.updatedAt;
    delete current.builtIn;
    delete current.builtInVersion;
    delete current[TAVERN_NATIVE_META];

    const payload = raw && meta?.kind === "preset" ? getPayload(raw, meta.payloadPath) : {};
    const next: any = { ...payload };
    for (const [key, value] of Object.entries(current)) {
        if (value !== undefined) next[key] = clone(value);
    }
    next.name = preset.name;
    next.prompts = preset.prompts.map(p => {
        const original = Array.isArray(payload?.prompts)
            ? payload.prompts.find((x: any) => String(x?.identifier ?? x?.name) === String(p.identifier))
            : undefined;
        const out = original && typeof original === "object" ? { ...clone(original) } : {};
        Object.assign(out, clone(p));
        delete out.featureTag;
        delete out.followUpOnly;
        return out;
    });
    next.prompt_order = (preset.prompt_order ?? preset.prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled }))).map(e => ({ ...e }));
    return raw && meta?.kind === "preset" ? setPayload(raw, meta.payloadPath, next) : next;
}
