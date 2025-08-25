import React from 'react'
import { addDays, fmtDateRange, parseYMD } from '../lib/utils'
import { TZ_OPTS } from '../constants'

export default function TopBar({ dark, setDark, view, setView, weekStart, setWeekStart, tz, setTz, canEdit, editMode, setEditMode }:{ 
  dark: boolean
  setDark: React.Dispatch<React.SetStateAction<boolean>>
  view: 'schedule'|'manage'|'draft'
  setView: (v:'schedule'|'manage'|'draft')=>void
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
  return (
    <header className="mb-2">
  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        {/* Left: view buttons */}
  <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={()=>setView('schedule')} className={["inline-flex items-center h-12 px-4 rounded-xl text-base font-medium border", view==='schedule' ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}>Schedule</button>
          <button onClick={()=>setView('manage')} className={["inline-flex items-center h-12 px-4 rounded-xl text-base font-medium border", view==='manage' ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}>Manage Data</button>
          <button onClick={()=>setView('draft')} className={["inline-flex items-center h-12 px-4 rounded-xl text-base font-medium border", view==='draft' ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}>Draft Tool</button>
        </div>

        {/* Center: date range only */}
  <div className="text-2xl font-medium text-center truncate">{fmtDateRange(weekStartDate, weekEndDate)}</div>

        {/* Right: selectors + dark toggle */}
        <div className="flex items-end gap-4 justify-end">
          <label className="flex flex-col text-sm">
            <span className="mb-1">Timezone</span>
            <select className={["border rounded-lg px-3 py-2 h-12", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={tz.id} onChange={e=>{ const opt = TZ_OPTS.find(x=>x.id===e.target.value); if(opt) setTz(opt); }}>
              {TZ_OPTS.map(o=>(<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1">Week start (Sun)</span>
            <input className={["border rounded-lg px-3 py-2 h-12", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 hidden md:inline">Dark</span>
            <button role="switch" aria-checked={dark} onClick={()=>setDark((v:boolean)=>!v)} className={["w-12 h-7 rounded-full border relative transition", dark?"bg-neutral-700 border-neutral-600":"bg-neutral-300 border-neutral-400"].join(' ')}>
              <span className={["absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform", dark?"translate-x-5":"translate-x-0"].join(' ')} />
            </button>
          </label>
          {/* Edit schedule toggle removed for schedule page per request */}
        </div>
      </div>
    </header>
  )
}
