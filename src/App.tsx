import React, { useEffect, useMemo, useState } from 'react'
import { fmtYMD, startOfWeek } from './lib/utils'
import { cloudGet, cloudPost, hasCsrfCookie, cloudPostAgents } from './lib/api'
import type { PTO, Shift, Task } from './types'
import type { CalendarSegment } from './lib/utils'
import TopBar from './components/TopBar'
import SchedulePage from './pages/SchedulePage'
import ManagePage from './pages/ManagePage'
import ManageV2Page from './pages/ManageV2Page'
import { generateSample } from './sample'
// sha256Hex removed from App; keep local hashing only in components that need it
import { TZ_OPTS } from './constants'

const SAMPLE = generateSample()

export default function App(){
  // Site-wide gate when using dev proxy
  const useDevProxy = !!import.meta.env.VITE_DEV_PROXY_BASE && /^(localhost|127\.0\.0\.1|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)$/.test(location.hostname)
  const [siteUnlocked, setSiteUnlocked] = useState<boolean>(!useDevProxy)
  const [sitePw, setSitePw] = useState('')
  const [siteMsg, setSiteMsg] = useState('')
  useEffect(()=>{ (async()=>{
    if(useDevProxy){
      try{
        const base = (import.meta.env.VITE_DEV_PROXY_BASE || '').replace(/\/$/,'')
        const r = await fetch(`${base}/api/schedule`, { method: 'GET', credentials: 'include' })
        setSiteUnlocked(r.ok)
        if(r.ok){ try{ localStorage.setItem('site_unlocked_hint','1') }catch{} }
      }catch{ setSiteUnlocked(false) }
    } else {
      setSiteUnlocked(true)
    }
  })() }, [useDevProxy])
  useEffect(()=>{
    if(useDevProxy){
      try{
        const hint = localStorage.getItem('site_unlocked_hint')
        if(hint==='1' && !siteUnlocked){ setSiteUnlocked(true) }
      }catch{}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const hashToView = (hash:string): 'schedule'|'manage'|'manageV2' => {
    const h = (hash||'').toLowerCase()
    if(h.includes('manage2')) return 'manageV2'
    if(h.includes('manage')) return 'manage'
    return 'schedule'
  }
  const [view,setView] = useState<'schedule'|'manage'|'manageV2'>(()=> hashToView(window.location.hash))
  const [weekStart,setWeekStart] = useState(()=>fmtYMD(startOfWeek(new Date())))
  const [dayIndex,setDayIndex] = useState(() => new Date().getDay());
  const [theme,setTheme] = useState<"system"|"light"|"dark"|"night"|"noir"|"prism">(()=>{
    try{ return (localStorage.getItem('schedule_theme') as any) || 'system' }catch{ return 'system' }
  })
  const [dark,setDark] = useState(()=>{
    try{
      const raw = localStorage.getItem('schedule_theme')
      const pref = (raw==='unicorn' ? 'system' : raw) as 'light'|'dark'|'system'|'night'|'noir'|null
      if(pref==='light') return false
      if(pref==='dark' || pref==='night' || pref==='noir') return true
      // system default
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    }catch{ return true }
  })
  useEffect(()=>{
    const handler = (e: Event)=>{
      const any = e as CustomEvent
  const v = any?.detail?.value as 'light'|'dark'|'system'|'night'|'noir'|'prism' | undefined
      if(!v) return
      setTheme(v)
      if(v==='light') setDark(false)
  else if(v==='dark' || v==='night' || v==='noir' || v==='prism') setDark(true)
      else if(v==='system') setDark(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      try{ localStorage.setItem('schedule_theme', v) }catch{}
    }
    window.addEventListener('schedule:set-theme', handler as any)
    return ()=> window.removeEventListener('schedule:set-theme', handler as any)
  },[])
  // React to OS theme changes when preference is 'system'
  useEffect(()=>{
    if(!window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = ()=>{
      try{ if(localStorage.getItem('schedule_theme')==='system'){ setDark(mq.matches) } }catch{}
    }
    // addEventListener is modern; fallback for older
    if((mq as any).addEventListener) (mq as any).addEventListener('change', onChange)
    else if((mq as any).addListener) (mq as any).addListener(onChange)
    return ()=>{
      if((mq as any).removeEventListener) (mq as any).removeEventListener('change', onChange)
      else if((mq as any).removeListener) (mq as any).removeListener(onChange)
    }
  },[])
  // Effective theme: restrict management views to light/dark only
  const effectiveTheme = useMemo(()=> {
    let t = (view==='schedule' ? theme : (dark ? 'dark' : 'light')) as 'system'|'light'|'dark'|'night'|'noir'|'prism'|string
    if(t==='unicorn') t = 'system'
    return t as 'system'|'light'|'dark'|'night'|'noir'|'prism'
  }, [view, theme, dark])
  // Compute root classes based on effective theme
  const rootCls = useMemo(()=>{
    const base = 'min-h-screen w-full'
    if(effectiveTheme==='night') return `${base} bg-black text-red-400`
  if(effectiveTheme==='noir') return `${base} bg-black text-white`
  if(effectiveTheme==='prism') return `${base} bg-black text-neutral-100`
    return dark? `${base} bg-neutral-950 text-neutral-100` : `${base} bg-neutral-100 text-neutral-900`
  }, [effectiveTheme, dark])
  const [shifts, setShifts] = useState<Shift[]>(SAMPLE.shifts)
  const [pto, setPto] = useState<PTO[]>(SAMPLE.pto)
  const [tz, setTz] = useState(TZ_OPTS[0])
  const [slimline, setSlimline] = useState<boolean>(()=>{
    try{ const v = localStorage.getItem('schedule_slimline'); if(v===null) return false; return v==='1' }
    catch{ return false }
  })
  useEffect(()=>{ try{ localStorage.setItem('schedule_slimline', slimline ? '1' : '0') }catch{} }, [slimline])
  // Listen for SchedulePage's local pane toggle (scoped to schedule view)
  useEffect(()=>{
    const handler = (e: Event)=>{
      const anyE = e as CustomEvent
      if(anyE && typeof anyE.detail?.value === 'boolean') setSlimline(anyE.detail.value)
    }
    window.addEventListener('schedule:set-slimline', handler as any)
    return ()=> window.removeEventListener('schedule:set-slimline', handler as any)
  },[])
  // v2: dedicated agents list (temporary local persistence)
  type AgentRow = { id?: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean }
  const [agentsV2, setAgentsV2] = useState<AgentRow[]>(()=>{
    try{
      const raw = localStorage.getItem('schedule_agents_v2_v1')
      if(raw){
        const parsed = JSON.parse(raw)
        if(Array.isArray(parsed)) return parsed as AgentRow[]
      }
    }catch{}
    // No saved list yet; start empty and bootstrap after cloud loads
    return []
  })
  const [tasks, setTasks] = useState<Task[]>(()=>{
    try{
      const raw = localStorage.getItem('schedule_tasks')
      if(raw){
        const parsed = JSON.parse(raw)
        if(Array.isArray(parsed)) return parsed as Task[]
      }
    }catch{}
    return []
  })
  const [calendarSegs, setCalendarSegs] = useState<CalendarSegment[]>(()=>{
    try{
      const raw = localStorage.getItem('schedule_calendarSegs')
      if(raw){
        const parsed = JSON.parse(raw)
        if(Array.isArray(parsed)) return parsed as CalendarSegment[]
      }
    }catch{}
    return []
  })
  const [loadedFromCloud,setLoadedFromCloud]=useState(false)

  const [canEdit, setCanEdit] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Draft scheduling state (separate from live). Persisted locally until published/discarded
  type DraftMeta = { id: string; createdBy?: string; createdAt: string; updatedAt: string; publishedAt?: string }
  type DraftData = { shifts: Shift[]; pto: PTO[]; calendarSegs: CalendarSegment[] }
  type Draft = { meta: DraftMeta; data: DraftData }
  const [draft, setDraft] = useState<Draft | null>(()=>{
    try{
      const raw = localStorage.getItem('schedule_draft_v1')
      if(raw){
        const parsed = JSON.parse(raw)
        if(parsed && parsed.meta && parsed.data) return parsed as Draft
      }
    }catch{}
    return null
  })
  const draftActive = !!draft
  const saveDraftLocal = (d: Draft|null)=>{
    try{
      if(d) localStorage.setItem('schedule_draft_v1', JSON.stringify(d))
      else localStorage.removeItem('schedule_draft_v1')
    }catch{}
  }
  const startDraftFromLive = (createdBy?: string)=>{
    const now = new Date().toISOString()
    const d: Draft = {
      meta: { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), createdBy, createdAt: now, updatedAt: now },
      data: { shifts: JSON.parse(JSON.stringify(shifts)), pto: JSON.parse(JSON.stringify(pto)), calendarSegs: JSON.parse(JSON.stringify(calendarSegs)) }
    }
    setDraft(d); saveDraftLocal(d)
  }
  const startDraftEmpty = (createdBy?: string)=>{
    const now = new Date().toISOString()
    const d: Draft = { meta: { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), createdBy, createdAt: now, updatedAt: now }, data: { shifts: [], pto: [], calendarSegs: [] } }
    setDraft(d); saveDraftLocal(d)
  }
  const discardDraft = ()=>{ setDraft(null); saveDraftLocal(null) }
  const publishDraft = async ()=>{
    if(!draft) return false
    const now = new Date().toISOString()
    const shiftsWithIds = draft.data.shifts.map(s=> s.agentId ? s : ({ ...s, agentId: agentIdByFullName(s.person) }))
    const ptoWithIds = draft.data.pto.map(p=> (p as any).agentId ? p : ({ ...p, agentId: agentIdByFullName(p.person) }))
  const agentsPayload = agentsV2.map(a=> ({ id: a.id || (crypto.randomUUID?.() || Math.random().toString(36).slice(2)), firstName: a.firstName||'', lastName: a.lastName||'', tzId: a.tzId, hidden: !!a.hidden }))
  const ok = await cloudPost({ shifts: shiftsWithIds, pto: ptoWithIds, calendarSegs: draft.data.calendarSegs, agents: agentsPayload, updatedAt: now })
    if(ok){
      setShifts(shiftsWithIds)
      setPto(ptoWithIds)
      setCalendarSegs(draft.data.calendarSegs)
      const published: Draft = { ...draft, meta: { ...draft.meta, updatedAt: now, publishedAt: now } }
      try{ localStorage.setItem('schedule_last_published', JSON.stringify(published.meta)) }catch{}
      setDraft(null); saveDraftLocal(null)
    }
    return ok
  }

  // Wrapped setters to edit draft when active, otherwise live
  const setShiftsRouted = (updater:(prev:Shift[])=>Shift[])=>{
    if(draftActive){
      setDraft(prev=>{
        if(!prev) return prev
        const nextShifts = updater(prev.data.shifts)
        const next: Draft = { meta: { ...prev.meta, updatedAt: new Date().toISOString() }, data: { ...prev.data, shifts: nextShifts } }
        saveDraftLocal(next); return next
      })
    }else{
      setShifts(updater)
    }
  }
  const setPtoRouted = (updater:(prev:PTO[])=>PTO[])=>{
    if(draftActive){
      setDraft(prev=>{
        if(!prev) return prev
        const nextPto = updater(prev.data.pto)
        const next: Draft = { meta: { ...prev.meta, updatedAt: new Date().toISOString() }, data: { ...prev.data, pto: nextPto } }
        saveDraftLocal(next); return next
      })
    }else{
      setPto(updater)
    }
  }
  const setCalendarSegsRouted = (updater:(prev:CalendarSegment[])=>CalendarSegment[])=>{
    if(draftActive){
      setDraft(prev=>{
        if(!prev) return prev
        const nextCal = updater(prev.data.calendarSegs)
        const next: Draft = { meta: { ...prev.meta, updatedAt: new Date().toISOString() }, data: { ...prev.data, calendarSegs: nextCal } }
        saveDraftLocal(next); return next
      })
    }else{
      setCalendarSegs(updater)
    }
  }

  useEffect(()=>{ (async()=>{
    // Editing is allowed only when an authenticated session exists (cookie+CSRF).
  setCanEdit(hasCsrfCookie())
  })() }, [view])

  useEffect(()=>{ (async()=>{
    if(useDevProxy && !siteUnlocked) return
    const data=await cloudGet();
    if(data){
      setShifts(data.shifts);
      setPto(data.pto);
      if(Array.isArray(data.calendarSegs)) setCalendarSegs(data.calendarSegs as any)
      // Prefer cloud-backed agents if present
      if(Array.isArray((data as any).agents)){
        const arr = (data as any).agents as any[]
        setAgentsV2(arr as any)
        try{ localStorage.setItem('schedule_agents_v2_v1', JSON.stringify(arr)) }catch{}
      }
    }
    setLoadedFromCloud(true)
  })() },[useDevProxy, siteUnlocked])
  // Keep view in sync with URL hash and vice versa
  useEffect(()=>{
    const handler = ()=> setView(hashToView(window.location.hash))
    window.addEventListener('hashchange', handler)
    return ()=> window.removeEventListener('hashchange', handler)
  },[])
  useEffect(()=>{
    if(view==='manageV2' || view==='manage'){
      const desired = view==='manageV2' ? '#manage2' : '#manage'
      if(window.location.hash !== desired){ window.location.hash = desired }
    } else {
      // schedule: remove hash for clean URL
      if(window.location.hash){
        try{ history.replaceState(null, '', window.location.pathname + window.location.search) }catch{}
      }
    }
  },[view])
  // Seed default postures if none exist on first mount
  useEffect(()=>{
    if(tasks.length===0){
      setTasks([
        { id: 'support', name: 'Support Inbox', color: '#2563eb' },
        { id: 'meetings', name: 'Meetings', color: '#16a34a' },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // Persist postures locally
  useEffect(()=>{
    try{ localStorage.setItem('schedule_tasks', JSON.stringify(tasks)) }catch{}
  },[tasks])
  // Persist posture assignments (calendar segments) locally
  useEffect(()=>{
    try{ localStorage.setItem('schedule_calendarSegs', JSON.stringify(calendarSegs)) }catch{}
  },[calendarSegs])
  // Persist v2 agents locally
  useEffect(()=>{
    try{ localStorage.setItem('schedule_agents_v2_v1', JSON.stringify(agentsV2)) }catch{}
  },[agentsV2])
  // Ensure each agent has a stable id; add if missing
  useEffect(()=>{
    if(agentsV2.length===0) return
    if(agentsV2.every(a=> !!a.id)) return
    setAgentsV2(prev=> prev.map(a=> a.id ? a : { ...a, id: crypto.randomUUID?.() || Math.random().toString(36).slice(2) }))
  }, [agentsV2])
  const fullNameOf = (a: AgentRow)=> `${a.firstName||''} ${a.lastName||''}`.trim()
  const nameKey = (s:string)=> (s||'').trim().toLowerCase()
  const agentIdByFullName = (name: string)=>{
    const n = (name||'').trim().toLowerCase()
    if(!n) return undefined
    const row = agentsV2.find(a=> fullNameOf(a).toLowerCase()===n)
    return row?.id
  }
  // Auto-save local edits to the cloud only when editing is allowed and NOT in draft mode
  useEffect(()=>{ 
    if(!loadedFromCloud || !canEdit || draftActive) return; 
    const t=setTimeout(()=>{ 
      const shiftsWithIds = shifts.map(s=> s.agentId ? s : ({ ...s, agentId: agentIdByFullName(s.person) }))
      const ptoWithIds = pto.map(p=> (p as any).agentId ? p : ({ ...p, agentId: agentIdByFullName(p.person) }))
      const agentsPayload = agentsV2.map(a=> ({ id: a.id || (crypto.randomUUID?.() || Math.random().toString(36).slice(2)), firstName: a.firstName||'', lastName: a.lastName||'', tzId: a.tzId, hidden: !!a.hidden }))
      cloudPost({shifts: shiftsWithIds, pto: ptoWithIds, calendarSegs, agents: agentsPayload, updatedAt:new Date().toISOString()}) 
    },600); 
    return ()=>clearTimeout(t) 
  },[shifts,pto,calendarSegs,loadedFromCloud,canEdit,draftActive])

  // Persist agent metadata (including hidden flags) even when a draft is active.
  // This lets the Hide/Show Agent toggle reflect across devices immediately without waiting for a draft publish.
  useEffect(()=>{
    if(!loadedFromCloud || !canEdit) return
    const t = setTimeout(()=>{
      // Prefer agents-only endpoint to avoid schedule conflicts
      cloudPostAgents(
        agentsV2.map(a=> ({ id: a.id || (crypto.randomUUID?.() || Math.random().toString(36).slice(2)), firstName: a.firstName||'', lastName: a.lastName||'', tzId: a.tzId, hidden: !!a.hidden }))
      )
    }, 600)
    return ()=> clearTimeout(t)
  }, [agentsV2, loadedFromCloud, canEdit])

  // Auto-refresh schedule view every 5 minutes from the cloud (read-only)
  // Use refs to avoid creating a render loop when setting state inside this effect.
  const lastJsonRef = React.useRef<{ shifts: string; pto: string; cal: string; agents: string }>({ shifts: '', pto: '', cal: '', agents: '' })
  useEffect(()=>{
    if(view!== 'schedule') return
    if(useDevProxy && !siteUnlocked) return
    let stopped = false
    const pull = async ()=>{
      const data = await cloudGet()
      if(!data || stopped) return
      const s = JSON.stringify(data.shifts||[])
      const p = JSON.stringify(data.pto||[])
      const c = JSON.stringify(Array.isArray(data.calendarSegs)? data.calendarSegs : [])
      const a = JSON.stringify(Array.isArray((data as any).agents)? (data as any).agents : [])
      if(s !== lastJsonRef.current.shifts){ setShifts(data.shifts); lastJsonRef.current.shifts = s }
      if(p !== lastJsonRef.current.pto){ setPto(data.pto); lastJsonRef.current.pto = p }
      if(c !== lastJsonRef.current.cal){ setCalendarSegs((data.calendarSegs as any) || []); lastJsonRef.current.cal = c }
      if(a !== lastJsonRef.current.agents && Array.isArray((data as any).agents)){
        setAgentsV2((data as any).agents as any)
        lastJsonRef.current.agents = a
        try{ localStorage.setItem('schedule_agents_v2_v1', a) }catch{}
      }
    }
    pull()
    const id = setInterval(pull, 5 * 60 * 1000)
    // If using dev proxy, also subscribe to SSE for instant updates
    let es: EventSource | null = null
  const base = (import.meta.env.VITE_DEV_PROXY_BASE || '').replace(/\/$/,'')
  if(useDevProxy && base){
      try{
        es = new EventSource(`${base}/api/events`, { withCredentials: true } as any)
        es.addEventListener('updated', ()=> pull())
      }catch{}
    }
    return ()=>{ stopped = true; clearInterval(id); try{ es?.close() }catch{} }
  }, [view, useDevProxy, siteUnlocked])

  // Derived: list of unique agent names
  const agents = useMemo(()=> Array.from(new Set(shifts.map(s=>s.person))).sort(), [shifts])

  // Bootstrap v2 agents from real shifts once cloud data is loaded, only if not already saved
  useEffect(()=>{
    if(!loadedFromCloud) return
    const namesFrom = (arr: { firstName:string; lastName:string }[])=> arr.map(a=>`${a.firstName} ${a.lastName}`.trim()).sort()
    const uniqNames = (people:string[])=> Array.from(new Set(people)).sort()

    const currentAgentNames = namesFrom(agentsV2)
    const sampleNames = uniqNames(SAMPLE.shifts.map(s=>s.person))
    const cloudNames = uniqNames(shifts.map(s=>s.person))

    const isEmpty = agentsV2.length===0
    const equals = (a:string[], b:string[])=> a.length===b.length && a.every((v,i)=>v===b[i])
    const looksLikeSample = equals(currentAgentNames, sampleNames)

  if(isEmpty || looksLikeSample){
      const derived = cloudNames.map(n=>{
        const parts = n.split(' ')
    return { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), firstName: parts[0]||n, lastName: parts.slice(1).join(' ')||'', tzId: TZ_OPTS[0]?.id, hidden: false }
      })
      setAgentsV2(derived)
    }
  }, [loadedFromCloud, shifts, agentsV2])

  if(!siteUnlocked){
    const dark = true
    return (
      <div className={dark?"min-h-screen w-full bg-neutral-950 text-neutral-100":"min-h-screen w-full bg-neutral-100 text-neutral-900"}>
        <div className="max-w-md mx-auto p-6">
          <section className={["rounded-2xl p-6 space-y-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
            <div className="text-lg font-semibold">Protected — Enter Site Password</div>
            <p className="text-sm opacity-80">Sign in to view the schedule.</p>
            <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
              const { devSiteLogin } = await import('./lib/api')
              const { ok, status } = await devSiteLogin(sitePw)
              if(ok){ setSiteUnlocked(true); setSiteMsg(''); try{ localStorage.setItem('site_unlocked_hint','1') }catch{} }
              else if(status===401){ setSiteMsg('Incorrect password') }
              else if(status===403){ setSiteMsg('Origin blocked by dev proxy. Check DEV_ALLOWED_ORIGIN(S).') }
              else if(status===404){ setSiteMsg('Endpoint missing on dev proxy. Restart it to pick up routes.') }
              else { setSiteMsg('Network/CORS error. Is dev proxy running?') }
            })() }}>
              <div className="flex gap-2">
                <input type="password" autoFocus className="flex-1 border rounded-xl px-3 py-2 bg-neutral-900 border-neutral-700" value={sitePw} onChange={(e)=>setSitePw(e.target.value)} placeholder="Password" />
                <button type="submit" className="rounded-xl px-4 py-2 font-medium border bg-neutral-800 border-neutral-700">Sign in</button>
              </div>
            </form>
            {siteMsg && (<div className="text-sm text-red-300">{siteMsg}</div>)}
          </section>
        </div>
      </div>
    )
  }

  return (
    <ErrorCatcher dark={dark}>
  <div className={rootCls} data-theme={effectiveTheme}>
        <div className="max-w-full mx-auto p-2 md:p-4 space-y-4">
          <TopBar
          dark={dark} setDark={setDark}
          view={view} setView={setView}
          weekStart={weekStart} setWeekStart={setWeekStart}
          tz={tz} setTz={setTz}
          canEdit={canEdit}
          editMode={editMode}
          setEditMode={setEditMode}
          />

          {view==='schedule' ? (
            <SchedulePage
              dark={dark}
              weekStart={weekStart}
              dayIndex={dayIndex}
              setDayIndex={setDayIndex}
              shifts={shifts}
              pto={pto}
              tasks={tasks}
              calendarSegs={calendarSegs}
              tz={tz}
              canEdit={canEdit}
              editMode={editMode}
              onRemoveShift={(id)=> setShifts(prev=>prev.filter(s=>s.id!==id))}
              agents={agentsV2}
              slimline={slimline}
            />
          ) : view==='manage' ? (
            <ManagePage
              dark={dark}
              weekStart={weekStart}
              // In Manage, route edits to draft if active
              shifts={draftActive ? (draft!.data.shifts) : shifts}
              setShifts={setShiftsRouted}
              pto={draftActive ? (draft!.data.pto) : pto}
              setPto={setPtoRouted}
              tasks={tasks}
              setTasks={setTasks}
              calendarSegs={draftActive ? (draft!.data.calendarSegs) : calendarSegs}
              setCalendarSegs={setCalendarSegsRouted}
              tz={tz}
              agents={agentsV2}
              // Draft controls
              isDraft={draftActive}
              draftMeta={draft?.meta || null}
              onStartDraftFromLive={startDraftFromLive}
              onStartDraftEmpty={startDraftEmpty}
              onDiscardDraft={discardDraft}
              onPublishDraft={publishDraft}
            />
          ) : (
            <ManageV2Page
              dark={dark}
              agents={agentsV2}
              onAddAgent={(a:{ firstName:string; lastName:string; tzId:string })=>{
                const newFull = `${(a.firstName||'').trim()} ${(a.lastName||'').trim()}`.trim()
                if(!newFull){ alert('Enter a first and/or last name'); return }
                const dup = agentsV2.some(row=> nameKey(fullNameOf(row))===nameKey(newFull))
                if(dup){ alert('An agent with that name already exists.'); return }
                setAgentsV2(prev=> prev.concat([{ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), firstName: a.firstName, lastName: a.lastName, tzId: a.tzId, hidden: false }]))
              }}
              onUpdateAgent={(index:number, a:{ firstName:string; lastName:string; tzId?:string; hidden?: boolean })=>{
                // Compute names and check duplicates (excluding self)
                const cur = agentsV2[index]
                if(!cur){ return }
                const oldFull = fullNameOf(cur)
                const nextFirst = (a.firstName||'').trim()
                const nextLast = (a.lastName||'').trim()
                const newFull = `${nextFirst} ${nextLast}`.trim()
                if(!newFull){ alert('Enter a first and/or last name'); return }
                const dup = agentsV2.some((row,i)=> i!==index && nameKey(fullNameOf(row))===nameKey(newFull))
                if(dup){ alert('An agent with that name already exists.'); return }

                // Propagate rename across current dataset (draft-aware via routed setters)
                if(nameKey(newFull) !== nameKey(oldFull)){
                  const id = cur.id
                  const ensureId = (xId?:string)=> xId || id
                  setShiftsRouted(prev=> prev.map(s=> s.person===oldFull ? { ...s, person: newFull, agentId: ensureId(s.agentId) } : s))
                  setPtoRouted(prev=> prev.map(p=> p.person===oldFull ? { ...p, person: newFull, agentId: ensureId((p as any).agentId) } : p))
                  setCalendarSegsRouted(prev=> prev.map(cs=> cs.person===oldFull ? { ...cs, person: newFull, agentId: ensureId((cs as any).agentId) } : cs))
                }

                // Finally update the agents list
                setAgentsV2(prev=> prev.map((r,i)=> i===index ? { ...r, firstName: nextFirst, lastName: nextLast, tzId: a.tzId || r.tzId, hidden: a.hidden!=null ? a.hidden : r.hidden } : r))
              }}
              onDeleteAgent={(index:number)=> setAgentsV2(prev=> prev.filter((_,i)=> i!==index))}
              weekStart={weekStart}
              tz={tz}
              shifts={draftActive ? (draft!.data.shifts) : shifts}
              pto={draftActive ? (draft!.data.pto) : pto}
              tasks={tasks}
              calendarSegs={draftActive ? (draft!.data.calendarSegs) : calendarSegs}
              onUpdateShift={(id, patch)=> setShiftsRouted(prev=> prev.map(s=> s.id===id ? { ...s, ...patch } : s))}
              onDeleteShift={(id)=> setShiftsRouted(prev=> prev.filter(s=> s.id!==id))}
              onAddShift={(s)=> setShiftsRouted(prev=> prev.concat([{ ...s, agentId: s.agentId || agentIdByFullName(s.person) }]))}
              setTasks={setTasks}
              setCalendarSegs={setCalendarSegsRouted}
              setPto={setPtoRouted}
            />
          )}
        </div>
      </div>
    </ErrorCatcher>
  )
}

class ErrorCatcher extends React.Component<{ dark:boolean; children: React.ReactNode }, { hasError:boolean; err?:any }>{
  state = { hasError: false, err: undefined as any }
  static getDerivedStateFromError(err:any){ return { hasError: true, err } }
  componentDidCatch(error:any, info:any){ console.error('App error', error, info) }
  componentDidMount(){
    window.addEventListener('error', (e)=>{ console.error('Window error', e.error || e.message) })
    window.addEventListener('unhandledrejection', (e)=>{ console.error('Unhandled rejection', e.reason) })
  }
  render(){
    if(this.state.hasError){
      const { dark } = this.props
      return (
        <div className={dark?"min-h-screen w-full bg-neutral-950 text-neutral-100":"min-h-screen w-full bg-neutral-100 text-neutral-900"}>
          <div className="max-w-3xl mx-auto p-4">
            <div className={["rounded-xl p-4 border", dark?"bg-red-900/30 border-red-800 text-red-200":"bg-red-50 border-red-200 text-red-900"].join(' ')}>
              <div className="font-semibold mb-2">A runtime error occurred</div>
              <div className="text-xs whitespace-pre-wrap break-all">{String(this.state.err?.message || this.state.err || 'Unknown error')}</div>
              <div className="text-xs opacity-80 mt-2">Check the developer console for details.</div>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children as any
  }
}
