"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, BookOpen, ChevronRight, Headphones, Music2, Pause, Play, Plus, Save, Settings2, UserRound, Users, Volume2, X } from "lucide-react";
import { loadCharacters } from "@/lib/character-storage";
import { loadCharacterWorldGroups } from "@/lib/character-world-storage";
import { loadTavernStatusBars, resolveUserIdentity } from "@/lib/settings-storage";
import { TavernAdaptiveMessage } from "@/components/chat/tavern-adaptive-message";
import { Avatar } from "@/components/ui/primitives";
import { createXiaShuSession, createXiaShuSlot, hydrateXiaShuStorage, loadXiaShuMessages, loadXiaShuSlotMessages, loadXiaShuSessions, loadXiaShuSlots, updateXiaShuSession, addXiaShuMessage } from "@/lib/xiashu/storage";
import { generateXiaShuCompletion, getXiaShuResources } from "@/lib/xiashu/engine";
import type { XiaShuMessage, XiaShuSession, XiaShuSlot } from "@/lib/xiashu/types";
import "./xia-shu.css";

type Props = { onClose: () => void };
type Page = "travel" | "past";

export function XiaShuApp({ onClose }: Props) {
  const [page, setPage] = useState<Page>("travel");
  const [sessions, setSessions] = useState<XiaShuSession[]>([]);
  const [active, setActive] = useState<XiaShuSession | null>(null);
  const [messages, setMessages] = useState<XiaShuMessage[]>([]);
  const [setupStep, setSetupStep] = useState<0|1|2>(0);
  const [selectedChars, setSelectedChars] = useState<string[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [attrId, setAttrId] = useState<string | null>(null);
  const [slots, setSlots] = useState<XiaShuSlot[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [voiceVolume, setVoiceVolume] = useState(0.8);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [archiveSession, setArchiveSession] = useState<XiaShuSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const characters = useMemo(() => loadCharacters(), [setupStep, active, page]);
  const worlds = useMemo(() => loadCharacterWorldGroups(), [setupStep, active, page]);

  const refresh = () => { setSessions(loadXiaShuSessions()); if (active) { setMessages(loadXiaShuMessages(active.id)); setSlots(loadXiaShuSlots(active.id)); } };
  useEffect(() => { hydrateXiaShuStorage().then(refresh); }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => { if (!active) return; setMessages(loadXiaShuMessages(active.id)); setSlots(loadXiaShuSlots(active.id)); }, [active]);

  function startSession() {
    if (!selectedChars.length || !selectedWorld) return;
    const world = worlds.find(w => w.id === selectedWorld);
    const s = createXiaShuSession({ title: `${world?.name || "新旅程"} · ${characters.filter(c=>selectedChars.includes(c.id)).map(c=>c.name).join("、")}`, characterIds: selectedChars, worldId: selectedWorld, worldName: world?.name || "未知世界" });
    setActive(s); setMessages([]); setSlots(loadXiaShuSlots(s.id)); setSetupStep(0); setPage("travel");
  }
  async function send() {
    const text = draft.trim(); if (!text || !active || generating) return;
    addXiaShuMessage({ sessionId: active.id, role: "user", rawContent: text }); setDraft(""); setMessages(loadXiaShuMessages(active.id)); setGenerating(true);
    try { const history = loadXiaShuMessages(active.id); const result = await generateXiaShuCompletion(active.characterIds, active.worldId, history); addXiaShuMessage({ sessionId: active.id, role: "assistant", characterId: active.characterIds[0], characterName: characters.find(c=>c.id===active.characterIds[0])?.name, rawContent: result.rawText, renderedContent: result.renderedText }); setMessages(loadXiaShuMessages(active.id)); }
    catch (e) { addXiaShuMessage({ sessionId: active.id, role: "narration", rawContent: `【生成失败】${e instanceof Error ? e.message : "未知错误"}` }); setMessages(loadXiaShuMessages(active.id)); }
    finally { setGenerating(false); }
  }
  function newSlot() { if (!active) return; const s = createXiaShuSlot(active.id); updateXiaShuSession(active.id, { currentSlotId: s.id }); setSlots(loadXiaShuSlots(active.id)); }
  function openSlot(session: XiaShuSession, slot: XiaShuSlot) { updateXiaShuSession(session.id, { currentSlotId: slot.id }); setActive({ ...session, currentSlotId: slot.id }); setMessages(loadXiaShuSlotMessages(slot.id)); setSlots(loadXiaShuSlots(session.id)); }
  function speak(text: string, characterId?: string) { const c = characters.find(x=>x.id===characterId); const ext = c?.tavernCard?.data?.extensions as Record<string,unknown>|undefined; const url = typeof ext?.voice_url === "string" ? ext.voice_url : typeof ext?.voiceUrl === "string" ? ext.voiceUrl : ""; if (url) { const a = new Audio(url); a.volume = voiceVolume; a.play().catch(()=>{}); return; } if (typeof window !== "undefined" && "speechSynthesis" in window) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g," ")); u.volume = voiceVolume; speechSynthesis.speak(u); } }

  useEffect(() => { if (!active && page === "travel" && setupStep === 0 && sessions.length === 0) setSetupStep(1); }, [active, page, setupStep, sessions.length]);

  return <div className="xs-app">
    <header className="xs-header"><button onClick={onClose} className="xs-icon"><X size={18}/></button><div className="xs-brand"><span>夏书</span><small>剧情旅程</small></div><button className="xs-icon" onClick={()=>setSettingsOpen(true)}><Settings2 size={18}/></button></header>
    <nav className="xs-tabs"><button className={page==="travel"?"active":""} onClick={()=>setPage("travel")}><BookOpen size={16}/>夏旅</button><button className={page==="past"?"active":""} onClick={()=>setPage("past")}><Bookmark size={16}/>夏往</button></nav>
    {page === "past" ? (
      <>
        <PastPage sessions={sessions} onOpen={(s)=>setArchiveSession(s)} />
        {archiveSession && <ArchiveSlots session={archiveSession} onClose={()=>setArchiveSession(null)} onOpen={(s,slot)=>{openSlot(s,slot);setArchiveSession(null);setPage("travel");}}/>}
      </>
    ) : active ? (
      <StoryPage active={active} messages={messages} characters={characters} draft={draft} setDraft={setDraft} generating={generating} onSend={send} onBack={()=>setActive(null)} onAttr={setAttrId} onReview={()=>setReviewOpen(true)} onSlot={newSlot} onSpeak={speak} voiceVolume={voiceVolume} volume={volume} musicUrl={musicUrl} musicName={musicName} onMusic={(url,name)=>{setMusicUrl(url);setMusicName(name);updateXiaShuSession(active.id,{musicUrl:url,musicName:name});}}/>
    ) : (
      <SetupPage step={setupStep} setStep={setSetupStep} chars={characters} worlds={worlds} selectedChars={selectedChars} setSelectedChars={setSelectedChars} selectedWorld={selectedWorld} setSelectedWorld={setSelectedWorld} onStart={startSession}/>
    )} 
    {attrId === "__user" ? <UserAttrPanel onClose={()=>setAttrId(null)}/> : attrId && <AttrPanel character={characters.find(c=>c.id===attrId)!} onClose={()=>setAttrId(null)}/>} 
    {reviewOpen && <ReviewPanel messages={messages} onClose={()=>setReviewOpen(false)}/>} 
    {settingsOpen && <SettingsPanel volume={volume} setVolume={setVolume} voiceVolume={voiceVolume} setVoiceVolume={setVoiceVolume} onClose={()=>setSettingsOpen(false)}/>} 
  </div>;
}

function SetupPage({step,setStep,chars,worlds,selectedChars,setSelectedChars,selectedWorld,setSelectedWorld,onStart}:{step:0|1|2;setStep:(x:0|1|2)=>void;chars:ReturnType<typeof loadCharacters>;worlds:ReturnType<typeof loadCharacterWorldGroups>;selectedChars:string[];setSelectedChars:(x:string[])=>void;selectedWorld:string;setSelectedWorld:(x:string)=>void;onStart:()=>void}) {
 return <main className="xs-setup"><div className="xs-kicker">NEW JOURNEY / 夏旅</div><h1>先选同行者<br/><em>再决定你要去的世界。</em></h1>
 {step===1 && <section className="xs-choice"><div className="xs-section-title"><Users size={16}/>同行角色 <span>可单选 / 多选</span></div><div className="xs-character-grid">{chars.map(c=><button key={c.id} className={selectedChars.includes(c.id)?"selected":""} onClick={()=>setSelectedChars(selectedChars.includes(c.id)?selectedChars.filter(x=>x!==c.id):[...selectedChars,c.id])}><Avatar src={c.avatar||undefined} name={c.name} size="md"/><span>{c.name}</span><small>{c.personality||c.persona.slice(0,28)||"角色"}</small></button>)}</div><button className="xs-primary" disabled={!selectedChars.length} onClick={()=>setStep(2)}>下一步 <ChevronRight size={16}/></button></section>}
 {step===2 && <section className="xs-choice"><div className="xs-section-title"><BookOpen size={16}/>选择世界观</div><div className="xs-world-list">{worlds.map(w=><button key={w.id} className={selectedWorld===w.id?"selected":""} onClick={()=>setSelectedWorld(w.id)}><b>{w.name}</b><span>{w.description||"这个世界还没有写下简介。"}</span></button>)}</div><div className="xs-row"><button className="xs-ghost" onClick={()=>setStep(1)}>返回</button><button className="xs-primary" disabled={!selectedWorld} onClick={onStart}>开始夏旅 <ChevronRight size={16}/></button></div></section>}
 {step===0 && <section className="xs-empty"><p>还没有正在进行的夏旅。</p><button className="xs-primary" onClick={()=>setStep(1)}><Plus size={16}/>创建副本</button></section>}
 </main>;
}

function StoryPage({active,messages,characters,draft,setDraft,generating,onSend,onBack,onAttr,onReview,onSlot,onSpeak,voiceVolume,volume,musicUrl,musicName,onMusic}:{active:XiaShuSession;messages:XiaShuMessage[];characters:ReturnType<typeof loadCharacters>;draft:string;setDraft:(x:string)=>void;generating:boolean;onSend:()=>void;onBack:()=>void;onAttr:(x:string)=>void;onReview:()=>void;onSlot:()=>void;onSpeak:(text:string,id?:string)=>void;voiceVolume:number;volume:number;musicUrl:string;musicName:string;onMusic:(url:string,name:string)=>void}) {
 const [showPeople,setShowPeople]=useState(false); const [showMusic,setShowMusic]=useState(false); const statusBars=loadTavernStatusBars();
 return <main className="xs-story"><div className="xs-story-head"><button className="xs-icon" onClick={onBack}><ArrowLeft size={18}/></button><div><b>{active.title}</b><small>{active.worldName} · {characters.filter(c=>active.characterIds.includes(c.id)).length}人同行</small></div><button className="xs-icon" onClick={()=>setShowPeople(true)}><Users size={18}/></button></div><div className="xs-story-tools"><button onClick={onReview}>剧情回顾</button><button onClick={onSlot}><Save size={14}/>存档</button><button onClick={()=>setShowMusic(true)}><Music2 size={14}/>{musicName||"音乐"}</button></div>
 <div className="xs-feed">{messages.length===0 && <div className="xs-narration-card">旅程从这里开始。告诉这个世界，你想做什么。</div>}{messages.map(m=>{const c=characters.find(x=>x.id===m.characterId); return <article key={m.id} className={`xs-msg ${m.role}`}>{m.role!=="narration" && <div className="xs-msg-head"><Avatar src={c?.avatar||undefined} name={m.characterName||c?.name||"角色"} size="sm"/><div><b>{m.characterName||c?.name||"角色"}</b><small>{new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></div></div>}{m.role==="user" ? <div className="xs-user-text">{m.rawContent}</div> : m.role==="narration" ? <div className="xs-narration-text">{m.rawContent}</div> : <div className="xs-ai-text" onClick={()=>onSpeak(m.rawContent,m.characterId)}><TavernAdaptiveMessage characterId={m.characterId} content={m.renderedContent||m.rawContent} render={content=><div dangerouslySetInnerHTML={{__html:content.replace(/\n/g,"<br/>")}}/>}/><span className="xs-listen"><Headphones size={12}/></span></div>}</article>})}{generating&&<div className="xs-generating">正在续写 <i/> <i/> <i/></div>}</div>
 <div className="xs-composer"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();onSend();}}} placeholder="输入你的行动……"/><button onClick={onSend} disabled={generating||!draft.trim()}><ChevronRight size={18}/></button></div>
 {showPeople&&<div className="xs-overlay" onClick={()=>setShowPeople(false)}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>当前人物</b><button onClick={()=>setShowPeople(false)}><X size={16}/></button></div>{characters.filter(c=>active.characterIds.includes(c.id)).map(c=><button className="xs-person-row" key={c.id} onClick={()=>onAttr(c.id)}><Avatar src={c.avatar||undefined} name={c.name} size="sm"/><div><b>{c.name}</b><small>{c.personality||c.persona.slice(0,60)}</small></div><ChevronRight size={16}/></button>)}<div className="xs-user-row" onClick={()=>onAttr("__user")}>用户属性 <ChevronRight size={16}/></div></div></div>}
 {showMusic&&<MusicPanel url={musicUrl} name={musicName} onSave={onMusic} onClose={()=>setShowMusic(false)}/>}</main>
}

function PastPage({sessions,onOpen}:{sessions:XiaShuSession[];onOpen:(s:XiaShuSession)=>void}) { return <main className="xs-past"><div className="xs-kicker">ARCHIVE / 夏往</div><h1>走过的故事</h1>{sessions.length===0?<div className="xs-empty">还没有历史剧情。</div>:sessions.map(s=><button className="xs-archive" key={s.id} onClick={()=>onOpen(s)}><div><b>{s.title}</b><span>{s.worldName} · {new Date(s.updatedAt).toLocaleString()}</span></div><ChevronRight size={17}/></button>)}</main> }

function ArchiveSlots({session,onClose,onOpen}:{session:XiaShuSession;onClose:()=>void;onOpen:(s:XiaShuSession,slot:XiaShuSlot)=>void}) { const slots=loadXiaShuSlots(session.id); return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>{session.title} · 选择存档</b><button onClick={onClose}><X size={16}/></button></div>{slots.length===0?<div className="xs-empty">这个剧情还没有存档。</div>:slots.map(slot=><button key={slot.id} className="xs-archive" onClick={()=>onOpen(session,slot)}><div><b>{slot.name}</b><span>{slot.messageCount} 条剧情 · {new Date(slot.updatedAt).toLocaleString()}<br/>{slot.preview}</span></div><ChevronRight size={17}/></button>)}</div></div> }

function ReviewPanel({messages,onClose}:{messages:XiaShuMessage[];onClose:()=>void}) { return <div className="xs-overlay" onClick={onClose}><div className="xs-modal xs-review" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>剧情回顾</b><button onClick={onClose}><X size={16}/></button></div>{messages.map(m=><div key={m.id} className="xs-review-line"><b>{m.characterName||m.role}</b><span>{m.rawContent.replace(/<[^>]+>/g," ").slice(0,220)}</span></div>)}</div></div> }
function UserAttrPanel({onClose}:{onClose:()=>void}) { const identity=resolveUserIdentity(undefined,"story"); return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>用户 · 当前属性</b><button onClick={onClose}><X size={16}/></button></div><div className="xs-attr-top"><div className="xs-user-avatar"><UserRound size={28}/></div><div><b>{identity?.name||"用户"}</b><p>{identity?.bio||"当前世界中的玩家身份。"}</p></div></div><div className="xs-attr-grid"><div><span>身份</span><b>{identity?.name||"玩家"}</b></div><div><span>状态</span><b>正常</b></div></div></div></div> }

function AttrPanel({character,onClose}:{character:ReturnType<typeof loadCharacters>[number]|undefined;onClose:()=>void}) { if(!character)return <div/>; const ext=character.tavernCard?.data?.extensions as Record<string,unknown>|undefined; const attrs=(ext?.attributes&&typeof ext.attributes==="object"?ext.attributes:{}) as Record<string,unknown>; return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>{character.name} · 属性</b><button onClick={onClose}><X size={16}/></button></div><div className="xs-attr-top"><Avatar src={character.avatar||undefined} name={character.name} size="lg"/><div><b>{character.name}</b><p>{character.persona}</p></div></div><div className="xs-attr-grid">{Object.entries(attrs).map(([k,v])=><div key={k}><span>{k}</span><b>{String(v)}</b></div>)}</div>{!Object.keys(attrs).length&&<div className="xs-empty">这个角色的属性由剧情中的状态栏决定。</div>}</div></div> }
function MusicPanel({url,name,onSave,onClose}:{url:string;name:string;onSave:(u:string,n:string)=>void;onClose:()=>void}) { const [u,setU]=useState(url); const [n,setN]=useState(name); return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>剧情音乐</b><button onClick={onClose}><X size={16}/></button></div><input className="xs-input" value={n} onChange={e=>setN(e.target.value)} placeholder="音乐名称"/><input className="xs-input" value={u} onChange={e=>setU(e.target.value)} placeholder="网络音频地址 / Blob 地址"/><label className="xs-file">选择本地音乐<input type="file" accept="audio/*" onChange={e=>{const f=e.target.files?.[0];if(f){setU(URL.createObjectURL(f));setN(f.name)}}}/></label><button className="xs-primary" onClick={()=>{onSave(u,n);onClose()}}>绑定音乐</button></div></div> }
function SettingsPanel({volume,setVolume,voiceVolume,setVoiceVolume,onClose}:{volume:number;setVolume:(x:number)=>void;voiceVolume:number;setVoiceVolume:(x:number)=>void;onClose:()=>void}) { return <div className="xs-overlay" onClick={onClose}><div className="xs-modal" onClick={e=>e.stopPropagation()}><div className="xs-modal-head"><b>夏书设置</b><button onClick={onClose}><X size={16}/></button></div><label>背景音量 <input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(+e.target.value)}/></label><label>人声音量 <input type="range" min="0" max="1" step=".01" value={voiceVolume} onChange={e=>setVoiceVolume(+e.target.value)}/></label></div></div> }
