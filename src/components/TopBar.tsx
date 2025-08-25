import React from 'react'
import { addDays, fmtNice, isoWeek, parseYMD } from '../lib/utils'
import { TZ_OPTS } from '../constants'

export default function TopBar({ dark, setDark, view, setView, weekStart, setWeekStart, tz, setTz, canEdit, editMode, setEditMode }:{ 
  dark: boolean
  setDark: React.Dispatch<React.SetStateAction<boolean>>
  view: 'schedule'|'manage'
  setView: (v:'schedule'|'manage')=>void
  weekStart: string
  setWeekStart: (v:string)=>void
  tz: { id:string; label:string; offset:number }
  setTz: (v:{ id:string; label:string; offset:number })=>void
  canEdit: boolean
  editMode: boolean
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>
}){
  const weekStartDate = parseYMD(weekStart)
  const weekEndDate = addDays(weekStartDate, 6)
  const iw = isoWeek(weekStartDate)
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Schedule 2 — {iw.year} Week {iw.week}</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">{fmtNice(weekStartDate)} – {fmtNice(weekEndDate)}</div>
          <label className="flex items-center gap-2 text-sm">
            <span className="hidden md:inline">Dark</span>
            <button role="switch" aria-checked={dark} onClick={()=>setDark((v:boolean)=>!v)} className={["w-12 h-7 rounded-full border relative transition", dark?"bg-neutral-700 border-neutral-600":"bg-neutral-300 border-neutral-400"].join(' ')}>
              <span className={["absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform", dark?"translate-x-5":"translate-x-0"].join(' ')} />
            </button>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>setView('schedule')} className={["px-4 py-2 rounded-xl text-base font-medium border", view==='schedule' ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}>Schedule</button>
          <button onClick={()=>setView('manage')} className={["px-4 py-2 rounded-xl text-base font-medium border", view==='manage' ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}>Manage Data</button>
        </div>
        <div className="flex items-end gap-4">
          <label className="flex flex-col text-sm">
            <span className="mb-1">Timezone</span>
            <select className={["border rounded-lg px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={tz.id} onChange={e=>{ const opt = TZ_OPTS.find(x=>x.id===e.target.value); if(opt) setTz(opt); }}>
              {TZ_OPTS.map(o=>(<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1">Week start (Mon)</span>
            <input className={["border rounded-lg px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)} />
          </label>
          {/* Edit schedule toggle removed for schedule page per request */}
        </div>
      </div>
    </header>
  )
}
