import type { PresetConfig, Prompt, PromptOrderEntry, RegexConfig, RegexRule, WorldBookConfig, WorldBookEntry } from "./settings-types";

/**
 * Native Tavern/SillyTavern adapter.
 *
 * Important design rule:
 *   The internal models below are only a runtime projection.  The imported
 *   document itself remains the source of truth in tavernNative.raw.
 *   We only write back fields that the user actually changed.  This means an
 *   imported file keeps its own root wrapper, aliases, extra fields, prompt
 *   objects, entry objects, and future fields instead of being rewritten into
 *   our fixed phone schema.
 */
export type TavernNativeData = {
    kind: "worldbook" | "regex" | "preset";
    raw: unknown;
    payloadPath: "root" | "data" | "preset";
    entryShape?: "array" | "object";
    entryKeys?: Record<string, string>;
    ruleShape?: "array" | "object";
    ruleKeys?: Record<string, string>;
    baseline?: unknown;
    promptOrderShape?: "flat" | "profiles";
    promptOrderCharacterId?: number | string;
};

function clone<T>(value: T): T {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function numeric(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getPayload(raw: any, path: TavernNativeData["payloadPath"]): any {
    if (path === "data") return raw?.data;
    if (path === "preset") return raw?.preset;
    return raw;
}

function setPayload(raw: any, path: TavernNativeData["payloadPath"], payload: any): any {
    if (path === "data") return { ...raw, data: payload };
    if (path === "preset") return { ...raw, preset: payload };
    return payload;
}

function nativeMeta(value: any): TavernNativeData | undefined {
    return value?.tavernNative as TavernNativeData | undefined;
}

function equal(a: unknown, b: unknown): boolean {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function hasOwn(obj: any, key: string): boolean {
    return !!obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
}

function changed(current: unknown, baselineValue: unknown): boolean {
    return !equal(current, baselineValue);
}

function worldEditableSnapshot(e: WorldBookEntry): any {
    return {
        uid: e.uid, key: e.key, content: e.content, comment: e.comment,
        use_regex: e.use_regex, disable: e.disable, constant: e.constant,
        position: e.position, depth: e.depth, probability: e.probability,
        useProbability: e.useProbability, role: e.role,
        insertion_order: e.insertion_order,
        tavernSecondaryKeys: e.tavernSecondaryKeys, tavernSelectiveLogic: e.tavernSelectiveLogic,
        tavernCaseSensitive: e.tavernCaseSensitive, tavernMatchWholeWords: e.tavernMatchWholeWords,
        tavernGroup: e.tavernGroup, tavernGroupWeight: e.tavernGroupWeight, tavernOutlet: e.tavernOutlet,
        tavernCharacterFilter: e.tavernCharacterFilter, tavernCharacterFilterExclude: e.tavernCharacterFilterExclude,
        tavernTriggers: e.tavernTriggers, tavernExcludeRecursion: e.tavernExcludeRecursion,
        tavernPreventRecursion: e.tavernPreventRecursion, tavernDelayUntilRecursion: e.tavernDelayUntilRecursion,
        tavernRecursionLevel: e.tavernRecursionLevel, tavernPreventFurtherRecursion: e.tavernPreventFurtherRecursion,
    };
}

function worldBookSnapshot(book: WorldBookConfig): any {
    return {
        name: book.name,
        description: book.description ?? "",
        entries: book.entries.map(worldEditableSnapshot),
        tavernScanDepth: book.tavernScanDepth,
        tavernRecursiveScanning: book.tavernRecursiveScanning,
        tavernMaxRecursionSteps: book.tavernMaxRecursionSteps,
    };
}

function regexEditableSnapshot(r: RegexRule): any {
    return {
        id: r.id, scriptName: r.scriptName, findRegex: r.findRegex,
        replaceString: r.replaceString, tags: r.tags, trimStrings: r.trimStrings,
        disabled: r.disabled, placement: r.placement, markdownOnly: r.markdownOnly,
        promptOnly: r.promptOnly, runOnEdit: r.runOnEdit,
        substituteRegex: r.substituteRegex, minDepth: r.minDepth, maxDepth: r.maxDepth,
    };
}

function regexSnapshot(group: RegexConfig): any {
    return {
        name: group.name,
        description: group.description ?? "",
        rules: group.rules.map(regexEditableSnapshot),
    };
}

function promptSnapshot(p: Prompt): any {
    return {
        identifier: p.identifier, name: p.name, role: p.role, content: p.content,
        injection_depth: p.injection_depth, injection_order: p.injection_order,
        enabled: p.enabled, system_prompt: p.system_prompt, marker: p.marker,
        forbid_overrides: p.forbid_overrides, injection_position: p.injection_position,
        featureTag: p.featureTag, followUpOnly: p.followUpOnly, tags: p.tags,
    };
}

function presetSnapshot(p: PresetConfig): any {
    const out: any = {};
    for (const [key, value] of Object.entries(p)) {
        if (key === "id" || key === "createdAt" || key === "updatedAt" || key === "builtIn" || key === "builtInVersion" || key === "tavernNative") continue;
        if (value !== undefined) out[key] = key === "prompts"
            ? (p.prompts || []).map(promptSnapshot)
            : key === "prompt_order"
                ? (p.prompt_order || []).map(e => ({ ...e }))
                : clone(value);
    }
    return out;
}

function worldEntryFromNative(e: any, index: number): WorldBookEntry {
    const secondary = Array.isArray(e?.keysecondary)
        ? e.keysecondary.map(String)
        : Array.isArray(e?.secondary_keys) ? e.secondary_keys.map(String) : [];
    void secondary;
    const key = Array.isArray(e?.key) ? e.key.map(String).join(",") : String(e?.key ?? e?.keyword ?? "");
    return {
        uid: String(e?.uid ?? e?.id ?? `wb-entry-${Date.now()}-${index}`),
        key: key || (Array.isArray(e?.keys) ? e.keys.map(String).join(", ") : ""),
        content: String(e?.content ?? ""),
        comment: String(e?.comment ?? e?.name ?? ""),
        use_regex: Boolean(e?.use_regex ?? e?.isRegex ?? false),
        disable: Boolean(e?.disable ?? e?.disabled ?? e?.enabled === false),
        constant: Boolean(e?.constant ?? false),
        position: e?.position !== undefined
            ? (typeof e.position === "string" && /^\d+$/.test(e.position) ? Number(e.position) : e.position)
            : "before_char",
        depth: numeric(e?.depth ?? e?.insertion_depth, 0),
        probability: numeric(e?.probability, 100),
        useProbability: Boolean(e?.useProbability ?? (typeof e?.probability === "number")),
        role: numeric(e?.role, 0),
        insertion_order: numeric(e?.order ?? e?.insertion_order ?? e?.priority, 50),
        tavernSecondaryKeys: Array.isArray(e?.keysecondary) ? e.keysecondary.map(String) : Array.isArray(e?.secondary_keys) ? e.secondary_keys.map(String) : undefined,
        tavernSelectiveLogic: typeof e?.selectiveLogic === "number" ? e.selectiveLogic : undefined,
        tavernCaseSensitive: typeof e?.case_sensitive === "boolean" ? e.case_sensitive : typeof e?.caseSensitive === "boolean" ? e.caseSensitive : undefined,
        tavernMatchWholeWords: typeof e?.matchWholeWords === "boolean" ? e.matchWholeWords : undefined,
        tavernGroup: typeof e?.group === "string" ? e.group : typeof e?.group_name === "string" ? e.group_name : undefined,
        tavernGroupWeight: typeof e?.groupWeight === "number" ? e.groupWeight : typeof e?.group_weight === "number" ? e.group_weight : undefined,
        tavernOutlet: typeof e?.outlet === "string" ? e.outlet : typeof e?.outletName === "string" ? e.outletName : undefined,
        tavernCharacterFilter: Array.isArray(e?.characterFilter)
            ? e.characterFilter.map(String)
            : Array.isArray(e?.characterFilter?.names) ? e.characterFilter.names.map(String) : undefined,
        tavernCharacterFilterExclude: typeof e?.characterFilterExclude === "boolean"
            ? e.characterFilterExclude
            : typeof e?.characterFilter?.isExclude === "boolean" ? e.characterFilter.isExclude : undefined,
        tavernTriggers: Array.isArray(e?.triggers) ? e.triggers.map(String) : undefined,
        tavernExcludeRecursion: typeof e?.excludeRecursion === "boolean" ? e.excludeRecursion : undefined,
        tavernPreventRecursion: typeof e?.preventRecursion === "boolean" ? e.preventRecursion : typeof e?.preventFurtherRecursion === "boolean" ? e.preventFurtherRecursion : undefined,
        tavernDelayUntilRecursion: typeof e?.delayUntilRecursion === "boolean" ? e.delayUntilRecursion : undefined,
        tavernRecursionLevel: typeof e?.recursionLevel === "number" ? e.recursionLevel : undefined,
        tavernPreventFurtherRecursion: typeof e?.preventFurtherRecursion === "boolean" ? e.preventFurtherRecursion : undefined,
    };
}

function locateWorldBook(raw: any) {
    const candidates = [
        { payload: raw, path: "root" as const },
        { payload: raw?.data, path: "data" as const },
    ];
    for (const candidate of candidates) {
        const entries = candidate.payload?.entries;
        if (Array.isArray(entries)) return { ...candidate, entries, shape: "array" as const };
        if (entries && typeof entries === "object") return { ...candidate, entries: Object.values(entries), shape: "object" as const };
    }
    return null;
}

export function parseTavernWorldBook(text: string, fallbackName = "导入的世界书"): WorldBookConfig | null {
    try {
        const raw = JSON.parse(text);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const located = locateWorldBook(raw);
        if (!located) return null;
        const payload = located.payload;
        const now = Date.now();
        const book = {
            id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: String(payload?.name ?? raw.name ?? fallbackName),
            description: String(payload?.description ?? ""),
            createdAt: now,
            updatedAt: now,
            entries: located.entries.map(worldEntryFromNative),
            tavernScanDepth: typeof payload?.scan_depth === "number" ? payload.scan_depth : typeof payload?.scanDepth === "number" ? payload.scanDepth : undefined,
            tavernRecursiveScanning: typeof payload?.recursive_scanning === "boolean" ? payload.recursive_scanning : typeof payload?.recursiveScan === "boolean" ? payload.recursiveScan : undefined,
            tavernMaxRecursionSteps: typeof payload?.max_recursion_steps === "number" ? payload.max_recursion_steps : typeof payload?.maxRecursionSteps === "number" ? payload.maxRecursionSteps : undefined,
        } as WorldBookConfig;
        book.tavernNative = {
            kind: "worldbook",
            raw: clone(raw),
            payloadPath: located.path,
            entryShape: located.shape,
            entryKeys: located.shape === "object"
                ? Object.fromEntries(Object.entries(payload.entries).map(([k, e]: [string, any]) => [String(e?.uid ?? e?.id ?? k), k]))
                : undefined,
            baseline: worldBookSnapshot(book),
        };
        return book;
    } catch {
        return null;
    }
}

function nativeWorldEntry(current: WorldBookEntry, original?: any, baseline?: any): any {
    const out = original && typeof original === "object" ? clone(original) : {};
    const base = baseline || {};
    if (!original || changed(current.uid, base.uid)) out.uid = current.uid;
    if (!original || changed(current.key, base.key)) {
        if (hasOwn(out, "keys") && !hasOwn(out, "key")) out.keys = String(current.key).split(/\s*,\s*/).filter(Boolean);
        else out.key = current.key;
    }
    if (!original || changed(current.content, base.content)) out.content = current.content;
    if (!original || changed(current.comment, base.comment)) out.comment = current.comment;
    if (!original || changed(current.use_regex, base.use_regex)) out.use_regex = current.use_regex;
    if (!original || changed(current.disable, base.disable)) out.disable = current.disable;
    if (!original || changed(current.constant, base.constant)) out.constant = current.constant;
    if (!original || changed(current.position, base.position)) out.position = current.position;
    if (!original || changed(current.depth, base.depth)) out.depth = current.depth;
    if (!original || changed(current.probability, base.probability)) out.probability = current.probability;
    if (!original || changed(current.useProbability, base.useProbability)) out.useProbability = current.useProbability;
    if (!original || changed(current.role, base.role)) out.role = current.role;
    if (!original || changed(current.insertion_order, base.insertion_order)) {
        if (hasOwn(out, "insertion_order") && !hasOwn(out, "order")) out.insertion_order = current.insertion_order;
        else if (hasOwn(out, "priority") && !hasOwn(out, "order")) out.priority = current.insertion_order;
        else out.order = current.insertion_order;
    }
    const semanticFields: Array<[keyof WorldBookEntry, string]> = [
        ["tavernSecondaryKeys", hasOwn(out, "keysecondary") ? "keysecondary" : hasOwn(out, "secondary_keys") ? "secondary_keys" : "keysecondary"],
        ["tavernSelectiveLogic", "selectiveLogic"], ["tavernCaseSensitive", hasOwn(out, "caseSensitive") ? "caseSensitive" : "case_sensitive"],
        ["tavernMatchWholeWords", "matchWholeWords"], ["tavernGroup", hasOwn(out, "groupName") ? "groupName" : "group"],
        ["tavernGroupWeight", hasOwn(out, "group_weight") ? "group_weight" : "groupWeight"], ["tavernOutlet", hasOwn(out, "outletName") ? "outletName" : "outlet"],
        ["tavernCharacterFilter", "characterFilter"], ["tavernCharacterFilterExclude", "characterFilterExclude"],
        ["tavernTriggers", "triggers"], ["tavernExcludeRecursion", "excludeRecursion"], ["tavernPreventRecursion", "preventRecursion"],
        ["tavernDelayUntilRecursion", "delayUntilRecursion"], ["tavernRecursionLevel", "recursionLevel"], ["tavernPreventFurtherRecursion", "preventFurtherRecursion"],
    ];
    for (const [internalKey, nativeKey] of semanticFields) {
        const value = (current as any)[internalKey]; const baseValue = (base as any)[internalKey];
        if (changed(value, baseValue) && value !== undefined) out[nativeKey] = clone(value);
    }
    return out;
}

export function exportTavernWorldBook(book: WorldBookConfig): any {
    const meta = nativeMeta(book);
    const raw = meta?.raw ? clone(meta.raw) : null;
    if (!raw || meta?.kind !== "worldbook") {
        return {
            name: book.name,
            description: book.description ?? "",
            entries: Object.fromEntries(book.entries.map(e => [e.uid, nativeWorldEntry(e)])),
        };
    }
    if (meta.baseline && equal(worldBookSnapshot(book), meta.baseline)) return raw;

    const payload = getPayload(raw, meta.payloadPath);
    const originalEntries = payload?.entries;
    const originalList = Array.isArray(originalEntries)
        ? originalEntries
        : originalEntries && typeof originalEntries === "object" ? Object.values(originalEntries) : [];
    const baseEntries = Array.isArray((meta.baseline as any)?.entries) ? (meta.baseline as any).entries : [];
    const byUid = new Map(originalList.map((e: any) => [String(e?.uid ?? e?.id), e]));
    const baseByUid = new Map(baseEntries.map((e: any) => [String(e?.uid), e]));
    const nextEntries = book.entries.map(e => nativeWorldEntry(e, byUid.get(String(e.uid)), baseByUid.get(String(e.uid))));
    const nextPayload = { ...payload };
    if (changed(book.name, (meta.baseline as any)?.name) || hasOwn(payload, "name")) nextPayload.name = book.name;
    if (changed(book.description ?? "", (meta.baseline as any)?.description) || hasOwn(payload, "description")) nextPayload.description = book.description ?? "";
    if (hasOwn(payload, "scan_depth") && changed(book.tavernScanDepth, (meta.baseline as any)?.tavernScanDepth)) nextPayload.scan_depth = book.tavernScanDepth;
    else if (hasOwn(payload, "scanDepth") && changed(book.tavernScanDepth, (meta.baseline as any)?.tavernScanDepth)) nextPayload.scanDepth = book.tavernScanDepth;
    if (hasOwn(payload, "recursive_scanning") && changed(book.tavernRecursiveScanning, (meta.baseline as any)?.tavernRecursiveScanning)) nextPayload.recursive_scanning = book.tavernRecursiveScanning;
    else if (hasOwn(payload, "recursiveScan") && changed(book.tavernRecursiveScanning, (meta.baseline as any)?.tavernRecursiveScanning)) nextPayload.recursiveScan = book.tavernRecursiveScanning;
    if (hasOwn(payload, "max_recursion_steps") && changed(book.tavernMaxRecursionSteps, (meta.baseline as any)?.tavernMaxRecursionSteps)) nextPayload.max_recursion_steps = book.tavernMaxRecursionSteps;
    else if (hasOwn(payload, "maxRecursionSteps") && changed(book.tavernMaxRecursionSteps, (meta.baseline as any)?.tavernMaxRecursionSteps)) nextPayload.maxRecursionSteps = book.tavernMaxRecursionSteps;
    nextPayload.entries = meta.entryShape === "array"
        ? nextEntries
        : Object.fromEntries(nextEntries.map((e: any) => [meta.entryKeys?.[String(e.uid)] ?? String(e.uid), e]));
    return setPayload(raw, meta.payloadPath, nextPayload);
}

function regexRuleFromNative(r: any, index: number): RegexRule {
    const placement = Array.isArray(r?.placement) && r.placement.length
        ? r.placement.map(Number).filter(Number.isFinite)
        : [1];
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

function locateRegex(raw: any) {
    if (Array.isArray(raw)) return { payload: raw, path: "root" as const, rules: raw, shape: "array" as const };
    const candidates = [
        { payload: raw, path: "root" as const },
        { payload: raw?.data, path: "data" as const },
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate.payload?.rules)) return { ...candidate, rules: candidate.payload.rules, shape: "array" as const };
        if (candidate.payload?.rules && typeof candidate.payload.rules === "object") return { ...candidate, rules: Object.values(candidate.payload.rules), shape: "object" as const };
    }
    if (raw && typeof raw === "object" && (raw.findRegex || raw.scriptName)) {
        return { payload: raw, path: "root" as const, rules: [raw], shape: "array" as const };
    }
    return null;
}

export function parseTavernRegex(text: string, fallbackName = "导入的正则组"): RegexConfig | null {
    try {
        const raw = JSON.parse(text);
        const located = locateRegex(raw);
        if (!located) return null;
        const now = Date.now();
        const group = {
            id: `regex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: String(located.payload?.name ?? fallbackName),
            description: String(located.payload?.description ?? ""),
            createdAt: now,
            updatedAt: now,
            rules: located.rules.map(regexRuleFromNative),
        } as RegexConfig;
        group.tavernNative = {
            kind: "regex",
            raw: clone(raw),
            payloadPath: located.path,
            ruleShape: located.shape,
            ruleKeys: located.shape === "object"
                ? Object.fromEntries(Object.entries(located.payload.rules).map(([k, r]: [string, any]) => [String(r?.id ?? k), k]))
                : undefined,
            baseline: regexSnapshot(group),
        };
        return group;
    } catch {
        return null;
    }
}

function nativeRegexRule(current: RegexRule, original?: any, baseline?: any): any {
    const out = original && typeof original === "object" ? clone(original) : {};
    const base = baseline || {};
    const set = (key: string, value: unknown) => {
        if (!original || changed(value, base[key])) out[key] = clone(value);
    };
    set("id", current.id);
    set("scriptName", current.scriptName);
    set("findRegex", current.findRegex);
    set("replaceString", current.replaceString);
    if (current.tags !== undefined || hasOwn(out, "tags")) set("tags", current.tags);
    if (current.trimStrings !== undefined || hasOwn(out, "trimStrings")) set("trimStrings", current.trimStrings);
    set("disabled", current.disabled);
    set("placement", current.placement);
    if (current.markdownOnly !== undefined || hasOwn(out, "markdownOnly")) set("markdownOnly", current.markdownOnly);
    if (current.promptOnly !== undefined || hasOwn(out, "promptOnly")) set("promptOnly", current.promptOnly);
    if (current.runOnEdit !== undefined || hasOwn(out, "runOnEdit")) set("runOnEdit", current.runOnEdit);
    if (current.substituteRegex !== undefined || hasOwn(out, "substituteRegex")) set("substituteRegex", current.substituteRegex);
    if (current.minDepth !== undefined || hasOwn(out, "minDepth")) set("minDepth", current.minDepth);
    if (current.maxDepth !== undefined || hasOwn(out, "maxDepth")) set("maxDepth", current.maxDepth);
    return out;
}

export function exportTavernRegex(group: RegexConfig): any {
    const meta = nativeMeta(group);
    const raw = meta?.raw ? clone(meta.raw) : null;
    if (!raw || meta?.kind !== "regex") return group.rules.map(r => nativeRegexRule(r));
    if (meta.baseline && equal(regexSnapshot(group), meta.baseline)) return raw;

    if (meta.payloadPath === "root" && Array.isArray(raw)) {
        const baseRules = Array.isArray((meta.baseline as any)?.rules) ? (meta.baseline as any).rules : [];
        const byId = new Map(raw.map((r: any) => [String(r?.id), r]));
        const baseById = new Map(baseRules.map((r: any) => [String(r?.id), r]));
        return group.rules.map(r => nativeRegexRule(r, byId.get(String(r.id)), baseById.get(String(r.id))));
    }
    const payload = getPayload(raw, meta.payloadPath);
    const originalRules = Array.isArray(payload?.rules)
        ? payload.rules
        : payload?.rules && typeof payload.rules === "object" ? Object.values(payload.rules) : [];
    const baseRules = Array.isArray((meta.baseline as any)?.rules) ? (meta.baseline as any).rules : [];
    const byId = new Map(originalRules.map((r: any) => [String(r?.id), r]));
    const baseById = new Map(baseRules.map((r: any) => [String(r?.id), r]));
    const nextRules = group.rules.map(r => nativeRegexRule(r, byId.get(String(r.id)), baseById.get(String(r.id))));
    const nextPayload = { ...payload };
    if (hasOwn(payload, "name") || changed(group.name, (meta.baseline as any)?.name)) nextPayload.name = group.name;
    if (hasOwn(payload, "description") || changed(group.description ?? "", (meta.baseline as any)?.description)) nextPayload.description = group.description ?? "";
    nextPayload.rules = meta.ruleShape === "array"
        ? nextRules
        : Object.fromEntries(nextRules.map((r: any) => [meta.ruleKeys?.[String(r.id)] ?? String(r.id), r]));
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
        injection_trigger: Array.isArray(p?.injection_trigger) ? clone(p.injection_trigger) : undefined,
    };
}

function locatePreset(raw: any) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (raw.preset && typeof raw.preset === "object") return { payload: raw.preset, path: "preset" as const };
    if (raw.data && typeof raw.data === "object" && (Array.isArray(raw.data.prompts) || Array.isArray(raw.data.prompt_order))) {
        return { payload: raw.data, path: "data" as const };
    }
    return { payload: raw, path: "root" as const };
}

export function parseTavernPreset(text: string, fallbackName = "导入的预设"): PresetConfig | null {
    try {
        const raw = JSON.parse(text);
        const located = locatePreset(raw);
        if (!located) return null;
        const obj = located.payload;
        const now = Date.now();
        const prompts = Array.isArray(obj.prompts) ? obj.prompts.map(promptFromNative) : [];
        const preset = {
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
            prompt_order: (() => {
                if (Array.isArray(obj.prompt_order)) {
                    const flat = obj.prompt_order.filter((e: any) => e && typeof e === "object" && typeof e.identifier === "string");
                    if (flat.length) return flat.map((e: any) => ({ identifier: String(e.identifier), enabled: e.enabled !== false }));
                    const profile = obj.prompt_order.find((e: any) => Array.isArray(e?.order));
                    if (profile) return profile.order.map((e: any) => ({ identifier: String(e?.identifier ?? ""), enabled: e?.enabled !== false })).filter((e: PromptOrderEntry) => e.identifier);
                }
                return prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled }));
            })(),
        } as PresetConfig;
        preset.tavernNative = {
            kind: "preset",
            raw: clone(raw),
            payloadPath: located.path,
            baseline: presetSnapshot(preset),
            promptOrderShape: Array.isArray(obj.prompt_order) && obj.prompt_order.some((e: any) => Array.isArray(e?.order)) ? "profiles" : "flat",
            promptOrderCharacterId: Array.isArray(obj.prompt_order) ? obj.prompt_order.find((e: any) => Array.isArray(e?.order))?.character_id : undefined,
        };
        return preset;
    } catch {
        return null;
    }
}

function nativePrompt(current: Prompt, original?: any, baseline?: any): any {
    const out = original && typeof original === "object" ? clone(original) : {};
    const base = baseline || {};
    const keys = ["identifier", "name", "role", "content", "injection_depth", "injection_order", "enabled", "system_prompt", "marker", "forbid_overrides", "injection_position", "featureTag", "followUpOnly", "tags", "injection_trigger"];
    for (const key of keys) {
        const value = (current as any)[key];
        if (!original || changed(value, base[key]) || hasOwn(out, key)) {
            if (value !== undefined) out[key] = clone(value);
            else if (hasOwn(out, key) && changed(value, base[key])) delete out[key];
        }
    }
    return out;
}

export function exportTavernPreset(preset: PresetConfig): any {
    const meta = nativeMeta(preset);
    const raw = meta?.raw ? clone(meta.raw) : null;
    const payload = raw && meta?.kind === "preset" ? getPayload(raw, meta.payloadPath) : {};
    if (raw && meta?.kind === "preset" && meta.baseline && equal(presetSnapshot(preset), meta.baseline)) return raw;

    const next: any = { ...payload };
    const internalOnly = new Set(["id", "createdAt", "updatedAt", "builtIn", "builtInVersion", "tavernNative", "prompts", "prompt_order"]);
    const baselinePreset: any = meta?.baseline || {};
    for (const [key, value] of Object.entries(preset)) {
        if (internalOnly.has(key) || value === undefined) continue;
        // Do not manufacture our normalized/default fields in a native file.
        // Only write a field if the source had it, or the user actually changed it.
        if (hasOwn(payload, key) || changed(value, baselinePreset[key])) next[key] = clone(value);
    }
    if (hasOwn(payload, "name") || changed(preset.name, baselinePreset.name)) next.name = preset.name;
    if (hasOwn(payload, "description") || changed(preset.description ?? "", baselinePreset.description)) next.description = preset.description ?? "";

    const originalPrompts = Array.isArray(payload?.prompts) ? payload.prompts : [];
    const basePrompts = Array.isArray((meta?.baseline as any)?.prompts) ? (meta?.baseline as any).prompts : [];
    const originalById = new Map(originalPrompts.map((x: any) => [String(x?.identifier ?? x?.name), x]));
    const baseById = new Map(basePrompts.map((x: any) => [String(x?.identifier), x]));
    next.prompts = preset.prompts.map(p => nativePrompt(p, originalById.get(String(p.identifier)), baseById.get(String(p.identifier))));

    const nextOrder = preset.prompt_order ?? preset.prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled }));
    if (hasOwn(payload, "prompt_order") || !Array.isArray(payload?.prompts)) {
        if (meta?.promptOrderShape === "profiles") {
            const originalProfiles = Array.isArray(payload.prompt_order) ? payload.prompt_order : [];
            const originalProfile = originalProfiles.find((e: any) => Array.isArray(e?.order));
            const profile = originalProfile ? clone(originalProfile) : { character_id: meta.promptOrderCharacterId ?? 100000, order: [] };
            profile.character_id = meta.promptOrderCharacterId ?? profile.character_id;
            profile.order = nextOrder.map(e => ({ ...e }));
            // Keep every other profile exactly as imported. Replace only the active profile.
            if (originalProfile) {
                next.prompt_order = originalProfiles.map((e: any) => e === originalProfile ? profile : clone(e));
            } else {
                next.prompt_order = [...originalProfiles.map((e: any) => clone(e)), profile];
            }
        } else {
            next.prompt_order = nextOrder.map(e => ({ ...e }));
        }
    }
    return raw && meta?.kind === "preset" ? setPayload(raw, meta.payloadPath, next) : next;
}
