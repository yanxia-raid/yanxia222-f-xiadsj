import type { TavernCharacterCard } from './types';
import { getRegexScripts } from './parser';

export type TavernFormatProfile = {
  source: 'card' | 'extension' | 'inferred';
  promptTemplate?: string;
  statusTemplate?: string;
  outputTemplate?: string;
  markup: 'plain' | 'markdown' | 'html' | 'mixed';
  tags: string[];
  directives: string[];
  hasStructuredOutput: boolean;
  customCss?: string;
};

const pick = (o: Record<string, unknown>, ks: string[]) => {
  for (const k of ks) if (typeof o[k] === 'string' && o[k]) return o[k] as string;
};
const text = (d: Record<string, unknown>) => Object.values(d).filter(v => typeof v === 'string').join('\n');

export function detectTavernFormatProfile(card: TavernCharacterCard): TavernFormatProfile {
  const d = card.data as Record<string, unknown>;
  const ext = (d.extensions && typeof d.extensions === 'object' ? d.extensions : {}) as Record<string, unknown>;
  const all = text(d);
  const promptTemplate = pick(ext, ['prompt_template','promptTemplate','character_prompt_template','characterPromptTemplate','system_prompt_template','systemPromptTemplate']);
  const statusTemplate = pick(ext, ['status_template','statusTemplate','status_format','statusFormat','statusBarTemplate','state_template','stateTemplate']);
  const outputTemplate = pick(ext, ['output_template','outputTemplate','response_template','responseTemplate','format_template','formatTemplate']);
  const customCss = pick(ext, ['css','custom_css','customCss','style','styles','character_css','characterCss']);
  const html = /<([a-z][\w:-]*)(?:\s[^>]*)?>/i.test(all);
  const markdown = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|>\s|```)|\*\*[^*]+\*\*|__[^_]+__/m.test(all);
  const tags = Array.from(all.matchAll(/<([a-zA-Z][\w:-]*)\b[^>]*>/g)).map(m => m[1]).filter(x => !['START','user','char','USER','CHAR'].includes(x));
  const directives = Array.from(all.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?(?:格式|规则|输出格式|回复格式|Response Format|Output Format|Style)\s*[:：]\s*([^\n]+)/gi)).map(m => m[1].trim());
  const structured = Boolean(promptTemplate || outputTemplate || statusTemplate || tags.length || directives.length || getRegexScripts(card).length);
  return {
    source: promptTemplate || statusTemplate || outputTemplate ? 'extension' : structured ? 'card' : 'inferred',
    promptTemplate, statusTemplate, outputTemplate, customCss,
    markup: html && markdown ? 'mixed' : html ? 'html' : markdown ? 'markdown' : 'plain',
    tags: [...new Set(tags)], directives: [...new Set(directives)], hasStructuredOutput: structured,
  };
}

const macro = (s: string, c: TavernCharacterCard, u: string, p = '') => s.replace(/{{\s*(char|user|persona|description|personality|scenario)\s*}}/gi, (_, k) => {
  const map: Record<string, string> = {
    char: c.data.name, user: u, persona: p, description: String(c.data.description || ''),
    personality: String(c.data.personality || ''), scenario: String(c.data.scenario || ''),
  };
  return map[String(k).toLowerCase()] || '';
});

/**
 * Card-native prompt data. No synthetic "Character Description:" / "Personality:" labels
 * are introduced: the imported card's own prose is the authoritative structure.
 */
export function buildAdaptiveTavernPrompt(card: TavernCharacterCard, o: { userName: string; persona?: string; history: Array<{role:'system'|'user'|'assistant';content:string}>; statusText?: string; maxHistory?: number }) {
  const d = card.data as Record<string, any>, profile = detectTavernFormatProfile(card), blocks: string[] = [];
  if (profile.promptTemplate) blocks.push(macro(profile.promptTemplate, card, o.userName, o.persona));
  else for (const k of ['system_prompt','description','personality','scenario','creator_notes']) if (typeof d[k] === 'string' && d[k]) blocks.push(macro(d[k], card, o.userName, o.persona));
  if (profile.directives.length) blocks.push(profile.directives.join('\n'));
  return {
    system: blocks.filter(Boolean).join('\n\n'),
    messages: o.history.slice(-(o.maxHistory ?? 40)).map(m => ({ ...m, content: macro(m.content, card, o.userName, o.persona) })),
    postHistoryInstructions: typeof d.post_history_instructions === 'string' ? macro(d.post_history_instructions, card, o.userName, o.persona) : '',
    firstMessage: typeof d.first_mes === 'string' ? macro(d.first_mes, card, o.userName, o.persona) : '',
    alternateGreetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map((x: string) => macro(x, card, o.userName, o.persona)) : [],
    mesExample: typeof d.mes_example === 'string' ? macro(d.mes_example, card, o.userName, o.persona) : '',
    depthPrompt: readDepthPrompt(card, o.userName, o.persona),
    profile, regexScripts: getRegexScripts(card),
  };
}

export function readDepthPrompt(card: TavernCharacterCard, userName: string, persona = '') {
  const ext = (card.data.extensions || {}) as Record<string, unknown>;
  const raw = ext.depth_prompt;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const prompt = typeof obj.prompt === 'string' ? macro(obj.prompt, card, userName, persona).trim() : '';
  if (!prompt) return null;
  return { prompt, depth: Math.max(0, Number(obj.depth ?? 4) || 4), role: obj.role === 'user' || obj.role === 'assistant' ? obj.role : 'system' as const };
}
