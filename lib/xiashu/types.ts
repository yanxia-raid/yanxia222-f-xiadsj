export type XiaShuMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "narration";
  characterId?: string;
  characterName?: string;
  rawContent: string;
  renderedContent?: string;
  createdAt: string;
};

export type XiaShuSlot = {
  id: string;
  sessionId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  messageSnapshot?: XiaShuMessage[];
};

/** Per-story resources. These are intentionally independent from character/app bindings. */
export type XiaShuSession = {
  id: string;
  title: string;
  characterIds: string[];
  worldBookId?: string;
  worldId?: string; // legacy migration only
  worldName: string;
  createdAt: string;
  updatedAt: string;
  presetId?: string;
  regexIds?: string[];
  statusBarIds?: string[];
  customCSS?: string;
  uiHtml?: string;
  musicUrl?: string;
  musicName?: string;
  bgVolume?: number;
  voiceVolume?: number;
  currentSlotId?: string;
};
