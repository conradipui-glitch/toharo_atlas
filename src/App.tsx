import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check,
  CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck,
  Clock3, Cloud, Code2, Compass, Copy, Cpu, Database, ExternalLink, FileText,
  Filter, Folder, FolderHeart, Globe2, Grid2X2, Heart, Image, Info, Layers3,
  Link2, ListFilter, LoaderCircle, LockKeyhole, Maximize2, Minus, MoreHorizontal,
  PenLine, Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Sparkles, Square, Trash2, Users, Video, WandSparkles, X, Zap
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  CATEGORIES, type Bookmark, type ModelInfo, type ModelTest, type View, type Tone
} from './types';
import {
  createBookmark, deleteBookmark, deleteDemoBookmarks, desktop, getPref, loadBookmarks,
  normalizeUrl, saveBookmark, seedDemoIfNew, setPref
} from './data';
import { analyze, costPerMillion, deleteKey, fetchModels, isFree, keyIsReady, PREFERRED_MODEL, saveKey, testModel } from './models';

const NAV: {id: View; title: string; icon: typeof Grid2X2}[] = [
  { id:'all', title:'Все находки', icon:Grid2X2 },
  { id:'authors', title:'Авторы', icon:Users },
  { id:'videos', title:'Видео и Reels', icon:Video },
  { id:'resources', title:'Ссылки', icon:Link2 },
  { id:'insights', title:'AI-выжимка', icon:Sparkles }
];
const niceDate = (d: string) => {
  try { return new Intl.DateTimeFormat('ru-RU', {day:'numeric',month:'short'}).format(new Date(d)); }
  catch { return ''; }
};
const domain = (link: string) => { try { return new URL(link).hostname.replace(/^www\./,''); } catch { return link; } };
const clipText = (t: string, len = 180) => t.length > len ? t.slice(0,len).trim() + '…' : t;
const rowKey = (b: Bookmark) => b.author.trim() || domain(b.url);
const titleFor = (view: View, collection: string) => view === 'collection' ? collection : NAV.find(n=>n.id === view)?.title || 'Все находки';

type Draft = {url: string;title: string;author: string;category: string;notes: string};
const blank = (category = CATEGORIES[0]): Draft => ({url:'',title:'',author:'',category,notes:''});

function WindowButtons() {
  if (!desktop) return <span className="web-badge">WEB PREVIEW</span>;
  const window = getCurrentWindow();
  return <div className="window-actions">
    <button title="Свернуть" onClick={()=>void window.minimize()}><Minus size={15}/></button>
    <button title="Развернуть" onClick={()=>void window.toggleMaximize()}><Square size={12}/></button>
    <button className="close-app" title="Закрыть" onClick={()=>void window.close()}><X size={16}/></button>
  </div>;
}

function Cover({bookmark,small = false}:{bookmark:Bookmark;small?:boolean}) {
  const glyph = bookmark.source === 'Instagram' ? 'ig' : bookmark.source === 'YouTube' ? '▶' :
    bookmark.source === 'GitHub' ? '</>' : bookmark.source === 'TikTok' ? '♪' :
    domain(bookmark.url).split('.')[0].slice(0,2).toUpperCase();
  return <div className={'cover tone-' + bookmark.color + (small ? ' cover-small':'')}>
    <div className="cover-orb"/><div className="cover-orb second"/>
    <div className="cover-top"><span className="cover-series">ATLAS / ARCHIVE</span><ArrowUpRight size={15}/></div>
    <span className="cover-glyph">{glyph}</span>
    <div className="cover-bottom"><span>{bookmark.source.toUpperCase()}</span><span>◦ {domain(bookmark.url)}</span></div>
  </div>;
}

function BookmarkCard({bookmark,open}:{bookmark:Bookmark;open:(b:Bookmark)=>void}) {
  return <button className="bookmark-card" onClick={()=>open(bookmark)} aria-label={'Открыть ' + bookmark.title}>
    <Cover bookmark={bookmark}/>
    <div className="card-copy">
      <div className="card-meta"><span className="source-dot"/>{bookmark.author || bookmark.source}
        {bookmark.demo ? <span className="demo-label">ПРИМЕР</span> : null}</div>
      <div className="card-title">{bookmark.title}</div>
      <div className="card-description">{clipText(bookmark.ai_summary || bookmark.description || bookmark.notes || 'Ссылка сохранена в библиотеке.',105)}</div>
      <div className="card-foot"><span className="tag-chip">{bookmark.category}</span><span>{niceDate(bookmark.created_at)}</span></div>
    </div>
  </button>;
}

function Dialog({title,children,close,wide=false}:{title:string;children:React.ReactNode;close:()=>void;wide?:boolean}) {
  useEffect(()=>{ const handler=(e:KeyboardEvent)=>{ if(e.key==='Escape')close(); };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[close]);
  return <div className="scrim" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
    <section role="dialog" aria-modal="true" aria-label={title} className={'modal '+(wide?'modal-wide':'')}>
      <div className="modal-heading"><div><div className="eyebrow">TOHARO / ATLAS</div><h2>{title}</h2></div><button className="icon-btn" aria-label="Закрыть" onClick={close}><X size={18}/></button></div>
      {children}
    </section>
  </div>;
}

function EmptyState({title,desc,action}:{title:string;desc:string;action?:()=>void}) {
  return <div className="empty-state"><div className="empty-art"><Layers3 size={40}/></div><h3>{title}</h3><p>{desc}</p>{action && <button className="primary-btn" onClick={action}><Plus size={17}/>Добавить находку</button>}</div>;
}

export default function App() {
  const [items,setItems] = useState<Bookmark[]>([]);
  const [ready,setReady] = useState(false);
  const [view,setView] = useState<View>('all');
  const [collection,setCollection] = useState(CATEGORIES[1]);
  const [query,setQuery] = useState('');
  const [selected,setSelected] = useState<Bookmark|null>(null);
  const [addOpen,setAddOpen] = useState(false);
  const [editTarget,setEditTarget] = useState<Bookmark|null>(null);
  const [draft,setDraft] = useState<Draft>(blank());
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [models,setModels] = useState<ModelInfo[]>([]);
  const [modelError,setModelError] = useState('');
  const [modelBusy,setModelBusy] = useState(false);
  const [modelQuery,setModelQuery] = useState('');
  const [freeOnly,setFreeOnly] = useState(false);
  const [checkedModels,setCheckedModels] = useState<string[]>([PREFERRED_MODEL]);
  const [activeModel,setActiveModel] = useState(PREFERRED_MODEL);
  const [keyReady,setKeyReady] = useState(false);
  const [keyInput,setKeyInput] = useState('');
  const [tests,setTests] = useState<Record<string,ModelTest>>({});
  const [testing,setTesting] = useState(false);
  const [analyzing,setAnalyzing] = useState(false);
  const [toast,setToast] = useState('');
  const [sort,setSort] = useState<'newest'|'oldest'|'alphabet'>('newest');
  const [showFilter,setShowFilter] = useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const searchRef=useRef<HTMLInputElement>(null);

  const showToast = (message:string) => { setToast(message); };
  const reload = useCallback(async()=>{setItems(await loadBookmarks());},[]);
  const refreshModels = useCallback(async()=>{
    setModelBusy(true);setModelError('');
    try { setModels(await fetchModels()); }
    catch(e) { setModelError(e instanceof Error ? e.message : String(e)); }
    finally { setModelBusy(false); }
  },[]);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try {
        await seedDemoIfNew();
        const [saved,checked,active,configured] = await Promise.all([
          loadBookmarks(),getPref('checkedModels'),getPref('activeModel',PREFERRED_MODEL),keyIsReady()
        ]);
        if (!alive) return;
        setItems(saved);
        if (checked) { try {const arr = JSON.parse(checked) as string[];if(Array.isArray(arr))setCheckedModels(arr);}catch{/* preference reset */} }
        setActiveModel(active);
        setKeyReady(configured);
        if (desktop) void refreshModels();
      } catch(e) { showToast('Ошибка запуска: ' + String(e)); }
      finally { if (alive) setReady(true); }
    })();
    return()=>{alive=false;};
  },[refreshModels]);

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();setAddOpen(true);}
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[]);

  const collections = useMemo(()=>[...new Set([...CATEGORIES.slice(1),...items.map(i=>i.category).filter(c=>c!==CATEGORIES[0])])], [items]);
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const result=items.filter(b=>{
      if(view==='videos' && !['Instagram','YouTube','TikTok'].includes(b.source)) return false;
      if(view==='insights' && !b.ai_summary && !b.notes) return false;
      if(view==='collection' && b.category!==collection) return false;
      return !q || [b.title,b.url,b.author,b.category,b.description,b.notes,b.ai_summary,...b.tags].some(s=>s.toLowerCase().includes(q));
    });
    return result.sort((a,b)=>sort==='alphabet'?a.title.localeCompare(b.title):sort==='oldest'?a.created_at.localeCompare(b.created_at):b.created_at.localeCompare(a.created_at));
  },[items,view,collection,query,sort]);

  const authorGroups=useMemo(()=>{
    const groups=new Map<string,Bookmark[]>();
    for(const b of visible){const author=rowKey(b);groups.set(author,[...(groups.get(author)||[]),b]);}
    return [...groups.entries()].sort((a,b)=>b[1].length-a[1].length);
  },[visible]);

  const stats = [
    {label:'Сохранено материалов',value:items.length,icon:Layers3},
    {label:'Интересных авторов',value:new Set(items.map(rowKey)).size,icon:Users},
    {label:'AI-выжимок',value:items.filter(i=>Boolean(i.ai_summary)).length,icon:Sparkles}
  ];

  const openAdd=(target?:Bookmark)=>{
    setEditTarget(target||null);
    setDraft(target ? {url:target.url,title:target.title,author:target.author,category:target.category,notes:target.notes} : blank(view==='collection'?collection:CATEGORIES[0]));
    setAddOpen(true);
  };
  const handleSave=async(e:React.FormEvent)=>{
    e.preventDefault();
    try{
      const link=normalizeUrl(draft.url);
      if(items.some(i=>i.url===link && i.id!==editTarget?.id)) throw new Error('Такая ссылка уже есть в библиотеке.');
      const item=editTarget ? {...editTarget,...draft,url:link,updated_at:new Date().toISOString(),demo:0}:createBookmark(link,draft.title.trim()||domain(link),draft.category,draft.author.trim(),draft.notes);
      await saveBookmark(item);await reload();setSelected(current=>current?.id===item.id?item:current);
      setAddOpen(false);showToast(editTarget?'Изменения сохранены':'Добавлено в библиотеку');
    } catch(e){showToast(e instanceof Error?e.message:String(e));}
  };
  const handleDelete=async(b:Bookmark)=>{
    if(!window.confirm('Удалить «'+b.title+'» из библиотеки?'))return;
    try{await deleteBookmark(b.id);await reload();setSelected(null);showToast('Находка удалена');}
    catch(e){showToast(String(e));}
  };
  const runAnalysis=async(b:Bookmark)=>{
    if(!desktop){showToast('ИИ работает в Windows-приложении, не в веб-просмотре');return;}
    if(!keyReady){setSettingsOpen(true);showToast('Сначала добавь OpenRouter API-ключ');return;}
    if(!activeModel){setSettingsOpen(true);showToast('Выбери активную модель');return;}
    setAnalyzing(true);
    try {
      const result=await analyze(activeModel,b.title,b.url,b.notes||b.description);
      const updated={...b,ai_summary:result.summary,tags:result.tags,updated_at:new Date().toISOString()};
      await saveBookmark(updated);await reload();setSelected(updated);showToast('AI-выжимка готова');
    }catch(e){showToast('ИИ: '+String(e));}
    finally{setAnalyzing(false);}
  };
  const changeChecked=async(id:string,on:boolean)=>{
    const result=on?[...new Set([...checkedModels,id])]:checkedModels.filter(m=>m!==id);
    setCheckedModels(result);await setPref('checkedModels',JSON.stringify(result));
    if(!result.includes(activeModel)){const replacement=result[0]||'';setActiveModel(replacement);await setPref('activeModel',replacement);}
  };
  const changeActive=async(id:string)=>{setActiveModel(id);await setPref('activeModel',id);};
  const configureKey=async(e:React.FormEvent)=>{
    e.preventDefault();
    try{await saveKey(keyInput);setKeyReady(true);setKeyInput('');showToast('Ключ сохранён в Windows Credential Manager');void refreshModels();}
    catch(e){showToast(String(e));}
  };
  const removeKey=async()=>{
    if(!window.confirm('Удалить сохранённый OpenRouter API-ключ?'))return;
    try{await deleteKey();setKeyReady(false);showToast('Ключ удалён');}
    catch(e){showToast(String(e));}
  };
  const testSelected=async()=>{
    if(!keyReady){showToast('Для проверки моделей нужен API-ключ');return;}
    if(!checkedModels.length){showToast('Сначала отметь хотя бы одну модель');return;}
    if(checkedModels.length>12 && !window.confirm('Проверка '+checkedModels.length+' моделей может быть платной. Продолжить?'))return;
    setTesting(true);
    const outcomes:Record<string,ModelTest>={};
    for(const id of checkedModels){
      try{outcomes[id]=await testModel(id);}
      catch(e){outcomes[id]={error:String(e)};}
      setTests({...outcomes});
    }
    setTesting(false);showToast('Проверено моделей: '+checkedModels.length);
  };
  const clearDemos=async()=>{await deleteDemoBookmarks();await reload();setSelected(null);showToast('Примеры удалены');};
  const exportData=()=>{
    const blob=new Blob([JSON.stringify({version:1,bookmarks:items},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='toharo-atlas-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    showToast('Экспорт подготовлен');
  };
  const importData=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>5_000_000)throw new Error('Файл больше 5 МБ');
      const parsed=JSON.parse(await file.text()) as {bookmarks?:Bookmark[]};
      if(!Array.isArray(parsed.bookmarks))throw new Error('Некорректный формат бэкапа');
      let count=0;
      for(const b of parsed.bookmarks.slice(0,1000)){
        if(!b||typeof b.url!=='string'||typeof b.title!=='string')continue;
        const url=normalizeUrl(b.url);
        if(items.some(i=>i.url===url))continue;
        const newItem={...createBookmark(url,b.title,String(b.category||CATEGORIES[0]),String(b.author||''),String(b.notes||'')),description:String(b.description||''),tags:Array.isArray(b.tags)?b.tags.filter(t=>typeof t==='string').slice(0,15):[],ai_summary:String(b.ai_summary||''),demo:0};
        await saveBookmark(newItem);count++;
      }
      await reload();showToast('Импортировано: '+count);
    }catch(error){showToast('Импорт: '+String(error));}
    e.target.value='';
  };

  const modelRows=useMemo(()=>models.filter(m=>(!freeOnly||isFree(m))&&(m.name+' '+m.id).toLowerCase().includes(modelQuery.toLowerCase())).sort((a,b)=>{
    const as=checkedModels.includes(a.id)?1:0,bs=checkedModels.includes(b.id)?1:0;
    return bs-as||a.name.localeCompare(b.name);
  }),[models,freeOnly,modelQuery,checkedModels]);

  return <div className="app-shell">
    <div className="titlebar">
      <div className="title-brand" data-tauri-drag-region><span className="mark">t<span>.</span></span><span className="title-brand-label">TOHARO <span>ATLAS</span></span><span className="title-version">/ 01</span></div>
      <div className="title-drag" data-tauri-drag-region/>
      <div className="title-indicator"><span className="live-dot"/> LOCAL FIRST</div>
      <WindowButtons/>
    </div>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-upper">
          <div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
          <div className="nav-stack">
            {NAV.map(entry=>{
              const Icon=entry.icon;return <button key={entry.id} className={'nav-item '+(view===entry.id?'nav-active':'')} onClick={()=>setView(entry.id)}><Icon size={18}/><span>{entry.title}</span>{entry.id==='all'&&<span className="nav-count">{items.length}</span>}</button>;
            })}
          </div>
          <div className="section-line"/>
          <div className="nav-section-head"><span>КОЛЛЕКЦИИ</span><button title="Добавить находку" onClick={()=>openAdd()}><Plus size={16}/></button></div>
          <div className="nav-stack">
            {collections.map((c,i)=><button key={c} className={'nav-item collection-item '+(view==='collection'&&collection===c?'nav-active':'')} onClick={()=>{setCollection(c);setView('collection');}}>
              <span className={'collection-dot collection-color-'+i%5}/><span>{c}</span><span className="nav-count">{items.filter(b=>b.category===c).length||''}</span>
            </button>)}
          </div>
        </div>
        <div className="sidebar-bottom">
          <button className="connect-card" onClick={()=>setSettingsOpen(true)}>
            <span className="connect-symbol"><Sparkles size={17}/></span>
            <span><strong>AI-помощник</strong><small>{keyReady?'OpenRouter подключён':'Подключить модель'}</small></span>
            <ChevronRight size={17}/>
          </button>
          <button className="user-block" onClick={()=>setSettingsOpen(true)}>
            <div className="avatar">T</div><span><strong>Личная библиотека</strong><small>Данные на этом устройстве</small></span><Settings2 size={17}/>
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="content-top">
          <div className="breadcrumbs"><span>Моя библиотека</span><ChevronRight size={13}/><strong>{titleFor(view,collection)}</strong></div>
          <div className="top-actions"><span className="sync-note"><span className="live-dot"/> {desktop?'Локальная база SQLite':'Демо в браузере'}</span><button className="round-quiet" aria-label="Настройки" onClick={()=>setSettingsOpen(true)}><Settings2 size={18}/></button></div>
        </div>
        <div className="scroll-content">
          <div className="page-intro">
            <div><div className="eyebrow intro-eyebrow"><span className="sparkle-character">✳</span> YOUR CURATED UNIVERSE</div>
              <h1>{view==='all'?'Всё интересное —':'Смотри глубже.'}<br/><em>{view==='all'?'в одном месте.':titleFor(view,collection)}</em></h1>
              <p>Сохраняй идеи. Собирай знания. Возвращайся к действительно важному.</p>
            </div>
            <button className="primary-btn add-main" onClick={()=>openAdd()}><Plus size={18}/> Новая находка <span>↗</span></button>
          </div>
          <div className="stats-row">{stats.map(({label,value,icon:Icon},index)=><div key={label} className="stat-box"><span className="stat-icon"><Icon size={18}/></span><div><span className="stat-count">{String(value).padStart(2,'0')}</span><div className="stat-label">{label}</div></div><span className="stat-number">{'0'+(index+1)}</span></div>)}</div>
          <div className="section-toolbar">
            <div className="section-title"><div className="section-eyebrow">EXPLORE YOUR COLLECTION</div><h2>{titleFor(view,collection)} <span>{visible.length}</span></h2></div>
            <div className="controls"><label className="search-box"><Search size={17}/><input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти что угодно..."/><kbd>⌘ K</kbd></label>
              <div className="sort-wrap"><button className={'filter-btn '+(showFilter?'filter-selected':'')} title="Сортировка" onClick={()=>setShowFilter(v=>!v)}><SlidersHorizontal size={18}/></button>{showFilter&&<div className="sort-menu">{([['newest','Сначала новые'],['oldest','Сначала старые'],['alphabet','По алфавиту']] as const).map(([k,v])=><button key={k} onClick={()=>{setSort(k);setShowFilter(false);}}>{sort===k&&<Check size={14}/>}<span>{v}</span></button>)}</div>}</div></div>
          </div>
          {items.some(i=>i.demo===1)&&<div className="demo-strip"><Info size={16}/><span>Это примеры, чтобы показать интерфейс. Можешь удалить их и начать с чистого листа.</span><button onClick={()=>void clearDemos()}>Убрать примеры <ArrowRight size={15}/></button></div>}
          {!ready?<div className="loading-content"><LoaderCircle className="spin"/> Открываем библиотеку…</div>
          :view==='authors'?
            authorGroups.length?<div className="author-grid">{authorGroups.map(([author,records],index)=><button className="author-card" key={author} onClick={()=>{setView('all');setQuery(author);}}><div className={'author-avatar tone-'+(['violet','coral','mint','blue','amber','rose'][index%6])}>{author.slice(0,2).toUpperCase()}</div><div className="author-body"><h3>{author}</h3><p>{records.length} {records.length===1?'материал':'материалов'} · {records[0].source}</p><div className="mini-chips">{[...new Set(records.flatMap(r=>r.tags))].slice(0,3).map(t=><span key={t}>{t}</span>)}</div></div><ArrowUpRight size={18}/></button>)}</div>:<EmptyState title="Авторов пока нет" desc="Сохрани ссылку на публикацию и укажи автора." action={()=>openAdd()}/>
          :view==='insights'?
            visible.length?<div className="insights-list">{visible.map(b=><button className="insight-item" key={b.id} onClick={()=>setSelected(b)}><span className="insight-icon"><Sparkles size={18}/></span><div><h3>{b.title}</h3><p>{clipText(b.ai_summary||b.notes,240)}</p><div className="small-muted">{b.author||domain(b.url)} · {niceDate(b.created_at)}</div></div><ArrowUpRight size={17}/></button>)}</div>:<EmptyState title="Инсайты ещё впереди" desc="Открой карточку и попроси ИИ сделать выжимку из указанных тобой данных." action={()=>openAdd()}/>
          :view==='resources'?
            visible.length?<div className="resource-list">{visible.map(b=><button key={b.id} className="resource-row" onClick={()=>setSelected(b)}><span className={'resource-icon tone-'+b.color}><Globe2 size={21}/></span><span><strong>{b.title}</strong><small>{domain(b.url)}</small></span><span className="resource-tag">{b.source}</span><ArrowUpRight size={19}/></button>)}</div>:<EmptyState title="Ссылок пока нет" desc="Добавь первую ссылку, чтобы начать коллекцию." action={()=>openAdd()}/>
          :visible.length?<div className="bookmarks-grid">{visible.map(b=><BookmarkCard key={b.id} bookmark={b} open={setSelected}/>)}</div>
          :<EmptyState title={query?'Ничего не найдено':'Пока здесь пусто'} desc={query?'Попробуй другой запрос или выбери другую коллекцию.':'Любая идея начинается с первой ссылки.'} action={query?undefined:()=>openAdd()}/>}
          <div className="page-bottom"><span>TOHARO ATLAS · PRIVATE BY DESIGN</span><span>Collect your curiosity. ✳</span></div>
        </div>
      </main>
    </div>
    {selected&&!addOpen&&<div className="detail-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><aside className="detail-panel" aria-label="Карточка находки">
      <div className="detail-top"><div className="eyebrow">SAVED MATERIAL / {selected.source.toUpperCase()}</div><button className="icon-btn" aria-label="Закрыть" onClick={()=>setSelected(null)}><X size={20}/></button></div>
      <Cover bookmark={selected}/>
      <div className="detail-content">
        <div className="detail-headline"><div className="detail-date">{niceDate(selected.created_at)} · {selected.category}</div><h2>{selected.title}</h2><p>{selected.author||domain(selected.url)}</p></div>
        <a className="open-original" href={selected.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/> Открыть оригинал <ArrowUpRight size={16}/></a>
        <div className="detail-subheading"><span>AI SUMMARY</span><Sparkles size={17}/></div>
        {selected.ai_summary?<div className="summary-box"><p>{selected.ai_summary}</p><div className="ai-attribution"><Sparkles size={14}/> Создано моделью ИИ по доступным данным</div></div>:<div className="summary-placeholder"><WandSparkles size={24}/><p>Выполни анализ названия, ссылки и заметок. Содержимое ролика пока не извлекается.</p></div>}
        <button className="ai-action" disabled={analyzing} onClick={()=>void runAnalysis(selected)}>{analyzing?<LoaderCircle size={17} className="spin"/>:<Sparkles size={17}/>} {selected.ai_summary?'Повторить AI-анализ':'Проанализировать с ИИ'} <ArrowRight size={17}/></button>
        <div className="detail-subheading"><span>ЗАМЕТКИ</span><PenLine size={16}/></div>
        <p className="notes-copy">{selected.notes||selected.description||'Пока нет заметок. Добавь, зачем сохранял эту находку.'}</p>
        <div className="detail-subheading"><span>ТЕГИ</span><span className="small-muted">{selected.tags.length}</span></div>
        <div className="tag-list">{selected.tags.length?selected.tags.map(t=><span className="tag-chip" key={t}>{t}</span>):<span className="small-muted">Ещё не заданы</span>}</div>
        <div className="detail-controls"><button onClick={()=>openAdd(selected)}><PenLine size={16}/> Редактировать</button><button className="delete-action" onClick={()=>void handleDelete(selected)}><Trash2 size={16}/> Удалить</button></div>
      </div>
    </aside></div>}

    {addOpen&&<Dialog title={editTarget?'Редактировать находку':'Новая находка'} close={()=>setAddOpen(false)}>
      <form className="editor-form" onSubmit={e=>void handleSave(e)}>
        <label>Ссылка на публикацию, сайт или профиль <span>*</span><input autoFocus value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})} required placeholder="https://instagram.com/reel/..."/></label>
        <label>Название<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Что интересного ты нашёл?"/></label>
        <div className="two-inputs"><label>Автор / источник<input value={draft.author} onChange={e=>setDraft({...draft,author:e.target.value})} placeholder="@username"/></label>
          <label>Коллекция<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{[...new Set([CATEGORIES[0],...collections])].map(c=><option key={c}>{c}</option>)}</select></label></div>
        <label>Зачем сохранил? <span className="optional">(необязательно)</span><textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} rows={3} placeholder="Например: хочу повторить такой эффект в своём проекте..."/></label>
        <div className="editor-note"><ShieldCheck size={16}/> Сохраняется локально. Instagram не получает доступ к твоей библиотеке.</div>
        <div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setAddOpen(false)}>Отмена</button><button type="submit" className="primary-btn"><Check size={16}/>{editTarget?'Сохранить изменения':'Добавить в Atlas'}</button></div>
      </form>
    </Dialog>}

    {settingsOpen&&<Dialog wide title="Модели и настройки" close={()=>setSettingsOpen(false)}>
      <div className="settings-content">
        <div className="settings-sidebar"><div className="settings-active"><Cpu size={17}/> AI Model Manager</div><button onClick={exportData}><ArrowDownToLine size={17}/> Экспорт библиотеки</button><button onClick={()=>fileRef.current?.click()}><Database size={17}/> Импорт данных</button><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>void importData(e)}/><div className="settings-privacy"><ShieldCheck size={20}/><strong>Private by design</strong><p>Закладки хранятся локально. API-ключ не попадает в базу данных.</p></div></div>
        <div className="settings-main">
          <div className="model-overview"><div><div className="eyebrow">PROVIDER / 01</div><h3>OpenRouter <span className={'connection-state '+(keyReady?'connected':'')}>{keyReady?'Ключ подключён':'Нет ключа'}</span></h3><p>Подключай модели, проверяй доступность и выбирай только нужные.</p></div><span className="provider-logo">OR</span></div>
          {desktop?<form className="api-key-row" onSubmit={e=>void configureKey(e)}><LockKeyhole size={17}/><input type="password" value={keyInput} onChange={e=>setKeyInput(e.target.value)} placeholder={keyReady?'•••••••••••• Секрет сохранён в Windows':'Вставь API key OpenRouter'} autoComplete="off"/><button className="secondary-btn" disabled={!keyInput.trim()} type="submit">Сохранить</button>{keyReady&&<button title="Удалить ключ" type="button" className="icon-btn" onClick={()=>void removeKey()}><Trash2 size={17}/></button>}</form>:<div className="browser-notice"><Info size={17}/> Для безопасного хранения API-ключа открой установленное Windows-приложение.</div>}
          <div className="manager-header"><div><strong>Каталог моделей</strong><span>{models.length} в каталоге · {checkedModels.length} выбрано</span></div><button className="secondary-btn" disabled={modelBusy} onClick={()=>void refreshModels()}>{modelBusy?<LoaderCircle size={16} className="spin"/>:<RefreshCw size={16}/>} Обновить список</button></div>
          {modelError&&<div className="model-error"><CircleAlert size={17}/>{modelError}</div>}
          <div className="manager-filters"><label><Search size={16}/><input value={modelQuery} onChange={e=>setModelQuery(e.target.value)} placeholder="Найти модель по названию..."/></label><button className={'toggle-filter '+(freeOnly?'is-on':'')} onClick={()=>setFreeOnly(v=>!v)}><span className="toggle-track"/><span>Только бесплатные</span></button></div>
          <div className="models-list">
            <div className="model-table-heading"><span>МОДЕЛЬ</span><span>ЦЕНА / 1M ТОКЕНОВ</span><span>ПРОВЕРКА</span><span>АКТИВНАЯ</span></div>
            {modelRows.length?modelRows.slice(0,150).map(m=>{
              const checked=checkedModels.includes(m.id);const test=tests[m.id];const free=isFree(m);
              return <div className={'model-entry '+(checked?'model-checked':'')} key={m.id}>
                <label className="model-identity"><input type="checkbox" checked={checked} onChange={e=>void changeChecked(m.id,e.target.checked)}/><span className="custom-check"><Check size={12}/></span><span><strong>{m.name}</strong><small>{m.id} · {(m.context_length/1024).toFixed(0)}K</small></span>{free&&<span className="free-pill">FREE</span>}</label>
                <div className="model-cost">{free?'$0':costPerMillion(m.pricing?.prompt)+' / '+costPerMillion(m.pricing?.completion)}</div>
                <div className="model-latency">{test?(test.error?<span className="test-fail" title={test.error}><CircleAlert size={15}/> Ошибка</span>:<span className="test-pass"><CircleCheck size={15}/> {((test.elapsed_ms||0)/1000).toFixed(2)} c</span>):<span className="small-muted">Не проверена</span>}</div>
                <label className="active-radio" title="Использовать для анализа"><input type="radio" name="active-model" checked={activeModel===m.id&&checked} disabled={!checked} onChange={()=>void changeActive(m.id)}/><span/></label>
              </div>;
            }):<div className="models-empty">{modelBusy?'Загружаем актуальные модели...':desktop?'Ничего не найдено. Обнови каталог или сбрось фильтр.':'Модели доступны в Windows-версии приложения.'}</div>}
          </div>
          {modelRows.length>150&&<div className="small-muted row-footnote">Показаны первые 150 моделей. Уточни поиск, чтобы найти остальные.</div>}
          <div className="manager-bottom"><div><span className="small-muted">Активная модель:</span><strong>{activeModel||'Не выбрана'}</strong></div><button className="primary-btn" disabled={testing||!desktop||!keyReady||!checkedModels.length} onClick={()=>void testSelected()}>{testing?<LoaderCircle size={16} className="spin"/>:<Activity size={16}/>} {testing?'Проверяем...':'Пинг выбранных'}</button></div>
          <div className="cost-disclaimer"><Info size={15}/> «Пинг» — реальный запрос с расходом токенов. Каталог загружается без запуска моделей. Проверка автоматически не списывает средства при старте приложения.</div>
        </div>
      </div>
    </Dialog>}
    {toast&&<div role="status" className="toast"><CircleCheck size={18}/><span>{toast}</span><button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
