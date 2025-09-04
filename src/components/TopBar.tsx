import React from 'react'
import { addDays, fmtDateRange, parseYMD, tzAbbrev, fmtYMD, startOfWeek } from '../lib/utils'
import { TZ_OPTS } from '../constants'

export default function TopBar({ dark, setDark, view, setView, weekStart, setWeekStart, tz, setTz, canEdit, editMode, setEditMode, allowDarkToggle=true }:{ 
  dark: boolean
  setDark: React.Dispatch<React.SetStateAction<boolean>>
  view: 'schedule'|'manageV2'
  setView: (v:'schedule'|'manageV2')=>void
  weekStart: string
  setWeekStart: (v:string)=>void
  tz: { id:string; label:string; offset:number }
  setTz: (v:{ id:string; label:string; offset:number })=>void
  canEdit: boolean
  editMode: boolean
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>
  allowDarkToggle?: boolean
}){
  const [mobileToolsOpen, setMobileToolsOpen] = React.useState(false)
  const isoLike = /^\d{4}-\d{2}-\d{2}$/
  const wsValid = isoLike.test(weekStart) && !Number.isNaN(parseYMD(weekStart).getTime())
  const safeWeekStartDate = wsValid ? parseYMD(weekStart) : startOfWeek(new Date())
  const weekEndDate = addDays(safeWeekStartDate, 6)
  return (
    <>
    <header className="mb-1">
  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-3 pt-0.5 pb-1 sm:pb-2">
    {/* Left: view buttons + mobile tools toggle */}
  <div className="flex flex-wrap items-center gap-2 justify-start">
          <button
            onClick={()=>setView('schedule')}
            aria-label="Schedule"
            title="Schedule"
            className={["inline-flex items-center justify-center h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium border", view==='schedule' ? (dark?"bg-neutral-900 border-neutral-600 text-neutral-200":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}
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
            // Legacy Manage button hidden per request
            // (left intentionally blank)
          />
          <button
            onClick={()=>setView('manageV2')}
            aria-label="Manage v2"
            title="Manage v2"
            className={["inline-flex items-center justify-center h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium border", view==='manageV2' ? (dark?"bg-neutral-900 border-neutral-600 text-neutral-200":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}
          >
            {/* Power/Zap icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </button>
          {/* (No inline mobile date; keep center date always) */}
        </div>

        {/* Center: title/date always visible to keep date centered */}
  <div className="block text-center whitespace-nowrap overflow-visible">
    <div className={[dark?"text-neutral-400":"text-neutral-600","text-[0.9rem] sm:text-[0.95rem] font-semibold leading-tight"].join(' ')}>Customer Care Team Schedule</div>
  {view==='manageV2' ? (
    <div className={["font-bold tracking-wide", dark?"text-red-300":"text-red-600","text-xl sm:text-2xl"].join(' ')} style={{ letterSpacing: '0.02em', lineHeight: 1.12 }}>PORTAL OF POWER</div>
  ) : (
    <div className={["font-medium tabular-nums","text-lg sm:text-2xl leading-tight"].join(' ')} style={{ letterSpacing: '0.005em' }}>{fmtDateRange(safeWeekStartDate, weekEndDate)}</div>
  )}
  </div>

  {/* Right: tools toggle on mobile, full selectors on desktop */}
  <div className="w-full sm:w-auto">
        {/* Mobile tools button on the right */}
        <div className="flex sm:hidden items-center justify-end">
          <button
            className={["inline-flex items-center justify-center h-9 w-9 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
            onClick={()=> setMobileToolsOpen(v=>!v)}
            aria-label={mobileToolsOpen ? 'Hide tools' : 'Show tools'}
            aria-expanded={mobileToolsOpen}
            aria-controls="mobile-tools"
            title={mobileToolsOpen ? 'Hide tools' : 'Show tools'}
          >
            {/* Sliders icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="4" y1="21" x2="4" y2="14"/>
              <line x1="4" y1="10" x2="4" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12" y2="3"/>
              <line x1="20" y1="21" x2="20" y2="16"/>
              <line x1="20" y1="12" x2="20" y2="3"/>
              <line x1="1" y1="14" x2="7" y2="14"/>
              <line x1="9" y1="8" x2="15" y2="8"/>
              <line x1="17" y1="16" x2="23" y2="16"/>
            </svg>
          </button>
        </div>
        {/* Mobile panel */}
        {mobileToolsOpen && (
          <div id="mobile-tools" className="sm:hidden mt-2 flex flex-col gap-2">
            {/* Timezone */}
            <div className="relative w-full">
              <svg aria-hidden className={["pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5", dark?"text-neutral-300":"text-neutral-600"].join(' ')} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20"/>
                <path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20"/>
              </svg>
              <select
                aria-label="Timezone"
                title="Timezone"
                className={["border rounded-lg pl-9 pr-2 h-9 text-sm appearance-none w-full", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                value={tz.id}
                onChange={e=>{ const opt = TZ_OPTS.find(x=>x.id===e.target.value); if(opt) setTz(opt); }}
              >
                {TZ_OPTS.map(o=>(<option key={o.id} value={o.id}>{tzAbbrev(o.id)}</option>))}
              </select>
            </div>
            {/* Date */}
            <div className="relative w-full">
              <input
                aria-label="Week start (Sun)"
                title="Week start (Sun)"
                className={["border rounded-lg pl-3 pr-2 h-9 text-sm w-full", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                type="date"
                value={wsValid ? weekStart : fmtYMD(safeWeekStartDate)}
                onChange={e=>{
                  const v = e.target.value
                  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) setWeekStart(v)
                  else setWeekStart(fmtYMD(startOfWeek(new Date())))
                }}
                style={{ colorScheme: dark ? 'dark' : 'light' }}
              />
            </div>
            {/* (Dark mode toggle removed) */}
          </div>
        )}
        {/* Desktop controls */}
        <div className="hidden sm:flex flex-wrap items-center gap-1.5 sm:gap-2 justify-end">
          {/* Timezone */}
          <div className="relative w-full sm:w-auto">
            <svg aria-hidden className={["pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5", dark?"text-neutral-300":"text-neutral-600"].join(' ')} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20"/>
              <path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20"/>
            </svg>
            <select
              aria-label="Timezone"
              title="Timezone"
              className={["border rounded-lg pl-9 pr-2 h-9 sm:h-10 text-xs sm:text-sm appearance-none w-full sm:w-auto", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
              value={tz.id}
              onChange={e=>{ const opt = TZ_OPTS.find(x=>x.id===e.target.value); if(opt) setTz(opt); }}
            >
              {TZ_OPTS.map(o=>(<option key={o.id} value={o.id}>{tzAbbrev(o.id)}</option>))}
            </select>
          </div>
          {/* Date */}
          <div className="relative w-full sm:w-auto">
            <input
              aria-label="Week start (Sun)"
              title="Week start (Sun)"
              className={["border rounded-lg pl-3 pr-2 h-9 sm:h-10 text-xs sm:text-sm w-full sm:w-auto", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
              type="date"
              value={wsValid ? weekStart : fmtYMD(safeWeekStartDate)}
              onChange={e=>{
                const v = e.target.value
                if(/^\d{4}-\d{2}-\d{2}$/.test(v)) setWeekStart(v)
                else setWeekStart(fmtYMD(startOfWeek(new Date())))
              }}
              style={{ colorScheme: dark ? 'dark' : 'light' }}
            />
          </div>
          {/* (Dark mode toggle removed) */}
        </div>
      </div>
      </div>
    </header>
    
    </>
  )
}
