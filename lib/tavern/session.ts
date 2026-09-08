import type { ChatMessage, ChatSession } from "@/lib/chat-storage";
import { loadChatMessages, pushChatMessage, loadChatSessions, saveChatSessions } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import { resolveUserIdentity, loadBindingConfig, loadRegexes, resolveBinding, loadTavernStatusBars } from "@/lib/settings-storage";
import { getTavernCard } from "./runtime";
import { applyOutputRegex } from "@/lib/llm-prompt-assembler";
import { applyTavernStatusBars } from "./status-resource";
import { MacroEngine } from "@/lib/macro-engine";

export function getTavernGreetings(characterId: string): string[] {
  const character = loadCharacters().find(c => c.id === characterId);
  const card = character ? getTavernCard(character) : null;
  if (!card) return [];
  const first = String(card.data.first_mes ?? "");
  const alternates = Array.isArray(card.data.alternate_greetings)
    ? card.data.alternate_greetings.map(v => String(v ?? "")).filter(Boolean)
    : [];
  return [first, ...alternates].filter(Boolean);
}

export function setTavernGreetingIndex(sessionId: string, index: number): ChatSession | null {
  const sessions = loadChatSessions();
  const i = sessions.findIndex(s => s.id === sessionId);
  if (i < 0) return null;
  const greetings = getTavernGreetings(sessions[i].contactId);
  const next = Math.max(0, Math.min(Math.max(0, greetings.length - 1), Math.floor(index)));
  sessions[i] = { ...sessions[i], tavernGreetingIndex: next };
  saveChatSessions(sessions);
  return sessions[i];
}

function expandGreeting(content: string, characterName: string, userName: string): string {
  return content
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/\{\{char\}\}/gi, characterName)
    .replace(/\{\{charname\}\}/gi, characterName);
}

export function ensureTavernGreeting(session: ChatSession): ChatMessage | null {
  if (!session || session.isGroup) return null;
  const messages = loadChatMessages(session.id);
  if (messages.length > 0) return null;
  const character = loadCharacters().find(c => c.id === session.contactId);
  if (!character) return null;
  const card = getTavernCard(character);
  if (!card) return null;
  const greetings = getTavernGreetings(character.id);
  if (!greetings.length) return null;
  const index = Math.max(0, Math.min(greetings.length - 1, Math.floor(session.tavernGreetingIndex ?? 0)));
  const userIdentity = resolveUserIdentity(character.id, "chat");
  const userName = userIdentity?.name || resolveUserIdentity()?.name || "你";
  let content = expandGreeting(greetings[index], character.name || card.data.name, userName);
  // A character can borrow another character's Tavern Regex/Status Bar through bindings.
  // Apply the bound runtime resources to the initial greeting too; otherwise bindings only
  // affect later model turns and appear to be "bound but not running".
  const slot = resolveBinding(loadBindingConfig(), character.id, "chat");
  const allRegexes = loadRegexes();
  const boundRegexes = (slot.regexIds || [])
    .map(id => allRegexes.find(regex => regex.id === id))
    .filter(Boolean) as import("@/lib/settings-types").RegexConfig[];
  if (boundRegexes.length > 0) {
    content = applyOutputRegex(content, boundRegexes, {
      macroEngine: new MacroEngine(character.name || card.data.name, userName),
      activeTags: ["chat"],
    });
  }
  if (slot.statusBarId) {
    const bars = loadTavernStatusBars().filter(item => item.id === slot.statusBarId && item.enabled);
    content = applyTavernStatusBars(content, bars);
  }
  if (!content.trim()) return null;
  return pushChatMessage({
    sessionId: session.id, role: "assistant", content, status: "sent", origin: "chat",
    senderCharacterId: character.id, senderName: character.name,
  });
}

export function ensureTavernGreetingOnce(session: ChatSession): void {
  try { ensureTavernGreeting(session); }
  catch (error) { console.warn("[Tavern] Failed to initialize greeting:", error); }
}
