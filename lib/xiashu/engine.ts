import { loadCharacters } from "@/lib/character-storage";
import { loadApiConfigs, loadBindingConfig, loadPresets, loadRegexes, loadTavernStatusBars, loadWorldBooks, resolveBinding } from "@/lib/settings-storage";
import { buildAdaptiveTavernPrompt } from "@/lib/tavern/adaptive";
import { applyTavernStatusBars } from "@/lib/tavern/status-resource";
import { applyAllOutputRegex } from "@/lib/llm-prompt-assembler";
import { sendLLMRequest } from "@/lib/chat-engine";
import type { LLMMessage } from "@/lib/llm-prompt-assembler";
import type { XiaShuMessage } from "./types";
import { loadCharacterWorldGroups } from "@/lib/character-world-storage";

export function getXiaShuCharacters(ids: string[]) { const all = loadCharacters(); return ids.map(id => all.find(c => c.id === id)).filter(Boolean) as ReturnType<typeof loadCharacters>; }

export function getXiaShuResources(characterIds: string[]) {
  const bindings = loadBindingConfig(); const regexes = loadRegexes(); const statusBars = loadTavernStatusBars();
  const regexIds = new Set<string>(); const status: Record<string,string> = {};
  for (const characterId of characterIds) {
    const slot = resolveBinding(bindings, characterId, "story");
    (slot.regexIds || []).forEach(id => regexIds.add(id));
    if (slot.statusBarId) status[characterId] = slot.statusBarId;
    const char = loadCharacters().find(c => c.id === characterId);
    if (char?.tavernResources?.regexId) regexIds.add(char.tavernResources.regexId);
    if (char?.tavernResources?.statusBarId && !status[characterId]) status[characterId] = char.tavernResources.statusBarId;
  }
  return { regexes: regexes.filter(r => regexIds.has(r.id)), statusBars, statusMap: status };
}

export function buildXiaShuPrompt(characterIds: string[], worldId: string, history: XiaShuMessage[]): LLMMessage[] {
  const characters = getXiaShuCharacters(characterIds); const groups = loadCharacterWorldGroups(); const world = groups.find(g => g.id === worldId);
  const userName = "用户";
  const blocks: string[] = [
    "你正在主持一个多人共享世界观的文字剧情。你是导演，不要把所有角色机械轮流发言。只让当前场景中合理出现的人物行动或说话；未在场角色可以在世界中做自己的事，但不要无故插入。人物必须保持各自角色卡设定。人物说话、动作、旁白可以自然混排。",
    `【世界观】\n${world?.name || "未命名世界"}\n${world?.description || ""}`,
  ];
  for (const c of characters) {
    const card = c.tavernCard;
    if (!card) { blocks.push(`【角色：${c.name}】\n${c.persona}\n${c.personality || ""}`); continue; }
    const adaptive = buildAdaptiveTavernPrompt(card, { userName, history: [], maxHistory: 1 });
    blocks.push(`【角色：${c.name}】\n${adaptive.system}\n${adaptive.postHistoryInstructions || ""}`);
  }
  if (world?.relations?.length) blocks.push(`【角色关系】\n${world.relations.map(r => `${characters.find(c=>c.id===r.fromCharacterId)?.name || r.fromCharacterId} → ${characters.find(c=>c.id===r.toCharacterId)?.name || r.toCharacterId}：${r.label}`).join("\n")}`);
  blocks.push("【输出要求】\n保持小说式连续剧情。不要解释你是AI。不要强制每个角色都发言。除非角色卡明确要求，否则不要添加角色列表、系统说明或总结。\n如果输出需要被状态栏/正则处理，请保留角色卡原本使用的标记格式。");
  const messages: LLMMessage[] = [{ role: "system", content: blocks.join("\n\n") }];
  for (const m of history.slice(-60)) messages.push({ role: m.role === "narration" ? "assistant" : m.role, content: m.characterName ? `【${m.characterName}】\n${m.rawContent}` : m.rawContent });
  return messages;
}

export async function generateXiaShuCompletion(characterIds: string[], worldId: string, history: XiaShuMessage[], signal?: AbortSignal) {
  const bindings = loadBindingConfig();
  const first = characterIds[0]; const binding = resolveBinding(bindings, first, "story");
  if (!binding.apiConfigId) throw new Error("请先在设置 → 绑定管理 → 剧情中绑定 API。");
  const api = loadApiConfigs().find(x => x.id === binding.apiConfigId); if (!api) throw new Error("找不到已绑定的 API。");
  const preset = binding.presetId ? loadPresets().find(x => x.id === binding.presetId) || null : loadPresets().find(x => x.builtIn) || null;
  const resources = getXiaShuResources(characterIds);
  const raw = await sendLLMRequest(api, preset, buildXiaShuPrompt(characterIds, worldId, history), resources.regexes, { characterName: getXiaShuCharacters(characterIds).map(c=>c.name).join("、"), userName: "用户" }, { skipOutputRegex: true, includeReasoning: true, appId: "xiashu", appTags: ["story","xiashu"], signal });
  const regexRendered = applyAllOutputRegex(raw, resources.regexes, { activeTags: ["story","xiashu"] });
  const rendered = applyTavernStatusBars(regexRendered, resources.statusBars.filter(bar => Object.values(resources.statusMap).includes(bar.id)));
  return { rawText: raw, renderedText: rendered };
}
