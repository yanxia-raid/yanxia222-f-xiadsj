import type { TavernCharacterCard } from './types';
import { detectTavernFormatProfile } from './adaptive';
import { applyTavernRegex } from './regex';
import { getRegexScripts } from './parser';
export function applyTavernResponseFormat(card:TavernCharacterCard,text:string){let v=applyTavernRegex(text,getRegexScripts(card),'output');const p=detectTavernFormatProfile(card);if(p.outputTemplate&&/{{\s*response\s*}}/i.test(p.outputTemplate))v=p.outputTemplate.replace(/{{\s*response\s*}}/gi,v);return v;}
