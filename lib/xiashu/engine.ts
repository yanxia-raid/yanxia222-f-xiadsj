import { loadCharacters } from "@/lib/character-storage";
import { loadApiConfigs, loadBindingConfig, loadPresets, loadRegexes, loadTavernStatusBars, resolveBinding, loadWorldBooks } from "@/lib/settings-storage";
import { buildAdaptiveTavernPrompt } from "@/lib/tavern/adaptive";
import { getTavernGreeting } from "@/lib/tavern/runtime";
import { activateBoundWorldBook } from "@/lib/tavern/lorebook";
import { assemblePromptPayload, type LLMMessage } from "@/lib/llm-prompt-assembler";
import { sendLLMRequest } from "@/lib/chat-engine";
import type { XiaShuMessage, XiaShuSession } from "./types";

export function getXiaShuCharacters(ids: string[]) {
  const all = loadCharacters();
  return ids.map(id => all.find(c => c.id === id)).filter(Boolean) as ReturnType<typeof loadCharacters>;
}

export function getXiaShuResources(session: XiaShuSession) {
  const regexes = loadRegexes();
  const statusBars = loadTavernStatusBars();
  const selectedRegexIds = new Set(session.regexIds || []);
  const selectedStatusIds = new Set(session.statusBarIds || []);
  return {
    regexes: regexes.filter(r => selectedRegexIds.has(r.id)),
    statusBars: statusBars.filter(b => selectedStatusIds.has(b.id) && b.enabled),
  };
}

function toChatHistory(history: XiaShuMessage[]) {
  return history.map((m, i) => ({
    id: m.id || `xia-history-${i}`,
    sessionId: m.sessionId,
    role: m.role === "narration" ? "assistant" : m.role,
    content: m.characterName ? `【${m.characterName}】\n${m.rawContent}` : m.rawContent,
    status: "sent" as const,
    createdAt: m.createdAt,
    order: i,
    senderCharacterId: m.characterId,
    senderName: m.characterName,
  }));
}

export function buildXiaShuPrompt(session: XiaShuSession, history: XiaShuMessage[]): LLMMessage[] {
  const characters = getXiaShuCharacters(session.characterIds);
  const books = loadWorldBooks().filter(w => w.id === session.worldBookId || (!session.worldBookId && w.id === session.worldId));
  const first = characters[0];
  const binding = resolveBinding(loadBindingConfig(), first?.id, "xiashu");
  const preset = session.presetId ? loadPresets().find(x => x.id === session.presetId) || null : null;
  const shared: LLMMessage = {
    role: "system",
    content: [
      "你正在主持一个多人共享世界的连续小说。不要机械地让所有角色轮流发言；只有当前场景中合理在场的人物才行动或说话。未在场角色不要无故插入。",
      `【本剧情世界书】\n${books.map(b => b.name).join("、") || "无"}`,
      `【同行角色】\n${characters.map(c => `【${c.name}】\n${c.persona}\n${c.personality || ""}`).join("\n\n")}`,
      "【剧情输出格式】旁白请单独成段；角色说话必须以【角色名】作为段落开头，例如【某角色】\n“对白……”；不要把旁白塞进角色名标签里。可以连续出现旁白和不同角色。保留角色卡要求的原始标记/HTML/状态栏标记。",
    ].join("\n\n"),
  };
  if (!first) return [shared];

  const assembled = assemblePromptPayload({
    character: first,
    history: toChatHistory(history),
    preset,
    worldBooks: books,
    regexes: getXiaShuResources(session).regexes,
    userName: "用户",
    appId: "xiashu",
    appTags: ["story", "xiashu"],
    activateAllWorldBooks: false,
  });

  // The first character's native Tavern prompt/preset/greeting/post-history behavior is kept intact;
  // the shared-world block above adds the other selected characters without changing their cards.
  return [shared, ...assembled];
}

export async function generateXiaShuCompletion(session: XiaShuSession, history: XiaShuMessage[], signal?: AbortSignal) {
  const characters = getXiaShuCharacters(session.characterIds);
  const first = characters[0];
  if (!first) throw new Error("剧情没有可用角色。");
  const binding = resolveBinding(loadBindingConfig(), first.id, "xiashu");
  if (!binding.apiConfigId) throw new Error("请先在设置 → 绑定管理 → 夏书中绑定 API。");
  const api = loadApiConfigs().find(x => x.id === binding.apiConfigId);
  if (!api) throw new Error("找不到已绑定的 API。");
  const resources = getXiaShuResources(session);
  const raw = await sendLLMRequest(
    api,
    session.presetId ? loadPresets().find(x => x.id === session.presetId) || null : null,
    buildXiaShuPrompt(session, history),
    resources.regexes,
    { characterName: characters.map(c => c.name).join("、"), userName: "用户" },
    { skipOutputRegex: true, includeReasoning: true, appId: "xiashu", appTags: ["story", "xiashu"], signal },
  );
  return { rawText: raw };
}

/** Used when creating a fresh story: the first character's Tavern greeting becomes the opening bubble. */
export function getXiaShuOpeningGreeting(characterId: string) {
  const c = loadCharacters().find(x => x.id === characterId);
  if (!c?.tavernCard) return "";
  return getTavernGreeting(c.tavernCard);
}
