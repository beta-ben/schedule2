// Deprecated: Legacy ManagePage is no longer used. Retained temporarily to avoid churn.
import React from 'react'
import ManageEditor from './ManageEditor'
import { login } from '../lib/api'
import { parseYMD } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

export default function ManagePage({ dark, weekStart, shifts, setShifts, pto, setPto, tasks, setTasks, calendarSegs, setCalendarSegs, tz, isDraft=false, draftMeta=null, onStartDraftFromLive, onStartDraftEmpty, onDiscardDraft, onPublishDraft, agents }:{ 
  dark: boolean
  weekStart: string
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  pto: PTO[]
  setPto: (f:(prev:PTO[])=>PTO[])=>void
  tasks: Task[]
  setTasks: (f:(prev:Task[])=>Task[])=>void
  calendarSegs: CalendarSegment[]
  setCalendarSegs: (f:(prev:CalendarSegment[])=>CalendarSegment[])=>void
  tz: { id:string; label:string; offset:number }
  isDraft?: boolean
  draftMeta?: { id:string; createdBy?: string; createdAt: string; updatedAt: string; publishedAt?: string } | null
  onStartDraftFromLive?: (createdBy?: string)=>void
  onStartDraftEmpty?: (createdBy?: string)=>void
  onDiscardDraft?: ()=>void
  onPublishDraft?: ()=>Promise<boolean>
  agents?: Array<{ id?: string; firstName?: string; lastName?: string }>
}){
  const [unlocked, setUnlocked] = React.useState(false)
  const [pwInput, setPwInput] = React.useState('')
  const [msg, setMsg] = React.useState('')
  const weekStartDate = parseYMD(weekStart)
  React.useEffect(()=> { (async () => {
    const hasCsrf = typeof document!=='undefined' && /(?:^|; )csrf=/.test(document.cookie)
  if(hasCsrf){ setUnlocked(true); return }
  })() }, [])

  // Auth gates
  if (!unlocked) {
    return (
      <section className={["rounded-2xl p-6", dark ? "bg-neutral-900" : "bg-white shadow-sm"].join(' ')}>
        <div className="max-w-md mx-auto space-y-3">
          <div className="text-lg font-semibold">Protected — Manage Data</div>
          <p className="text-sm opacity-80">Sign in to your session.</p>
          <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
            const res = await login(pwInput)
            if(res.ok){ setUnlocked(true); setMsg(''); try{ localStorage.setItem('schedule_admin_unlocked','1') }catch{} } else { setMsg(res.status===401? 'Incorrect password' : 'Login failed') }
          })() }}>
            <div className="flex gap-2">
              <input type="password" autoFocus className={["flex-1 border rounded-xl px-3 py-2", dark && "bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pwInput} onChange={(e)=>setPwInput(e.target.value)} placeholder="Password" />
              <button type="submit" className={["rounded-xl px-4 py-2 font-medium border", dark ? "bg-neutral-800 border-neutral-700" : "bg-blue-600 text-white border-blue-600"].join(' ')}>Sign in</button>
            </div>
          </form>
          {msg && (<div className={["text-sm", dark ? "text-red-300" : "text-red-600"].join(' ')}>{msg}</div>)}
          <div className="text-xs opacity-70">Your API should set a session cookie and CSRF token on success.</div>
        </div>
      </section>
    )
  }

  return (
    <ManageUnlocked
      dark={dark}
      weekStartDate={weekStartDate}
      shifts={shifts}
      setShifts={setShifts}
      pto={pto}
      setPto={setPto}
      tasks={tasks}
      setTasks={setTasks}
      calendarSegs={calendarSegs}
      setCalendarSegs={setCalendarSegs}
      tz={tz}
      isDraft={isDraft}
      draftMeta={draftMeta}
      onStartDraftFromLive={onStartDraftFromLive}
      onStartDraftEmpty={onStartDraftEmpty}
      onDiscardDraft={onDiscardDraft}
      onPublishDraft={onPublishDraft}
    />
  )
}

class ErrorBoundary extends React.Component<{ dark:boolean; children: React.ReactNode }, { hasError: boolean; err?: any }>{
  constructor(props:any){ super(props); this.state = { hasError: false } }
  static getDerivedStateFromError(err:any){ return { hasError: true, err } }
  componentDidCatch(error:any, info:any){ console.error('Manage error', error, info) }
  render(){
    if(this.state.hasError){
      const { dark } = this.props
      return (
        <div className={["rounded-xl p-4 border", dark?"bg-red-900/30 border-red-800 text-red-200":"bg-red-50 border-red-200 text-red-900"].join(' ')}>
          <div className="font-semibold mb-1">Something broke rendering Manage</div>
          <div className="text-xs whitespace-pre-wrap break-all">
            {String(this.state.err?.message || this.state.err || 'Unknown error')}
          </div>
          <div className="text-xs opacity-80 mt-2">Check console for stack trace.</div>
        </div>
      )
    }
    return this.props.children as any
  }
}

function ManageUnlocked({ dark, weekStartDate, shifts, setShifts, pto, setPto, tasks, setTasks, calendarSegs, setCalendarSegs, tz, isDraft, draftMeta, onStartDraftFromLive, onStartDraftEmpty, onDiscardDraft, onPublishDraft, agents }:{
  dark:boolean
  weekStartDate: Date
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  pto: PTO[]
  setPto: (f:(prev:PTO[])=>PTO[])=>void
  tasks: Task[]
  setTasks: (f:(prev:Task[])=>Task[])=>void
  calendarSegs: CalendarSegment[]
  setCalendarSegs: (f:(prev:CalendarSegment[])=>CalendarSegment[])=>void
  tz: { id:string; label:string; offset:number }
  isDraft: boolean
  draftMeta: { id:string; createdBy?: string; createdAt: string; updatedAt: string; publishedAt?: string } | null
  onStartDraftFromLive?: (createdBy?: string)=>void
  onStartDraftEmpty?: (createdBy?: string)=>void
  onDiscardDraft?: ()=>void
  onPublishDraft?: ()=>Promise<boolean>
  agents?: Array<{ id?: string; firstName?: string; lastName?: string }>
}){
  // Draft banner and actions (safe: hooks are always called when ManageUnlocked is rendered)
  const [ownerName, setOwnerName] = React.useState(()=>{
    try{ return localStorage.getItem('schedule_owner_name') || '' }catch{ return '' }
  })
  React.useEffect(()=>{ try{ localStorage.setItem('schedule_owner_name', ownerName) }catch{} }, [ownerName])

  return (
    <section className="space-y-3">
      {isDraft ? (
        <div className={["rounded-xl p-3 border", dark?"bg-amber-900/30 border-amber-800 text-amber-200":"bg-amber-50 border-amber-200 text-amber-900"].join(' ')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold">Draft mode</div>
              <div className="text-xs opacity-80">
                ID: {draftMeta?.id?.slice(0,8) || '—'} • Created by: {draftMeta?.createdBy || ownerName || 'Unknown'} • Created: {draftMeta?.createdAt || '—'} • Last updated: {draftMeta?.updatedAt || '—'}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={onDiscardDraft} className={["px-3 py-1.5 rounded-lg border text-sm", "bg-red-600 border-red-600 text-white"].join(' ')}>Discard draft</button>
              <button onClick={async()=>{ if(!onPublishDraft) return; const ok = await onPublishDraft(); if(!ok) alert('Publish failed.') }} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Publish</button>
            </div>
          </div>
        </div>
      ) : (
        <div className={["rounded-xl p-3 border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">No draft in progress</div>
              <label className="text-xs flex items-center gap-2">
                <span>Owner</span>
                <input className={["border rounded px-2 py-1", dark&&"bg-neutral-950 border-neutral-700"].filter(Boolean).join(' ')} value={ownerName} onChange={e=>setOwnerName(e.target.value)} placeholder="Your name (optional)" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>onStartDraftEmpty?.(ownerName)} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Start empty draft</button>
              <button onClick={()=>onStartDraftFromLive?.(ownerName)} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Start from live</button>
            </div>
          </div>
        </div>
      )}

      <ErrorBoundary dark={dark}>
        <ManageEditor
          dark={dark}
          weekStartDate={weekStartDate}
          shifts={shifts}
          setShifts={setShifts}
          pto={pto}
          setPto={setPto}
          tasks={tasks}
          setTasks={setTasks}
          calendarSegs={calendarSegs}
          setCalendarSegs={setCalendarSegs}
          tz={tz}
          isDraft={isDraft}
          agents={agents}
        />
      </ErrorBoundary>
    </section>
  )
}
