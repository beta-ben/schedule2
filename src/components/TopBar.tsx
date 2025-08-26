import React from 'react'
import { addDays, fmtDateRange, parseYMD, tzAbbrev } from '../lib/utils'
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
  return (
    <header className="mb-1">
  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 pt-1 pb-2">
        {/* Left: view buttons */}
  <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            onClick={()=>setView('schedule')}
            aria-label="Schedule"
            title="Schedule"
            className={["inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-medium border", view==='schedule' ? (dark?"bg-neutral-900 border-neutral-600 text-neutral-200":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}
          >
            {/* Calendar icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="4.5" width="18" height="16" rx="2"/>
              <path d="M8 3v3"/>
              <path d="M16 3v3"/>
              <path d="M3 9.5h18"/>
              <path d="M8 13h3"/>
              <path d="M8 17h8"/>
            </svg>
          </button>
          <button
            onClick={()=>setView('manage')}
            aria-label="Manage Data"
            title="Manage Data"
            className={["inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-medium border", view==='manage' ? (dark?"bg-neutral-900 border-neutral-600 text-neutral-200":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}
          >
            {/* Sliders icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
              <circle cx="9" cy="6" r="2"/>
              <circle cx="15" cy="12" r="2"/>
              <circle cx="11" cy="18" r="2"/>
            </svg>
          </button>
        </div>

        {/* Center: page title above date range */}
  <div className="text-center whitespace-nowrap overflow-visible">
    <div className={dark?"text-neutral-400":"text-neutral-600"} style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.05 }}>Customer Care Team Schedule</div>
  <div className="font-medium tabular-nums" style={{ letterSpacing: '0.005em', fontSize: '1.35rem', lineHeight: 1.12 }}>{fmtDateRange(weekStartDate, weekEndDate)}</div>
  </div>

  {/* Right: selectors + dark toggle */}
  <div className="flex items-center gap-2 justify-end">
          {/* Timezone select with embedded icon */}
          <div className="relative">
            <svg aria-hidden className={["pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5", dark?"text-neutral-300":"text-neutral-600"].join(' ')} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20"/>
              <path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20"/>
            </svg>
            <select
              aria-label="Timezone"
              title="Timezone"
              className={["border rounded-lg pl-9 pr-2 h-10 text-sm appearance-none", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
              value={tz.id}
              onChange={e=>{ const opt = TZ_OPTS.find(x=>x.id===e.target.value); if(opt) setTz(opt); }}
            >
              {TZ_OPTS.map(o=>(<option key={o.id} value={o.id}>{tzAbbrev(o.id)}</option>))}
            </select>
          </div>
      {/* Date picker (use native calendar icon) */}
      <div className="relative">
            <input
              aria-label="Week start (Sun)"
              title="Week start (Sun)"
        className={["border rounded-lg pl-3 pr-2 h-10 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
              type="date"
              value={weekStart}
              onChange={e=>setWeekStart(e.target.value)}
        style={{ colorScheme: dark ? 'dark' : 'light' }}
            />
          </div>
          <div className="flex items-center h-10">
            <button
              role="switch"
              aria-checked={dark}
              onClick={()=>setDark((v:boolean)=>!v)}
              className={[
                "w-12 h-10 rounded-lg border relative transition",
                dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"
              ].join(' ')}
              aria-label="Toggle dark mode"
              title={dark?"Switch to light mode":"Switch to dark mode"}
            >
              <span
                className={[
                  "absolute left-1 w-8 h-8 rounded-md shadow-sm flex items-center justify-center transition-transform border",
                  dark?"bg-neutral-800 border-neutral-600 text-neutral-200 translate-x-2":"bg-white border-neutral-300 text-neutral-700 translate-x-0"
                ].join(' ')}
                style={{ top: 3 }}
              >
                {dark ? (
                  // Moon icon
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 1 0 9.79 9.79Z" />
                  </svg>
                ) : (
                  // Sun icon
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                )}
              </span>
            </button>
          </div>
          {/* Edit schedule toggle removed for schedule page per request */}
        </div>
      </div>
    </header>
  )
}
