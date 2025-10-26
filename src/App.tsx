import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { fmtYMD, startOfWeek, formatMinutes, TimeFormat, nowInTZ, parseYMD, addDays } from './lib/utils'
import { cloudGet, cloudPost, cloudPostAgents, hasAdminSession, cloudPostShiftsBatch, getApiBase, getApiPrefix, requestMagicLink, loginSite, ensureSiteSession, logout, logoutSite } from './lib/api'
import { pushAgentsToCloud, mapAgentsToPayloads } from './lib/agents'
import { publishDraftBundle } from './lib/drafts'
import type { PTO, Shift, Task, Override, MeetingCohort } from './types'
import type { CalendarSegment } from './lib/utils'
import TopBar from './components/TopBar'
import ShortcutsOverlay from './components/ShortcutsOverlay'
import SchedulePage from './pages/SchedulePage'
import StagingPreviewPage from './pages/StagingPreviewPage'
// Legacy ManagePage phased out; use ManageV2Page only
import ManageV2Page from './pages/ManageV2Page'
import TeamsPage from './pages/TeamsPage'
import ImmersiveSchedulePage from './pages/ImmersiveSchedulePage'
import { generateSample } from './sample'
// sha256Hex removed from App; keep local hashing only in components that need it
import { TZ_OPTS, MEETING_COHORTS, DAYS } from './constants'
import { TimeFormatProvider } from './context/TimeFormatContext'

type View = 'schedule' | 'teams' | 'manageV2' | 'stagingPreview' | 'immersive'

const SAMPLE = generateSample()
const USE_SAMPLE = (import.meta.env.VITE_USE_SAMPLE || 'no').toLowerCase() === 'yes'
const ALLOW_DOC_FALLBACK = (import.meta.env.VITE_ALLOW_DOC_FALLBACK || 'no').toLowerCase() === 'yes'

export default function App(){
  const autoUnlock = Boolean(import.meta.env?.DEV && import.meta.env.VITE_REQUIRE_SITE_PASSWORD !== '1')
  const devSitePassword = autoUnlock ? (import.meta.env.VITE_DEV_SITE_PASSWORD || import.meta.env.VITE_SITE_PASSWORD || '').trim() : ''
  // Site-wide gate: if /api/schedule requires a site session, prompt for password.
  // Default to locked until probe confirms access (auto-unlock in dev still waits for ensureSiteSession).
  const [siteUnlocked, setSiteUnlocked] = useState<boolean>(false)
  const [autoUnlocking, setAutoUnlocking] = useState<boolean>(autoUnlock)
  const [sitePw, setSitePw] = useState('')
  const [siteMsg, setSiteMsg] = useState('')
  const buildStamp = useMemo(()=>{
    const env = (import.meta.env || {}) as Record<string, unknown>
    const parts = [env.VITE_BUILD_ID, env.VITE_BUILD_SHA, env.VITE_BUILD_TIME]
      .map(value=> typeof value === 'string' ? value.trim() : '')
      .filter(Boolean)
    if(parts.length>0) return parts.join(' · ')
    const mode = typeof env.MODE === 'string' ? env.MODE : 'dev'
    return `${mode}-${new Date().toISOString()}`
  }, [])
  useEffect(()=>{
    if(typeof window !== 'undefined'){
      (window as any).__SCHEDULE_BUILD__ = buildStamp
    }
  }, [buildStamp])
  useEffect(()=>{
    if(autoUnlock){
      (async()=>{
        setAutoUnlocking(true)
        try{
          const ok = await ensureSiteSession(devSitePassword || undefined)
          setSiteUnlocked(ok)
        }catch{
          setSiteUnlocked(false)
        }finally{
          setAutoUnlocking(false)
        }
      })()
      return
    }
    (async()=>{
      try{
        const base = getApiBase()
        const prefix = getApiPrefix()
        const url = `${base}${prefix}/schedule`
        const r = await fetch(url, { method: 'GET', credentials: 'include' })
        setSiteUnlocked(r.ok)
      }catch{ setSiteUnlocked(false) }
    })()
  }, [autoUnlock, devSitePassword])
  const previewEnabled = useMemo(()=>{
    if(typeof window === 'undefined') return false
    const host = window.location.hostname.toLowerCase()
    const envOverride = (import.meta.env.VITE_ENABLE_FLOW_PREVIEW || '').toLowerCase()
    if(envOverride === 'yes' || envOverride === 'true' || envOverride === '1') return true
    return host.includes('staging')
  }, [])

  const hashToView = useCallback((hash:string): View => {
    const h = (hash||'').toLowerCase()
    if(previewEnabled && (h.includes('flow') || h.includes('preview') || h.includes('staging-preview'))) return 'stagingPreview'
    if(previewEnabled && h.includes('immersive')) return 'immersive'
    if(h.includes('teams')) return 'teams'
    if(h.includes('manage2')) return 'manageV2'
    if(h.includes('manage')) return 'manageV2'
    return 'schedule'
  }, [previewEnabled])
  const [view,setView] = useState<View>(()=> hashToView(window.location.hash))
  const setTopBarView = useCallback((next: View)=> setView(next), [setView])
  const [weekStart,setWeekStart] = useState(()=>fmtYMD(startOfWeek(new Date())))
  const [dayIndex,setDayIndex] = useState(() => new Date().getDay());
  type ThemeBase = 'system'|'default'|'night'|'noir'|'prism'
  type ThemeVariantPref = 'auto'|'light'|'dark'
  const systemPrefersDark = ()=>{
    if(typeof window === 'undefined') return true
    if(!window.matchMedia) return true
    try{ return window.matchMedia('(prefers-color-scheme: dark)').matches }
    catch{ return true }
  }
  const decodeTheme = (raw: string | null): { base: ThemeBase; variant: ThemeVariantPref } => {
    const value = (raw || 'system').toLowerCase()
    if(value==='unicorn') return { base: 'system', variant: 'auto' }
    if(value==='system') return { base: 'system', variant: 'auto' }
    if(value==='light' || value==='default-light') return { base: 'default', variant: 'light' }
    if(value==='dark' || value==='default-dark') return { base: 'default', variant: 'dark' }
    if(value.startsWith('default-')) return { base: 'default', variant: value.endsWith('light') ? 'light' : 'dark' }
    if(value==='night' || value.startsWith('night-')) return { base: 'night', variant: 'light' }
    if(value==='prism' || value.startsWith('prism-')) return { base: 'prism', variant: 'dark' }
    if(value==='noir') return { base: 'noir', variant: 'dark' }
    if(value.startsWith('noir-')) return { base: 'noir', variant: value.endsWith('light') ? 'light' : 'dark' }
    return { base: 'default', variant: 'dark' }
  }
  const [theme,setTheme] = useState<ThemeBase>(()=>{
    try{ return decodeTheme(localStorage.getItem('schedule_theme')).base }
    catch{ return 'system' }
  })
  const [dark,setDark] = useState<boolean>(()=>{
    try{
      const decoded = decodeTheme(localStorage.getItem('schedule_theme'))
      if(decoded.base==='system') return systemPrefersDark()
      if(decoded.base==='night') return false
      if(decoded.base==='prism') return true
      return decoded.variant==='dark'
    }catch{ return true }
  })
  useEffect(()=>{
    try{
      const raw = localStorage.getItem('schedule_theme')
      if(!raw) return
      if(raw.startsWith('night-')) localStorage.setItem('schedule_theme', 'night')
      else if(raw.startsWith('prism-')) localStorage.setItem('schedule_theme', 'prism')
      else if(raw==='noir') localStorage.setItem('schedule_theme', 'noir-dark')
    }catch{}
  },[])
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(()=>{
    if(typeof window !== 'undefined'){
      try{
        const stored = localStorage.getItem('schedule_time_format')
        if(stored === '12h' || stored === '24h') return stored as TimeFormat
      }catch{}
    }
    return '24h'
  })
  useEffect(()=>{
    try{ localStorage.setItem('schedule_time_format', timeFormat) }catch{}
  }, [timeFormat])
  const formatTimeFn = useCallback((minutes: number)=> formatMinutes(minutes, timeFormat), [timeFormat])
  const timeFormatValue = useMemo(()=> ({ timeFormat, setTimeFormat, formatTime: formatTimeFn }), [timeFormat, formatTimeFn])

  // Keyboard shortcuts overlay visibility
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false)

  // Global keyboard shortcuts (overlay, view switching, week navigation)
  useEffect(()=>{
    const isFormField = (el: EventTarget | null)=>{
      const t = el as HTMLElement | null
      if(!t) return false
      const tag = (t.tagName||'').toLowerCase()
      const edit = (t as any).isContentEditable
      return edit || tag==='input' || tag==='textarea' || tag==='select'
    }
    const onKey = (e: KeyboardEvent)=>{
      // If overlay is showing, only allow Escape to close
      if(showShortcuts){
        if(e.key==='Escape'){ e.preventDefault(); setShowShortcuts(false) }
        return
      }
      if(isFormField(e.target)) return
      // Show overlay: '?' or Cmd/Ctrl+K
      if(e.key==='?'){ e.preventDefault(); setShowShortcuts(true); return }
      if((e.ctrlKey||e.metaKey) && (e.key==='k' || e.key==='K')){ e.preventDefault(); setShowShortcuts(true); return }
      // Switch view: Alt+1/2/3/4
      if(e.altKey && !e.metaKey && !e.ctrlKey){
        if(e.key==='1'){ e.preventDefault(); setView('schedule'); return }
        if(e.key==='2'){ e.preventDefault(); setView('teams'); return }
        if(e.key==='3'){ e.preventDefault(); setView('manageV2'); return }
        if(previewEnabled && e.key==='4'){ e.preventDefault(); setView('stagingPreview'); return }
      }
      // Week navigation: Cmd/Ctrl + ArrowLeft/Right
      if((e.ctrlKey||e.metaKey) && (e.key==='ArrowLeft' || e.key==='ArrowRight')){
        e.preventDefault()
        const delta = (e.key==='ArrowLeft') ? -7 : 7
        try{
          const cur = parseYMD(weekStart)
          const next = addDays(cur, delta)
          setWeekStart(fmtYMD(next))
        }catch{}
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [showShortcuts, weekStart, previewEnabled])

  useEffect(()=>{
    const handler = (e: Event)=>{
      const any = e as CustomEvent
      const raw = any?.detail?.value as string | undefined
      if(!raw) return
      const next = raw.toLowerCase()
      if(next==='system'){
        setTheme('system')
        setDark(systemPrefersDark())
        try{ localStorage.setItem('schedule_theme', 'system') }catch{}
        return
      }
      if(next==='night' || next.startsWith('night-')){
        setTheme('night')
        setDark(false)
        try{ localStorage.setItem('schedule_theme', 'night') }catch{}
        return
      }
      if(next==='prism' || next.startsWith('prism-')){
        setTheme('prism')
        setDark(true)
        try{ localStorage.setItem('schedule_theme', 'prism') }catch{}
        return
      }
      if(next==='noir' || next.startsWith('noir-')){
        const variant = next.endsWith('light') ? 'light' : 'dark'
        setTheme('noir')
        setDark(variant==='dark')
        try{ localStorage.setItem('schedule_theme', `noir-${variant}`) }catch{}
        return
      }
      if(next==='light' || next==='dark' || next.startsWith('default-')){
        const variant = next.endsWith('light') || next==='light' ? 'light' : 'dark'
        setTheme('default')
        setDark(variant==='dark')
        try{ localStorage.setItem('schedule_theme', `default-${variant}`) }catch{}
        return
      }
      // Fallback: treat anything else as default dark
      setTheme('default')
      setDark(true)
      try{ localStorage.setItem('schedule_theme', 'default-dark') }catch{}
    }
    window.addEventListener('schedule:set-theme', handler as any)
    return ()=> window.removeEventListener('schedule:set-theme', handler as any)
  },[])  // React to OS theme changes when preference is 'system'
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
  // Effective theme base
  const effectiveTheme = useMemo(()=> {
    return (theme==='system' ? 'default' : theme) as 'default'|'night'|'noir'|'prism'
  }, [theme])
  // Compute root classes based on effective theme
  const rootCls = useMemo(()=>{
    const baseCls = 'min-h-screen w-full'
    if(effectiveTheme==='night') return `${baseCls} bg-black text-red-500`
    if(effectiveTheme==='noir') return dark ? `${baseCls} bg-neutral-950 text-neutral-100` : `${baseCls} bg-neutral-100 text-neutral-900`
    if(effectiveTheme==='prism') return `${baseCls} bg-slate-950 text-slate-100`
    return dark? `${baseCls} bg-neutral-950 text-neutral-100` : `${baseCls} bg-neutral-100 text-neutral-900`
  }, [effectiveTheme, dark])
  const themeVariantAttr = useMemo<'light'|'dark'>(()=>{
    if(theme==='night') return 'dark'
    if(theme==='prism') return 'dark'
    return dark ? 'dark' : 'light'
  }, [theme, dark])
  // Start empty to avoid placeholder flicker; only use sample when explicitly enabled
  const [shifts, setShifts] = useState<Shift[]>(USE_SAMPLE ? SAMPLE.shifts : [])
  const [pto, setPto] = useState<PTO[]>(USE_SAMPLE ? SAMPLE.pto : [])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [tz, setTz] = useState(TZ_OPTS[0])
  const [slimline, setSlimline] = useState<boolean>(()=>{
    try{ const v = localStorage.getItem('schedule_slimline'); if(v===null) return false; return v==='1' }
    catch{ return false }
  })
  // Keep selected day/week synced to "today" only if the user was on today previously.
  // This avoids surprising jumps when they had a different day selected.
  const prevYmdRef = React.useRef<string | null>(null)
  const followTodayRef = React.useRef<boolean>(false)
  useEffect(()=>{
    const syncToToday = ()=>{
      try{
        const now = nowInTZ(tz.id)
        const selectedDate = addDays(parseYMD(weekStart), dayIndex)
        const selectedYmd = fmtYMD(selectedDate)
        const prev = prevYmdRef.current
        if(prev == null){
          prevYmdRef.current = now.ymd
          followTodayRef.current = (selectedYmd === now.ymd)
          return
        }
        if(prev !== now.ymd){
          // Day changed (or TZ change crossed midnight). Follow only if previously on today.
          const shouldFollow = (selectedYmd === prev)
          if(shouldFollow){
            const idx = DAYS.indexOf(now.weekdayShort as any)
            if(idx >= 0 && idx !== dayIndex) setDayIndex(idx)
            const weekStartToday = fmtYMD(startOfWeek(parseYMD(now.ymd)))
            if(weekStart !== weekStartToday) setWeekStart(weekStartToday)
            followTodayRef.current = true
          }else{
            followTodayRef.current = (selectedYmd === now.ymd)
          }
          prevYmdRef.current = now.ymd
          return
        }
        // Same day: update tracker to reflect whether we're on today or not
        followTodayRef.current = (selectedYmd === now.ymd)
      }catch{}
    }
    // Initial sync and re-sync when the tab becomes visible
    syncToToday()
    const onVis = ()=>{ if(document.visibilityState === 'visible') syncToToday() }
    document.addEventListener('visibilitychange', onVis)
    // Periodic check to catch midnight rollovers while the tab is open
    const intervalId = window.setInterval(syncToToday, 60_000)
    return ()=>{
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(intervalId)
    }
  }, [tz.id, dayIndex, weekStart])
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
  type AgentRow = { id?: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: MeetingCohort | null }
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
  const prevShiftIdsRef = React.useRef<Set<string>>(new Set())

  const [canEdit, setCanEdit] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Draft scheduling state (separate from live). Persisted locally until published/discarded
  type DraftMeta = { id: string; createdBy?: string; createdAt: string; updatedAt: string; publishedAt?: string }
  type DraftData = { shifts: Shift[]; pto: PTO[]; overrides: Override[]; calendarSegs: CalendarSegment[] }
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
      data: { shifts: JSON.parse(JSON.stringify(shifts)), pto: JSON.parse(JSON.stringify(pto)), overrides: JSON.parse(JSON.stringify(overrides)), calendarSegs: JSON.parse(JSON.stringify(calendarSegs)) }
    }
    setDraft(d); saveDraftLocal(d)
  }
  const startDraftEmpty = (createdBy?: string)=>{
    const now = new Date().toISOString()
    const d: Draft = { meta: { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), createdBy, createdAt: now, updatedAt: now }, data: { shifts: [], pto: [], overrides: [], calendarSegs: [] } }
    setDraft(d); saveDraftLocal(d)
  }
  const discardDraft = ()=>{ setDraft(null); saveDraftLocal(null) }
  const publishDraft = async ()=>{
    if(!draft) return false
    const result = await publishDraftBundle({
      draft: draft.data,
      agents: agentsV2,
      cloudPost,
      agentIdByFullName
    })
    if(result.ok){
      setShifts(result.payload.shifts)
      setPto(result.payload.pto)
      setCalendarSegs(result.payload.calendarSegs)
      setOverrides(result.payload.overrides)
      const published: Draft = { ...draft, meta: { ...draft.meta, updatedAt: result.payload.updatedAt, publishedAt: result.payload.updatedAt } }
      try{ localStorage.setItem('schedule_last_published', JSON.stringify(published.meta)) }catch{}
      setDraft(null); saveDraftLocal(null)
    }
    return result.ok
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
    // Editing is allowed only when an authenticated admin session exists.
    setCanEdit(hasAdminSession())
  })() }, [view])

  // React to auth changes from Manage login/logout so autosave can kick in immediately
  useEffect(()=>{
    const onAuth = (e: Event)=>{
      const any = e as CustomEvent
      const ok = !!hasAdminSession()
      setCanEdit(ok)
      if(ok){
        // Push current agents metadata so other users see changes
        const payload = mapAgentsToPayloads(agentsV2)
        cloudPostAgents(payload)
      }
    }
    window.addEventListener('schedule:auth', onAuth as any)
    return ()=> window.removeEventListener('schedule:auth', onAuth as any)
  }, [agentsV2])

  useEffect(()=>{ (async()=>{
    if(!siteUnlocked) return
    const data=await cloudGet();
    if(data){
      setShifts(data.shifts);
      setPto(data.pto);
      if(Array.isArray(data.calendarSegs)) setCalendarSegs(data.calendarSegs as any)
      if(Array.isArray((data as any).overrides)) setOverrides((data as any).overrides as any)
      // Prefer cloud-backed agents if present
      if(Array.isArray((data as any).agents)){
        const arr = (data as any).agents as any[]
        setAgentsV2(arr as any)
        try{ localStorage.setItem('schedule_agents_v2_v1', JSON.stringify(arr)) }catch{}
      }
      try{ prevShiftIdsRef.current = new Set((data.shifts||[]).map((s:any)=> s.id).filter(Boolean)) }catch{}
      setLoadedFromCloud(true)
    }
  })() },[siteUnlocked])
  // Keep view in sync with URL hash and vice versa
  useEffect(()=>{
    const handler = ()=> setView(hashToView(window.location.hash))
    window.addEventListener('hashchange', handler)
    return ()=> window.removeEventListener('hashchange', handler)
  },[hashToView])
  useEffect(()=>{
    if(view==='manageV2'){
      // Keep any sub-hash like #manage2/shifts; only ensure it starts with #manage2
      const h = window.location.hash || ''
      const low = h.toLowerCase()
      if(!low.startsWith('#manage2')){
        window.location.hash = '#manage2'
      }
    } else if(view==='teams') {
      const h = window.location.hash || ''
      const low = h.toLowerCase()
      if(!low.startsWith('#teams')){
        window.location.hash = '#teams'
      }
    } else if(view==='stagingPreview') {
      const h = window.location.hash || ''
      const low = h.toLowerCase()
      if(!low.startsWith('#flow')){
        window.location.hash = '#flow'
      }
    } else if(view==='immersive') {
      const h = window.location.hash || ''
      const low = h.toLowerCase()
      if(!low.startsWith('#immersive')){
        window.location.hash = '#immersive'
      }
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
    const t=setTimeout(async ()=>{ 
      const shiftsWithIds = shifts.map(s=> s.agentId ? s : ({ ...s, agentId: agentIdByFullName(s.person) }))
      // Detect deletions compared to last known server snapshot
      let deletes: string[] = []
      try{
        const prev = prevShiftIdsRef.current
        if(prev && prev.size>0){
          const cur = new Set(shiftsWithIds.map(s=> s.id).filter(Boolean) as string[])
          deletes = Array.from(prev).filter(id=> !cur.has(id))
        }
      }catch{}
      // Prefer v2 batch upsert for shifts; fallback to doc post on failure
      try{
        const ok = await cloudPostShiftsBatch({ upserts: shiftsWithIds as any, deletes })
        if(ok){
          try{ prevShiftIdsRef.current = new Set(shiftsWithIds.map(s=> s.id).filter(Boolean) as string[]) }catch{}
        } else if(ALLOW_DOC_FALLBACK) {
          const ptoWithIds = pto.map(p=> (p as any).agentId ? p : ({ ...p, agentId: agentIdByFullName(p.person) }))
          const overridesWithIds = overrides.map(o=> (o as any).agentId ? o : ({ ...o, agentId: agentIdByFullName(o.person) }))
          const agentsPayload = mapAgentsToPayloads(agentsV2)
          await cloudPost({shifts: shiftsWithIds, pto: ptoWithIds, overrides: overridesWithIds as any, calendarSegs, agents: agentsPayload, updatedAt:new Date().toISOString()})
        }
      }catch{}
    },600); 
    return ()=>clearTimeout(t) 
  },[shifts,pto,calendarSegs,agentsV2,loadedFromCloud,canEdit,draftActive])

  // Persist agent metadata (including hidden flags) even when a draft is active.
  // This lets the Hide/Show Agent toggle reflect across devices immediately without waiting for a draft publish.
  useEffect(()=>{
    if(!loadedFromCloud || !canEdit) return
    const t = setTimeout(()=>{
      // Prefer agents-only endpoint to avoid schedule conflicts
      pushAgentsToCloud(agentsV2, cloudPostAgents)
    }, 600)
    return ()=> clearTimeout(t)
  }, [agentsV2, loadedFromCloud, canEdit])

  // Auto-refresh schedule view every 5 minutes from the cloud (read-only)
  // Use refs to avoid creating a render loop when setting state inside this effect.
  const lastJsonRef = React.useRef<{ shifts: string; pto: string; overrides: string; cal: string; agents: string }>({ shifts: '', pto: '', overrides: '', cal: '', agents: '' })
  useEffect(()=>{
    if(view!=='schedule' && view!=='stagingPreview' && view!=='immersive') return
    if(!siteUnlocked) return
    let stopped = false
    const pull = async ()=>{
      const data = await cloudGet()
      if(!data || stopped) return
      const s = JSON.stringify(data.shifts||[])
      const p = JSON.stringify(data.pto||[])
      const c = JSON.stringify(Array.isArray(data.calendarSegs)? data.calendarSegs : [])
      const o = JSON.stringify(Array.isArray((data as any).overrides)? (data as any).overrides : [])
      const a = JSON.stringify(Array.isArray((data as any).agents)? (data as any).agents : [])
      if(s !== lastJsonRef.current.shifts){ setShifts(data.shifts); lastJsonRef.current.shifts = s }
      if(p !== lastJsonRef.current.pto){ setPto(data.pto); lastJsonRef.current.pto = p }
      if(c !== lastJsonRef.current.cal){ setCalendarSegs((data.calendarSegs as any) || []); lastJsonRef.current.cal = c }
      if(o !== lastJsonRef.current.overrides){ setOverrides(((data as any).overrides as any) || []); lastJsonRef.current.overrides = o }
      if(a !== lastJsonRef.current.agents && Array.isArray((data as any).agents)){
        setAgentsV2((data as any).agents as any)
        lastJsonRef.current.agents = a
        try{ localStorage.setItem('schedule_agents_v2_v1', a) }catch{}
      }
      try{ prevShiftIdsRef.current = new Set((data.shifts||[]).map((s:any)=> s.id).filter(Boolean)) }catch{}
    }
    pull()
    const id = setInterval(pull, 5 * 60 * 1000)
    // No SSE in unified Worker path; polling is sufficient
    return ()=>{ stopped = true; clearInterval(id) }
  }, [view, siteUnlocked])

  // Normalize displayed names from agents list when possible (overlay real names onto placeholder person fields)
  useEffect(()=>{
    if(!loadedFromCloud) return
    if(!agentsV2 || agentsV2.length===0) return
    // Build id -> name map once
    const idToName = new Map<string,string>()
    for(const a of agentsV2){
      const nm = `${(a.firstName||'').trim()} ${(a.lastName||'').trim()}`.trim()
      if(a.id && nm) idToName.set(a.id as string, nm)
    }
    // Remap shifts
    let changedS = false
    const remapShifts = shifts.map(s=>{
      if(s && (s as any).agentId){
        const nm = idToName.get((s as any).agentId as string)
        if(nm && nm !== s.person){ changedS = true; return { ...s, person: nm } }
      }
      return s
    })
    if(changedS) setShifts(remapShifts)
    // Remap PTO
    let changedP = false
    const remapPto = pto.map(p=>{
      const id = (p as any).agentId as string | undefined
      if(id){ const nm = idToName.get(id); if(nm && nm !== p.person){ changedP = true; return { ...p, person: nm } } }
      return p
    })
    if(changedP) setPto(remapPto)
    // Remap calendar segments
    let changedC = false
    const remapCal = calendarSegs.map(c=>{
      const id = (c as any).agentId as string | undefined
      if(id){ const nm = idToName.get(id); if(nm && nm !== c.person){ changedC = true; return { ...c, person: nm } } }
      return c
    })
    if(changedC) setCalendarSegs(remapCal as any)
  }, [loadedFromCloud, agentsV2, shifts, pto, calendarSegs])

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

  const handleSignOut = useCallback(async ()=>{
    try{ await logout() }catch{}
    try{ await logoutSite() }catch{}
    try{
      localStorage.removeItem('schedule_admin_unlocked')
      localStorage.removeItem('site_unlocked_hint')
    }catch{}
    setShowShortcuts(false)
    setSiteUnlocked(false)
    setSitePw('')
    setSiteMsg('')
    setView('schedule')
    if(typeof window !== 'undefined'){
      try{ window.location.hash = '#schedule' }catch{}
    }
  }, [])

  if(!siteUnlocked){
    const dark = true
    const showUnlocking = autoUnlock || autoUnlocking
    return (
      <div className={dark?"min-h-screen w-full bg-neutral-950 text-neutral-100":"min-h-screen w-full bg-neutral-100 text-neutral-900"}>
        <div className="max-w-md mx-auto p-6">
          <section className={["rounded-2xl p-6 space-y-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
            {showUnlocking ? (
              <>
                <div className="text-lg font-semibold">Unlocking dev session…</div>
                <p className="text-sm opacity-80">Connecting to the worker.</p>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold">Protected — Enter Site Password</div>
                <p className="text-sm opacity-80">Sign in to view the schedule.</p>
                <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
                  const { ok, status } = await loginSite(sitePw)
                  if(ok){ setSiteUnlocked(true); setSiteMsg(''); try{ localStorage.setItem('site_unlocked_hint','1') }catch{} }
                  else if(status===401){ setSiteMsg('Incorrect password') }
                  else if(status===403){ setSiteMsg('Forbidden by server policy') }
                  else if(status===404){ setSiteMsg('API endpoint not found') }
                  else { setSiteMsg('Network error. Is the API running?') }
                })() }}>
                  <div className="flex gap-2">
                    <input type="password" autoFocus className="flex-1 border rounded-xl px-3 py-2 bg-neutral-900 border-neutral-700" value={sitePw} onChange={(e)=>setSitePw(e.target.value)} placeholder="Password" />
                    <button type="submit" className="rounded-xl px-4 py-2 font-medium border bg-neutral-800 border-neutral-700">Sign in</button>
                  </div>
                </form>
                {siteMsg && (<div className="text-sm text-red-300">{siteMsg}</div>)}
                <div className="pt-3 border-t border-neutral-800 mt-3">
                  <div className="text-sm font-medium mb-1">Or email me a magic link</div>
                  <MagicLoginPanelLite dark={dark} role="site" />
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    )
  }

  // Show a simple loader until cloud data is fetched to avoid placeholder flicker
  if(!loadedFromCloud){
    const dark = true
    return (
      <div className={dark?"min-h-screen w-full bg-neutral-950 text-neutral-100":"min-h-screen w-full bg-neutral-100 text-neutral-900"}>
        <div className="max-w-md mx-auto p-6">
          <section className={["rounded-2xl p-6 space-y-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
            <div className="text-lg font-semibold">Loading schedule…</div>
            <p className="text-sm opacity-80">Fetching the latest data.</p>
          </section>
        </div>
      </div>
    )
  }

  return (
    <TimeFormatProvider value={timeFormatValue}>
      <ErrorCatcher dark={dark}>
  <div className={rootCls} data-theme={effectiveTheme} data-theme-variant={themeVariantAttr}>
        <div className="max-w-full mx-auto p-2 md:p-4 space-y-4">
          <TopBar
          dark={dark} setDark={setDark}
          view={view} setView={setTopBarView}
          weekStart={weekStart} setWeekStart={setWeekStart}
          tz={tz} setTz={setTz}
          canEdit={canEdit}
          editMode={editMode}
          setEditMode={setEditMode}
          showFlow={previewEnabled}
          showImmersive={previewEnabled}
        />

          {view==='schedule' ? (
            <SchedulePage
              dark={dark}
              weekStart={weekStart}
              dayIndex={dayIndex}
              setDayIndex={setDayIndex}
              shifts={shifts}
              pto={pto}
              overrides={overrides}
              tasks={tasks}
              calendarSegs={calendarSegs}
              tz={tz}
              canEdit={canEdit}
              editMode={editMode}
              onRemoveShift={(id)=> setShifts(prev=>prev.filter(s=>s.id!==id))}
              agents={agentsV2}
              slimline={slimline}
            />
          ) : view==='stagingPreview' ? (
            <StagingPreviewPage
              dark={dark}
              weekStart={weekStart}
              shifts={shifts}
              pto={pto}
              overrides={overrides}
              tz={tz}
              agents={agentsV2}
            />
          ) : view==='immersive' ? (
            <ImmersiveSchedulePage
              dark={dark}
              weekStart={weekStart}
              shifts={shifts}
              pto={pto}
              overrides={overrides}
              tz={tz}
              agents={agentsV2}
            />
          ) : view==='teams' ? (
            <TeamsPage
              dark={dark}
              weekStart={weekStart}
              agents={agentsV2}
              shifts={draftActive ? (draft!.data.shifts || shifts) : shifts}
              pto={draftActive ? (draft!.data.pto) : pto}
              overrides={draftActive ? (draft!.data.overrides) : overrides}
              tasks={tasks}
              calendarSegs={draftActive ? (draft!.data.calendarSegs) : calendarSegs}
              tz={tz}
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
                setAgentsV2(prev=> prev.concat([{ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), firstName: a.firstName, lastName: a.lastName, tzId: a.tzId, hidden: false, meetingCohort: undefined }]))
              }}
              onUpdateAgent={(index:number, a:{ firstName:string; lastName:string; tzId?:string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: MeetingCohort | null })=>{
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

                const rawMeeting = (a as any).meetingCohort
                const nextMeeting: MeetingCohort | undefined = (() => {
                  if(rawMeeting === undefined) return cur.meetingCohort ?? undefined
                  if(rawMeeting === null) return undefined
                  if(typeof rawMeeting === 'string'){
                    const trimmed = rawMeeting.trim()
                    return MEETING_COHORTS.includes(trimmed as MeetingCohort) ? trimmed as MeetingCohort : undefined
                  }
                  return undefined
                })()

                // Propagate rename across current dataset (draft-aware via routed setters)
                if(nameKey(newFull) !== nameKey(oldFull)){
                  const id = cur.id
                  const ensureId = (xId?:string)=> xId || id
                  setShiftsRouted(prev=> prev.map(s=> s.person===oldFull ? { ...s, person: newFull, agentId: ensureId(s.agentId) } : s))
                  setPtoRouted(prev=> prev.map(p=> p.person===oldFull ? { ...p, person: newFull, agentId: ensureId((p as any).agentId) } : p))
                  setCalendarSegsRouted(prev=> prev.map(cs=> cs.person===oldFull ? { ...cs, person: newFull, agentId: ensureId((cs as any).agentId) } : cs))
                }

                // Finally update the agents list
                setAgentsV2(prev=> prev.map((r,i)=> i===index ? {
                  ...r,
                  firstName: nextFirst,
                  lastName: nextLast,
                  tzId: a.tzId || r.tzId,
                  hidden: a.hidden!=null ? a.hidden : r.hidden,
                  isSupervisor: a.isSupervisor!=null ? !!a.isSupervisor : r.isSupervisor,
                  supervisorId: (a.supervisorId!==undefined) ? (a.supervisorId ?? null) : r.supervisorId,
                  notes: a.notes!==undefined ? a.notes : r.notes,
                  meetingCohort: nextMeeting,
                } : r))
              }}
              onDeleteAgent={(index:number)=> setAgentsV2(prev=>{
                const target = prev[index]
                if(!target) return prev.filter((_,i)=> i!==index)
                const targetId = target.id
                const filtered = prev.filter((_,i)=> i!==index)
                if(!targetId) return filtered
                return filtered.map(a=> a.supervisorId===targetId ? { ...a, supervisorId: null } : a)
              })}
              weekStart={weekStart}
              setWeekStart={setWeekStart}
              tz={tz}
              shifts={draftActive ? (draft!.data.shifts) : shifts}
              pto={draftActive ? (draft!.data.pto) : pto}
              overrides={draftActive ? (draft!.data.overrides) : overrides}
              tasks={tasks}
              calendarSegs={draftActive ? (draft!.data.calendarSegs) : calendarSegs}
              onUpdateShift={(id, patch)=> setShiftsRouted(prev=> prev.map(s=> s.id===id ? { ...s, ...patch } : s))}
              onDeleteShift={(id)=> setShiftsRouted(prev=> prev.filter(s=> s.id!==id))}
              onAddShift={(s)=> setShiftsRouted(prev=> prev.concat([{ ...s, agentId: s.agentId || agentIdByFullName(s.person) }]))}
              setShifts={setShiftsRouted}
              setTasks={setTasks}
              setCalendarSegs={setCalendarSegsRouted}
              setPto={setPtoRouted}
              setOverrides={(updater)=>{
                if(draftActive){
                  setDraft(prev=>{
                    if(!prev) return prev
                    const nextOver = updater(prev.data.overrides)
                    const next: Draft = { meta: { ...prev.meta, updatedAt: new Date().toISOString() }, data: { ...prev.data, overrides: nextOver } }
                    saveDraftLocal(next); return next
                  })
                } else {
                  setOverrides(updater)
                }
              }}
            />
          )}
          {showShortcuts && (
            <ShortcutsOverlay
              dark={dark}
              view={view}
              onClose={()=> setShowShortcuts(false)}
              previewEnabled={previewEnabled}
              immersiveEnabled={previewEnabled}
            />
          )}
        </div>
        <footer className="px-4 pb-6 text-center text-xs">
          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3 opacity-70">
            <span>© Beta Bionics. Built by Ben Steward.</span>
            <span className="font-mono text-[11px] sm:text-xs opacity-80">Build {buildStamp}</span>
            {siteUnlocked && (
              <button
                type="button"
                onClick={handleSignOut}
                className={[
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  dark
                    ? "border-neutral-700 bg-neutral-900/80 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                    : "border-neutral-300 bg-white/80 text-neutral-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                ].join(' ')}
              >
                Sign out
              </button>
            )}
          </div>
        </footer>
      </div>
      </ErrorCatcher>
    </TimeFormatProvider>
  )
}

function MagicLoginPanelLite({ dark, role }:{ dark:boolean; role:'site'|'admin' }){
  const [email, setEmail] = React.useState('')
  const [msg, setMsg] = React.useState('')
  const [link, setLink] = React.useState<string|undefined>(undefined)
  return (
    <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
      setMsg(''); setLink(undefined)
      const r = await requestMagicLink(email, role)
      if(r.ok){
        if(r.link){ setLink(r.link); setMsg('Dev mode: click the link below to sign in.') }
        else setMsg('Check your inbox for the sign-in link.')
      }else{
        setMsg('Failed to request link. Check email format and try again.')
      }
    })() }}>
      <div className="flex gap-2 items-center">
        <input type="email" required className={["flex-1 border rounded-xl px-3 py-2", dark && "bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@company.com" />
        <button type="submit" className={["rounded-xl px-3 py-2 text-sm font-medium border", dark ? "bg-neutral-800 border-neutral-700" : "bg-blue-600 text-white border-blue-600"].join(' ')}>Email link</button>
      </div>
      {msg && (<div className="text-xs mt-2 opacity-80">{msg}</div>)}
      {link && (
        <div className="mt-2 text-xs break-all">
          <a className="underline" href={link} target="_blank" rel="noreferrer">{link}</a>
        </div>
      )}
    </form>
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
