import React, { useEffect, useMemo, useState } from 'react'
import { fmtYMD, startOfWeek } from './lib/utils'
import { cloudGet, cloudPost } from './lib/api'
import type { PTO, Shift, Task } from './types'
import type { CalendarSegment } from './lib/utils'
import TopBar from './components/TopBar'
import SchedulePage from './pages/SchedulePage'
import ManagePage from './pages/ManagePage'
import { generateSample } from './sample'
import { sha256Hex } from './lib/utils'
import { TZ_OPTS } from './constants'

const SAMPLE = generateSample()

export default function App(){
  const [view,setView] = useState<'schedule'|'manage'>('schedule')
  const [weekStart,setWeekStart] = useState(()=>fmtYMD(startOfWeek(new Date())))
  const [dayIndex,setDayIndex] = useState(() => new Date().getDay());
  const [dark,setDark] = useState(true)
  const [shifts, setShifts] = useState<Shift[]>(SAMPLE.shifts)
  const [pto, setPto] = useState<PTO[]>(SAMPLE.pto)
  const [tz, setTz] = useState(TZ_OPTS[0])
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
    const ok = await cloudPost({ shifts: draft.data.shifts, pto: draft.data.pto, calendarSegs: draft.data.calendarSegs, updatedAt: now })
    if(ok){
      setShifts(draft.data.shifts)
      setPto(draft.data.pto)
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
    const expected = await sha256Hex(import.meta.env.VITE_SCHEDULE_WRITE_PASSWORD || 'betacares')
    const saved = localStorage.getItem('schedule_pw_hash')
    setCanEdit(saved === expected)
  })() }, [view])

  useEffect(()=>{ (async()=>{ const data=await cloudGet(); if(data){ setShifts(data.shifts); setPto(data.pto); if(Array.isArray(data.calendarSegs)) setCalendarSegs(data.calendarSegs as any) } setLoadedFromCloud(true) })() },[])
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
  // Auto-save local edits to the cloud only when editing is allowed and NOT in draft mode
  useEffect(()=>{ if(!loadedFromCloud || !canEdit || draftActive) return; const t=setTimeout(()=>{ cloudPost({shifts,pto,calendarSegs,updatedAt:new Date().toISOString()}) },600); return ()=>clearTimeout(t) },[shifts,pto,calendarSegs,loadedFromCloud,canEdit,draftActive])

  // Auto-refresh schedule view every 5 minutes from the cloud (read-only)
  useEffect(()=>{
    if(view!== 'schedule') return
    const id = setInterval(async ()=>{
      const data = await cloudGet()
      if(data){
        // Only update if changed to avoid unnecessary state churn
        const sameShifts = JSON.stringify(data.shifts) === JSON.stringify(shifts)
        const samePto = JSON.stringify(data.pto) === JSON.stringify(pto)
        if(!sameShifts) setShifts(data.shifts)
        if(!samePto) setPto(data.pto)
      }
    }, 5 * 60 * 1000)
    return ()=>clearInterval(id)
  }, [view, shifts, pto])

  return (
    <ErrorCatcher dark={dark}>
      <div className={dark?"min-h-screen w-full bg-neutral-950 text-neutral-100":"min-h-screen w-full bg-neutral-100 text-neutral-900"}>
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
            />
          ) : (
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
              // Draft controls
              isDraft={draftActive}
              draftMeta={draft?.meta || null}
              onStartDraftFromLive={startDraftFromLive}
              onStartDraftEmpty={startDraftEmpty}
              onDiscardDraft={discardDraft}
              onPublishDraft={publishDraft}
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
