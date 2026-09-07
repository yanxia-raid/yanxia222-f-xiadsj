import JSZip from 'jszip';
import type { TavernCharacterCard, TavernCardData, TavernImportResult, TavernRegexScript } from './types';
import { extractTavernJsonFromPng } from './png';

function asRecord(v: unknown): Record<string, unknown> | null { return v && typeof v === 'object' ? v as Record<string, unknown> : null; }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

function normalizeCard(raw: Record<string, unknown>, sourceFormat: TavernCharacterCard['sourceFormat'], avatar?: string | null): TavernCharacterCard {
  const data = asRecord(raw.data) || raw;
  const spec = typeof raw.spec === 'string' ? raw.spec : 'chara_card_v1';
  const specVersion = typeof raw.spec_version === 'string' ? raw.spec_version : undefined;
  const book = asRecord(data.character_book);
  if (book && !Array.isArray(book.entries)) book.entries = [];
  return {
    spec,
    spec_version: specVersion,
    data: data as TavernCardData,
    raw,
    sourceFormat,
    avatar: avatar ?? null,
    importedAt: new Date().toISOString(),
  };
}

function detectJsonFormat(raw: Record<string, unknown>): TavernCharacterCard['sourceFormat'] {
  const spec = String(raw.spec || '');
  if (spec === 'chara_card_v3') return 'json-v3';
  if (spec === 'chara_card_v2') return 'json-v2';
  return 'json-v1';
}

export function parseTavernJson(text: string, avatar?: string | null): TavernImportResult {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const card = normalizeCard(raw, detectJsonFormat(raw), avatar);
  return inspectCard(card);
}

export async function parseTavernCharx(buffer: ArrayBuffer): Promise<TavernImportResult> {
  const zip = await JSZip.loadAsync(buffer);
  const cardFile = zip.file('card.json');
  if (!cardFile) throw new Error('CHARX 中缺少 card.json');
  const raw = JSON.parse(await cardFile.async('text')) as Record<string, unknown>;
  const assets: Record<string, string> = {};
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || path === 'card.json') continue;
    try {
      const bytes = await entry.async('base64');
      assets[path] = `data:application/octet-stream;base64,${bytes}`;
    } catch {}
  }
  const card = normalizeCard(raw, 'charx', null);
  card.embeddedAssets = assets;
  const icon = Object.keys(assets).find(p => /(^|\/)icon\.(png|jpe?g|webp)$/i.test(p));
  if (icon) card.avatar = assets[icon];
  return inspectCard(card);
}

export async function parseTavernFile(file: File): Promise<TavernImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.charx')) return parseTavernCharx(await file.arrayBuffer());
  if (name.endsWith('.png') || file.type === 'image/png') {
    const { json, version } = extractTavernJsonFromPng(await file.arrayBuffer());
    const avatar = await fileToDataUrl(file);
    const sourceFormat = version === 'v3' ? 'png-v3' : version === 'v2' ? 'png-v2' : 'png-v1';
    return inspectCard(normalizeCard(json, sourceFormat, avatar));
  }
  if (name.endsWith('.json') || file.type === 'application/json') return parseTavernJson(await file.text());
  throw new Error('支持 PNG、JSON、CHARX 角色卡');
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('无法读取图片'));
    reader.readAsDataURL(file);
  });
}

export function getRegexScripts(card: TavernCharacterCard): TavernRegexScript[] {
  const ext = card.data.extensions || {};
  const value = ext.regex_scripts ?? ext.regexScripts;
  return Array.isArray(value) ? value as TavernRegexScript[] : [];
}

export function inspectCard(card: TavernCharacterCard): TavernImportResult {
  const d = card.data;
  const warnings: string[] = [];
  const supported: string[] = ['基础角色设定', '开场白', '备用开场白', '示例对话', 'System Prompt', 'Post History Instructions', 'Creator Notes', 'Tags', '原始 extensions'];
  if (d.character_book?.entries?.length) supported.push(`角色世界书 ${d.character_book.entries.length} 条`);
  if (getRegexScripts(card).length) supported.push(`正则脚本 ${getRegexScripts(card).length} 条`);
  if (card.embeddedAssets && Object.keys(card.embeddedAssets).length) supported.push(`CHARX 内嵌资源 ${Object.keys(card.embeddedAssets).length} 个`);
  if (!d.first_mes && !arr(d.alternate_greetings).length) warnings.push('角色没有开场白，将使用空聊天起点');
  if (!d.extensions) warnings.push('角色没有 extensions 字段');
  return { card, warnings, supported };
}

export function tavernCardToCharacterData(card: TavernCharacterCard) {
  const d = card.data;
  return {
    name: d.name || '未命名角色',
    persona: String(d.description || ''),
    personality: String(d.personality || ''),
    avatar: card.avatar || null,
    tags: arr(d.tags).map(String),
    tavernCard: card,
  };
}
