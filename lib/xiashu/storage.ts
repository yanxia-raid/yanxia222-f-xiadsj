import Dexie from "dexie";
import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import type { XiaShuMessage, XiaShuSession, XiaShuSlot } from "./types";

const SETTINGS_KEY = "ai_phone_xiashu_settings_v1";
registerKvMigration(SETTINGS_KEY);

class XiaShuDB extends Dexie {
  sessions!: Dexie.Table<XiaShuSession, string>;
  messages!: Dexie.Table<XiaShuMessage, string>;
  slots!: Dexie.Table<XiaShuSlot, string>;
  constructor() {
    super("AiPhoneXiaShuDB");
    this.version(1).stores({
      sessions: "id, updatedAt",
      messages: "id, sessionId, createdAt",
      slots: "id, sessionId, updatedAt",
    });
  }
}
const db = new XiaShuDB();
let hydrated = false;
let sessions: XiaShuSession[] = [];
let messages: XiaShuMessage[] = [];
let slots: XiaShuSlot[] = [];

const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export async function hydrateXiaShuStorage() {
  if (hydrated || typeof window === "undefined") return;
  [sessions, messages, slots] = await Promise.all([
    db.sessions.toArray().catch(() => []),
    db.messages.toArray().catch(() => []),
    db.slots.toArray().catch(() => []),
  ]);
  hydrated = true;
}

export function loadXiaShuSessions() { return [...sessions].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); }
export function loadXiaShuMessages(sessionId: string) { return messages.filter(x => x.sessionId === sessionId).sort((a,b) => a.createdAt.localeCompare(b.createdAt)); }
export function loadXiaShuSlots(sessionId: string) { return slots.filter(x => x.sessionId === sessionId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); }
export function loadXiaShuSlotMessages(slotId: string) { return slots.find(x => x.id === slotId)?.messageSnapshot || []; }

export function createXiaShuSession(input: Pick<XiaShuSession, "title" | "characterIds" | "worldId" | "worldName">) {
  const now = new Date().toISOString();
  const session: XiaShuSession = { id: id("xia_sess"), ...input, createdAt: now, updatedAt: now, bgVolume: .35, voiceVolume: .8 };
  sessions.unshift(session); db.sessions.put(session).catch(() => undefined);
  const slot = createXiaShuSlot(session.id, "初始存档");
  session.currentSlotId = slot.id;
  updateXiaShuSession(session.id, { currentSlotId: slot.id });
  return session;
}

export function updateXiaShuSession(sessionId: string, patch: Partial<XiaShuSession>) {
  const i = sessions.findIndex(x => x.id === sessionId); if (i < 0) return null;
  sessions[i] = { ...sessions[i], ...patch, updatedAt: new Date().toISOString() };
  db.sessions.put(sessions[i]).catch(() => undefined); return sessions[i];
}

export function addXiaShuMessage(input: Omit<XiaShuMessage,"id"|"createdAt">) {
  const item: XiaShuMessage = { ...input, id: id("xia_msg"), createdAt: new Date().toISOString() };
  messages.push(item); db.messages.put(item).catch(() => undefined);
  updateXiaShuSession(item.sessionId, { currentSlotId: loadXiaShuSessions().find(s => s.id === item.sessionId)?.currentSlotId });
  refreshSlot(item.sessionId);
  return item;
}

function refreshSlot(sessionId: string) {
  const session = sessions.find(x => x.id === sessionId); if (!session?.currentSlotId) return;
  const rows = loadXiaShuMessages(sessionId); const last = rows[rows.length - 1];
  const slot = slots.find(x => x.id === session.currentSlotId); if (!slot) return;
  slot.updatedAt = new Date().toISOString(); slot.messageCount = rows.length; slot.preview = (last?.rawContent || "").replace(/\s+/g," ").slice(0,80); slot.messageSnapshot = rows.map(row => ({ ...row }));
  db.slots.put(slot).catch(() => undefined);
}

export function createXiaShuSlot(sessionId: string, name?: string) {
  const rows = loadXiaShuMessages(sessionId); const now = new Date().toISOString();
  const slot: XiaShuSlot = { id: id("xia_slot"), sessionId, name: name?.trim() || `存档 ${new Date().toLocaleString()}`, createdAt: now, updatedAt: now, messageCount: rows.length, preview: rows.at(-1)?.rawContent?.replace(/\s+/g," ").slice(0,80) || "空存档", messageSnapshot: rows.map(row => ({ ...row })) };
  slots.unshift(slot); db.slots.put(slot).catch(() => undefined); return slot;
}

export function saveXiaShuSettings(settings: Record<string, unknown>) { if (typeof window !== "undefined") kvSet(SETTINGS_KEY, JSON.stringify(settings)); }
export function loadXiaShuSettings(): Record<string, unknown> { try { const raw = typeof window !== "undefined" ? kvGet(SETTINGS_KEY) : null; return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
