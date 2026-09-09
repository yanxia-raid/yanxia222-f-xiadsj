"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, BookOpen, ChevronRight, Headphones, Music2, Plus, Save, Settings2, UserRound, Users, X } from "lucide-react";
import { loadCharacters } from "@/lib/character-storage";
import { loadWorldBooks, loadPresets, loadRegexes, loadTavernStatusBars, resolveUserIdentity } from "@/lib/settings-storage";
import { TavernAdaptiveMessage } from "@/components/chat/tavern-adaptive-message";
import { Avatar } from "@/components/ui/primitives";
import { createXiaShuSession, createXiaShuSlot, hydrateXiaShuStorage, loadXiaShuMessages, loadXiaShuSlotMessages, loadXiaShuSessions, loadXiaShuSlots, updateXiaShuSession, addXiaShuMessage } from "@/lib/xiashu/storage";
import { generateXiaShuCompletion, getXiaShuOpeningGreeting, getXiaShuResources } from "@/lib/xiashu/engine";
import { extractTavernCustomCss, scopeXiaShuCss } from "@/lib/xiashu/theme";
import type { XiaShuMessage, XiaShuSession, XiaShuSlot } from "@/lib/xiashu/types";
import type { WorldBookConfig } from "@/lib/settings-types";
import "./xia-shu.css";

type Props = { onClose: () => void };
type Page = "travel" | "past";

function stripThink(text: string) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function splitStoryOutput(text: string, chars: ReturnType<typeof loadCharacters>): Array<{ role: "assistant" | "narration"; characterId?: string; characterName?: string; rawContent: string }> {
  const source = stripThink(text).replace(/\r/g, "").trim();
  if (!source) return [];
  const byName = new Map(chars.map(c => [c.name.trim(), c]));
  const marker = /(?:^|\n)\s*(?:【\s*(?:角色\s*[:：]\s*)?([^】\n]+)\s*】|\[\s*(?:角色\s*[:：]\s*)?([^\]\n]+)\s*\])\s*\n?/g;
  const matches = [...source.matchAll(marker)].filter(m => byName.has((m[1] || m[2] || "").trim()));
  if (!matches.length) return [{ role: "assistant", characterId: chars[0]?.id, characterName: chars[0]?.name, rawContent: source }];
  const rows: Array<{ role: "assistant" | "narration"; characterId?: string; characterName?: string; rawContent: string }> = [];
  const firstStart = matches[0].index || 0;
  const before = source.slice(0, firstStart).trim();
  if (before) rows.push({ role: "narration", rawContent: before });
  matches.forEach((m, i) => {
    const name = (m[1] || m[2] || "").trim();
    const c = byName.get(name);
    const start = (m.index || 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index || source.length) : source.length;
    const body = source.slice(start, end).trim();
    if (body) rows.push({ role: "assistant", characterId: c?.id, characterName: c?.name || name, rawContent: body });
  });
  return rows;
}

export function XiaShuApp({ onClose }: Props) {
  const [page, setPage] = useState<Page>("travel");
  const [sessions, setSessions] = useState<XiaShuSession[]>([]);
  const [active, setActive] = useState<XiaShuSession | null>(null);
  const [messages, setMessages] = useState<XiaShuMessage[]>([]);
  const [setupStep, setSetupStep] = useState<0|1|2>(0);
  const [selectedChars, setSelectedChars] = useState<string[]>([]);
  const [selectedWorldBook, setSelectedWorldBook] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [attrId, setAttrId] = useState<string | null>(null);
  const [slots, setSlots] = useState<XiaShuSlot[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveSession, setArchiveSession] = useState<XiaShuSession | null>(null);
  const [volume, setVolume] = useState(.35);
  const [voiceVolume, setVoiceVolume] = useState(.8);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const characters = useMemo(() => loadCharacters(), [setupStep, active, page, messages.length]);
  const worldBooks = useMemo(() => loadWorldBooks(), [setupStep, active, page]);

  const refresh = () => {
    setSessions(loadXiaShuSessions());
    if (active) { setMessages(loadXiaShuMessages(active.id)); setSlots(loadXiaShuSlots(active.id)); }
  };
  useEffect(() => { hydrateXiaShuStorage().then(refresh); }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (!active) return;
    setMessages(loadXiaShuMessages(active.id));
    setSlots(loadXiaShuSlots(active.id));
    setVolume(active.bgVolume ?? .35);
    setVoiceVolume(active.voiceVolume ?? .8);
    setMusicUrl(active.musicUrl || "");
    setMusicName(active.musicName || "");
  }, [active]);
  useEffect(() => {
    if (!musicUrl || !active) return;
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.loop = true; audio.src = musicUrl; audio.volume = volume;
    audio.play().catch(() => {});
    return () => { audio.pause(); };
  }, [musicUrl, active?.id]);

  function startSession() {
    if (!selectedChars.length || !selectedWorldBook) return;
    const world = worldBooks.find(w => w.id === selectedWorldBook);
    const selected = characters.filter(c => selectedChars.includes(c.id));
    const s = createXiaShuSession({
      title: `${world?.name || "新旅程"} · ${selected.map(c => c.name).join("、")}`,
      characterIds: selectedChars,
      worldName: world?.name || "未知世界",
      worldBookId: selectedWorldBook,
    });
    setActive(s); setMessages([]); setSlots(loadXiaShuSlots(s.id)); setSetupStep(0); setPage("travel");
    const greeting = getXiaShuOpeningGreeting(selectedChars[0]);
    if (greeting) {
      addXiaShuMessage({ sessionId: s.id, role: "assistant", characterId: selectedChars[0], characterName: selected[0]?.name, rawContent: greeting });
      setMessages(loadXiaShuMessages(s.id));
    }
  }

  async function send() {
    const text = draft.trim(); if (!text || !active || generating) return;
    addXiaShuMessage({ sessionId: active.id, role: "user", rawContent: text });
    setDraft(""); setMessages(loadXiaShuMessages(active.id)); setGenerating(true);
    try {
      const history = loadXiaShuMessages(active.id);
      const result = await generateXiaShuCompletion(active, history);
      const parts = splitStoryOutput(result.rawText, characters.filter(c => active.characterIds.includes(c.id)));
      for (const part of parts) addXiaShuMessage({ sessionId: active.id, ...part });
      setMessages(loadXiaShuMessages(active.id));
    } catch (e) {
      addXiaShuMessage({ sessionId: active.id, role: "narration", rawContent: `【生成失败】${e instanceof Error ? e.message : "未知错误"}` });
      setMessages(loadXiaShuMessages(active.id));
    } finally { setGenerating(false); }
  }

  function newSlot() { if (!active) return; const s = createXiaShuSlot(active.id); updateXiaShuSession(active.id, { currentSlotId: s.id }); setSlots(loadXiaShuSlots(active.id)); }
  function openSlot(session: XiaShuSession, slot: XiaShuSlot) {
    updateXiaShuSession(session.id, { currentSlotId: slot.id });
    setActive({ ...session, currentSlotId: slot.id }); setMessages(loadXiaShuSlotMessages(slot.id)); setSlots(loadXiaShuSlots(session.id));
  }
  function speak(text: string, characterId?: string) {
    const c = characters.find(x => x.id === characterId);
    const ext = c?.tavernCard?.data?.extensions as Record<string, unknown> | undefined;
    const url = typeof ext?.voice_url === "string" ? ext.voice_url : typeof ext?.voiceUrl === "string" ? ext.voiceUrl : "";
    if (url) { const a = new Audio(url); a.volume = voiceVolume; a.play().catch(() => {}); return; }
    if (typeof window !== "undefined" && "speechSynthesis" in window) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, " ")); u.volume = voiceVolume; speechSynthesis.speak(u); }
  }

  useEffect(() => { if (!active && page === "travel" && setupStep === 0 && sessions.length === 0) setSetupStep(1); }, [active, page, setupStep, sessions.length]);

  return <div className="xs-app">
    <header className="xs-header"><button onClick={onClose} className="xs-icon"><X size={18}/></button><div className="xs-brand"><span>夏书</span><small>剧情旅程</small></div><button className="xs-icon" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/></button></header>
    <nav className="xs-tabs"><button className={page === "travel" ? "active" : ""} onClick={() => setPage("travel")}><BookOpen size={16}/>夏旅</button><button className={page === "past" ? "active" : ""} onClick={() => setPage("past")}><Bookmark size={16}/>夏往</button></nav>
    {page === "past" ? <><PastPage sessions={sessions} onOpen={s => setArchiveSession(s)}/>{archiveSession && <ArchiveSlots session={archiveSession} onClose={() => setArchiveSession(null)} onOpen={(s, slot) => { openSlot(s, slot); setArchiveSession(null); setPage("travel"); }}/>}</> : active ? <StoryPage active={active} messages={messages} characters={characters} draft={draft} setDraft={setDraft} generating={generating} onSend={send} onBack={() => setActive(null)} onAttr={setAttrId} onReview={() => setReviewOpen(true)} onSlot={newSlot} onSpeak={speak} voiceVolume={voiceVolume} volume={volume} musicUrl={musicUrl} musicName={musicName} onMusic={(url, name) => { setMusicUrl(url); setMusicName(name); const next=updateXiaShuSession(active.id, { musicUrl: url, musicName: name }); if(next) setActive(next); }} onSettings={() => setSettingsOpen(true)} onStoryUpdate={patch => { const next=updateXiaShuSession(active.id, patch); if(next) setActive(next); }} /> : <SetupPage step={setupStep} setStep={setSetupStep} chars={characters} worldBooks={worldBooks} selectedChars={selectedChars} setSelectedChars={setSelectedChars} selectedWorldBook={selectedWorldBook} setSelectedWorldBook={setSelectedWorldBook} onStart={startSession}/>} 
    {attrId === "__user" ? <UserAttrPanel onClose={() => setAttrId(null)}/> : attrId && <AttrPanel character={characters.find(c => c.id === attrId)} onClose={() => setAttrId(null)}/>} 
    {reviewOpen && <ReviewPanel messages={messages} onClose={() => setReviewOpen(false)}/>} 
    {settingsOpen && <SettingsPanel active={active} volume={volume} setVolume={v => { setVolume(v); if (active) updateXiaShuSession(active.id, { bgVolume: v }); }} voiceVolume={voiceVolume} setVoiceVolume={v => { setVoiceVolume(v); if (active) updateXiaShuSession(active.id, { voiceVolume: v }); }} onSave={s => { if (!active) return; const next = updateXiaShuSession(active.id, s); if (next) setActive(next); }} onClose={() => setSettingsOpen(false)}/>} 
  </div>;
}

function SetupPage({step,setStep,chars,worldBooks,selectedChars,setSelectedChars,selectedWorldBook,setSelectedWorldBook,onStart}:{step:0|1|2;setStep:(x:0|1|2)=>void;chars:ReturnType<typeof loadCharacters>;worldBooks:WorldBookConfig[];selectedChars:string[];setSelectedChars:(x:string[])=>void;selectedWorldBook:string;setSelectedWorldBook:(x:string)=>void;onStart:()=>void}) {
 return <main className="xs-setup"><div className="xs-kicker">NEW JOURNEY / 夏旅</div><h1>先选同行者<br/><em>再决定你要去的世界。</em></h1>
 {step===1 && <section className="xs-choice"><div className="xs-section-title"><Users size={16}/>同行角色 <span>可单选 / 多选</span></div><div className="xs-character-grid">{chars.map(c=><button key={c.id} className={selectedChars.includes(c.id)?"selected":""} onClick={() => setSelectedChars(selectedChars.includes(c.id)?selectedChars.filter(x=>x!==c.id):[...selectedChars,c.id])}><Avatar src={c.avatar||undefined} name={c.name} size="md"/><span>{c.name}</span><small>{c.personality||c.persona.slice(0,28)||"角色"}</small></button>)}</div><button className="xs-primary" disabled={!selectedChars.length} onClick={() => setStep(2)}>下一步 <ChevronRight size={16}/></button></section>}
 {step===2 && <section className="xs-choice"><div className="xs-section-title"><BookOpen size={16}/>选择世界书 <span>本剧情独立绑定</span></div><div className="xs-world-list">{worldBooks.map(w=><button key={w.id} className={selectedWorldBook===w.id?"selected":""} onClick={() => setSelectedWorldBook(w.id)}><b>{w.name}</b><span>{w.description||`共 ${w.entries.length} 条世界书内容。`}</span></button>)}</div>{!worldBooks.length&&<div className="xs-empty">还没有世界书，请先在设置里导入或创建世界书。</div>}<div className="xs-row"><button className="xs-ghost" onClick={() => setStep(1)}>返回</button><button className="xs-primary" disabled={!selectedWorldBook} onClick={onStart}>开始夏旅 <ChevronRight size={16}/></button></div></section>}
 {step===0 && <section className="xs-empty"><p>还没有正在进行的夏旅。</p><button className="xs-primary" onClick={() => setStep(1)}><Plus size={16}/>创建副本</button></section>}
 </main>;
}

function StoryPage({active,messages,characters,draft,setDraft,generating,onSend,onBack,onAttr,onReview,onSlot,onSpeak,voiceVolume,volume,musicUrl,musicName,onMusic,onSettings,onStoryUpdate}:{active:XiaShuSession;messages:XiaShuMessage[];characters:ReturnType<typeof loadCharacters>;draft:string;setDraft:(x:string)=>void;generating:boolean;onSend:()=>void;onBack:()=>void;onAttr:(x:string)=>void;onReview:()=>void;onSlot:()=>void;onSpeak:(text:string,id?:string)=>void;voiceVolume:number;volume:number;musicUrl:string;musicName:string;onMusic:(url:string,name:string)=>void;onSettings:()=>void;onStoryUpdate:(patch:Partial<XiaShuSession>)=>void}) {
 const [showPeople,setShowPeople]=useState(false); const [showMusic,setShowMusic]=useState(false); const [showStorySettings,setShowStorySettings]=useState(false);
 const resources = getXiaShuResources(active);
 const themeCss = active.customCSS ? scopeXiaShuCss(active.customCSS, active.id) : "";
 const activeChars = characters.filter(c => active.characterIds.includes(c.id));
 return <main className="xs-story" data-xiashu-theme={active.id}>
   {themeCss && <style data-xiashu-theme-style dangerouslySetInnerHTML={{__html: themeCss}}/>}
   <div className="xs-story-head"><button className="xs-icon xs-back-button" onClick={onBack} aria-label="返回"><ArrowLeft size={19}/></button><div><b>{active.title}</b><small>{active.worldName} · {activeChars.length}人同行</small></div><button className="xs-icon" onClick={() => setShowPeople(true)}><Users size={18}/></button></div>
   <div className="xs-story-tools"><button onClick={onReview}>剧情回顾</button><button onClick={onSlot}><Save size={14}/>存档</button><button onClick={() => setShowStorySettings(true)}><Settings2 size={14}/>剧情绑定</button><button onClick={() => setShowMusic(true)}><Music2 size={14}/>{musicName||"音乐"}</button></div>
   <div className="xs-feed">{messages.length===0 && <div className="xs-narration-card">旅程从这里开始。告诉这个世界，你想做什么。</div>}
   {messages.map(m => { const c=characters.find(x=>x.id===m.characterId); return <article key={m.id} className={`xs-msg ${m.role}`}>
     {m.role !== "narration" && <div className="xs-msg-head"><Avatar src={c?.avatar||undefined} name={m.characterName||c?.name||"角色"} size="sm"/><div><b>{m.characterName||c?.name||"角色"}</b><small>{new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></div></div>}
     {m.role === "user" ? <div className="xs-user-text">{m.rawContent}</div> : m.role === "narration" ? <div className="xs-narration-text">{m.rawContent}</div> : <div className="xs-ai-text" onClick={() => onSpeak(m.rawContent,m.characterId)}><TavernAdaptiveMessage characterId={m.characterId} content={m.rawContent} appId="xiashu" appTags={["story","xiashu"]} extraRegexes={resources.regexes} extraStatusBarIds={active.statusBarIds || []} render={content => <div className="xs-dialogue-content" dangerouslySetInnerHTML={{__html:content.replace(/\n/g,"<br/>")}}/>}/><span className="xs-listen"><Headphones size={12}/></span></div>}
   </article>; })}{generating&&<div className="xs-generating">正在续写 <i/> <i/> <i/></div>}</div>
   <div className="xs-composer"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();onSend();}}} placeholder="输入你的行动……"/><button onClick={onSend} disabled={generating||!draft.trim()}><ChevronRight size={18}/></button></div>
   {showPeople&&<div className="xs-overlay" onClick={() => setShowPeople(false)}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>当前人物</b><button onClick={() => setShowPeople(false)}><X size={16}/></button></div>{activeChars.map(c=><button className="xs-person-row" key={c.id} onClick={() => onAttr(c.id)}><Avatar src={c.avatar||undefined} name={c.name} size="sm"/><div><b>{c.name}</b><small>{c.personality||c.persona.slice(0,60)}</small></div><ChevronRight size={16}/></button>)}<div className="xs-user-row" onClick={() => onAttr("__user")}>用户属性 <ChevronRight size={16}/></div></div></div>}
   {showMusic&&<MusicPanel url={musicUrl} name={musicName} onSave={onMusic} onClose={() => setShowMusic(false)}/>} 
   {showStorySettings&&<StoryBindingPanel active={active} onSave={next => { onStoryUpdate(next); setShowStorySettings(false); }} onClose={() => setShowStorySettings(false)}/>} 
 </main>;
}

function PastPage({sessions,onOpen}:{sessions:XiaShuSession[];onOpen:(s:XiaShuSession)=>void}) { return <main className="xs-past"><div className="xs-kicker">ARCHIVE / 夏往</div><h1>走过的故事</h1>{sessions.length===0?<div className="xs-empty">还没有历史剧情。</div>:sessions.map(s=><button className="xs-archive" key={s.id} onClick={() => onOpen(s)}><div><b>{s.title}</b><span>{s.worldName} · {new Date(s.updatedAt).toLocaleString()}</span></div><ChevronRight size={17}/></button>)}</main> }
function ArchiveSlots({session,onClose,onOpen}:{session:XiaShuSession;onClose:()=>void;onOpen:(s:XiaShuSession,slot:XiaShuSlot)=>void}) { const slots=loadXiaShuSlots(session.id); return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>{session.title} · 选择存档</b><button onClick={onClose}><X size={16}/></button></div>{slots.length===0?<div className="xs-empty">这个剧情还没有存档。</div>:slots.map(slot=><button key={slot.id} className="xs-archive" onClick={() => onOpen(session,slot)}><div><b>{slot.name}</b><span>{slot.messageCount} 条剧情 · {new Date(slot.updatedAt).toLocaleString()}<br/>{slot.preview}</span></div><ChevronRight size={17}/></button>)}</div></div> }
function ReviewPanel({messages,onClose}:{messages:XiaShuMessage[];onClose:()=>void}) { return <div className="xs-overlay" onClick={onClose}><div className="xs-modal xs-review" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>剧情回顾</b><button onClick={onClose}><X size={16}/></button></div>{messages.map(m=><div key={m.id} className="xs-review-line"><b>{m.characterName||m.role}</b><span>{m.rawContent.replace(/<[^>]+>/g," ").slice(0,220)}</span></div>)}</div></div> }
function UserAttrPanel({onClose}:{onClose:()=>void}) { const identity=resolveUserIdentity(undefined,"story"); return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>用户 · 当前属性</b><button onClick={onClose}><X size={16}/></button></div><div className="xs-attr-top"><div className="xs-user-avatar"><UserRound size={28}/></div><div><b>{identity?.name||"用户"}</b><p>{identity?.bio||"当前世界中的玩家身份。"}</p></div></div><div className="xs-attr-grid"><div><span>身份</span><b>{identity?.name||"玩家"}</b></div><div><span>状态</span><b>正常</b></div></div></div></div> }
function AttrPanel({character,onClose}:{character:ReturnType<typeof loadCharacters>[number]|undefined;onClose:()=>void}) { if(!character)return <div/>; const ext=character.tavernCard?.data?.extensions as Record<string,unknown>|undefined; const attrs=(ext?.attributes&&typeof ext.attributes==="object"?ext.attributes:{}) as Record<string,unknown>; return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>{character.name} · 属性</b><button onClick={onClose}><X size={16}/></button></div><div className="xs-attr-top"><Avatar src={character.avatar||undefined} name={character.name} size="lg"/><div><b>{character.name}</b><p>{character.persona}</p></div></div><div className="xs-attr-grid">{Object.entries(attrs).map(([k,v])=><div key={k}><span>{k}</span><b>{String(v)}</b></div>)}</div>{!Object.keys(attrs).length&&<div className="xs-empty">这个角色的属性由剧情中的状态栏决定。</div>}</div></div> }
function MusicPanel({url,name,onSave,onClose}:{url:string;name:string;onSave:(u:string,n:string)=>void;onClose:()=>void}) { const [u,setU]=useState(url); const [n,setN]=useState(name); return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>剧情音乐</b><button onClick={onClose}><X size={16}/></button></div><input className="xs-input" value={n} onChange={e=>setN(e.target.value)} placeholder="音乐名称"/><input className="xs-input" value={u} onChange={e=>setU(e.target.value)} placeholder="网络音频地址 / Blob 地址"/><label className="xs-file">选择本地音乐<input type="file" accept="audio/*" onChange={e=>{const f=e.target.files?.[0];if(f){setU(URL.createObjectURL(f));setN(f.name)}}}/></label><button className="xs-primary" onClick={()=>{onSave(u,n);onClose()}}>绑定音乐</button></div></div> }

function SettingsPanel({active,volume,setVolume,voiceVolume,setVoiceVolume,onSave,onClose}:{active:XiaShuSession|null;volume:number;setVolume:(x:number)=>void;voiceVolume:number;setVoiceVolume:(x:number)=>void;onSave:(patch:Partial<XiaShuSession>)=>void;onClose:()=>void}) { return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>{active?"当前剧情设置":"夏书设置"}</b><button onClick={onClose}><X size={16}/></button></div><label>背景音量 <input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(+e.target.value)}/></label><label>人声音量 <input type="range" min="0" max="1" step=".01" value={voiceVolume} onChange={e=>setVoiceVolume(+e.target.value)}/></label><p className="xs-hint">剧情专属的预设、正则、状态栏、世界书与酒馆美化，请在剧情界面的「剧情绑定」里设置。</p></div></div> }

function StoryBindingPanel({active,onSave,onClose}:{active:XiaShuSession;onSave:(patch:Partial<XiaShuSession>)=>void;onClose:()=>void}) {
 const presets=loadPresets(); const regexes=loadRegexes(); const statusBars=loadTavernStatusBars(); const books=loadWorldBooks();
 const [presetId,setPresetId]=useState(active.presetId||""); const [regexIds,setRegexIds]=useState<string[]>(active.regexIds||[]); const [statusBarIds,setStatusBarIds]=useState<string[]>(active.statusBarIds||[]); const [worldBookId,setWorldBookId]=useState(active.worldBookId||""); const [css,setCss]=useState(active.customCSS||"");
 function toggle(arr:string[], id:string, set:(v:string[])=>void){set(arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]);}
 return <div className="xs-overlay" onClick={onClose}><div className="xs-modal xs-binding" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>剧情专属绑定</b><button onClick={onClose}><X size={16}/></button></div>
 <label>世界书<select className="xs-input" value={worldBookId} onChange={e=>setWorldBookId(e.target.value)}><option value="">不绑定</option>{books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
 <label>预设<select className="xs-input" value={presetId} onChange={e=>setPresetId(e.target.value)}><option value="">不指定（使用剧情默认）</option>{presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <div className="xs-bind-group"><b>剧情正则</b>{regexes.map(r=><label key={r.id} className="xs-check"><input type="checkbox" checked={regexIds.includes(r.id)} onChange={() => toggle(regexIds,r.id,setRegexIds)}/><span>{r.name}</span></label>)}</div>
 <div className="xs-bind-group"><b>剧情状态栏</b>{statusBars.map(b=><label key={b.id} className="xs-check"><input type="checkbox" checked={statusBarIds.includes(b.id)} onChange={() => toggle(statusBarIds,b.id,setStatusBarIds)}/><span>{b.name}</span></label>)}</div>
 <label>酒馆美化 CSS <textarea className="xs-theme-textarea" value={css} onChange={e=>setCss(e.target.value)} placeholder="可直接粘贴 custom_css，也可以导入 Tavern 导出的 JSON。"/></label>
 <label className="xs-file">导入 Tavern JSON<input type="file" accept=".json,application/json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const raw=JSON.parse(await f.text());const extracted=extractTavernCustomCss(raw);if(extracted)setCss(extracted);}catch{}}}/></label>
 <button className="xs-primary xs-bind-save" onClick={() => onSave({worldBookId:worldBookId||undefined,worldName:books.find(b=>b.id===worldBookId)?.name||active.worldName,presetId:presetId||undefined,regexIds,statusBarIds,customCSS:css||undefined})}>保存本剧情绑定</button>
 </div></div>
}
