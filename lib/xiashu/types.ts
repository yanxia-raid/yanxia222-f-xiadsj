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

export type XiaShuSession = {
  id: string;
  title: string;
  characterIds: string[];
  worldId: string;
  worldName: string;
  createdAt: string;
  updatedAt: string;
  customCSS?: string;
  uiHtml?: string;
  statusBarIds?: Record<string, string>;
  musicUrl?: string;
  musicName?: string;
  bgVolume?: number;
  voiceVolume?: number;
  currentSlotId?: string;
};
