import React from 'react'
import ThemeSelector from './ThemeSelector'
import { addDays, fmtDateRange, parseYMD, tzAbbrev, fmtYMD, startOfWeek } from '../lib/utils'
import { TZ_OPTS } from '../constants'

export default function TopBar({ dark, setDark, view, setView, weekStart, setWeekStart, tz, setTz, canEdit, editMode, setEditMode }:{ 
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
}){
  const isoLike = /^\d{4}-\d{2}-\d{2}$/
  const wsValid = isoLike.test(weekStart) && !Number.isNaN(parseYMD(weekStart).getTime())
  const safeWeekStartDate = wsValid ? parseYMD(weekStart) : startOfWeek(new Date())
  const weekEndDate = addDays(safeWeekStartDate, 6)
  // Small-screen consolidated menu state
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement|null>(null)
  React.useEffect(()=>{
    if(!menuOpen) return
    const onDocClick = (e: MouseEvent)=>{
      const t = e.target as Node
      if(menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent)=>{ if(e.key==='Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return ()=>{ document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])
  return (
    <>
    <header className="mb-1">
  <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 pt-0.5 pb-1 sm:pt-1 sm:pb-2">
        {/* Left: view buttons */}
        {/* XS: spacer to keep title centered vs menu button */}
        <div className="block sm:hidden" aria-hidden="true">
          <div className="h-9 w-9"></div>
        </div>
  <div className="hidden sm:flex flex-wrap items-center gap-2 justify-start">
          <button
            onClick={()=>setView('schedule')}
            aria-label="Schedule"
            title="Schedule"
            className={["inline-flex items-center justify-center h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg text-sm font-medium border", view==='schedule' ? (dark?"bg-neutral-900 border-neutral-600 text-neutral-200":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}
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
            className={["inline-flex items-center justify-center h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg text-sm font-medium border", view==='manageV2' ? (dark?"bg-neutral-900 border-neutral-600 text-neutral-200":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}
          >
            {/* Power/Zap icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </button>
        </div>

        {/* Center: page title above date range (or portal header in manage) */}
  <div className="text-center whitespace-nowrap overflow-visible leading-tight">
    <div className={[dark?"text-neutral-400":"text-neutral-600","font-semibold","text-[0.88rem] sm:text-[0.95rem]"].join(' ')}>Customer Care Team Schedule</div>
  {view==='manageV2' ? (
    <div className={["font-bold tracking-wide", dark?"text-red-300":"text-red-600","text-[1.15rem] sm:text-[1.35rem]"].join(' ')} style={{ letterSpacing: '0.02em' }}>PORTAL OF POWER</div>
  ) : (
    <div className={["font-medium tabular-nums","text-[1.15rem] sm:text-[1.35rem]"].join(' ')} style={{ letterSpacing: '0.005em' }}>{fmtDateRange(safeWeekStartDate, weekEndDate)}</div>
  )}
  </div>

  {/* Right: selectors + menu (sm+ inline, xs menu) */}
  <div className="relative flex items-center gap-2 justify-end w-full sm:w-auto">
          {/* XS menu button */}
          <div className="sm:hidden">
            <button
              onClick={()=> setMenuOpen(v=>!v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Menu"
              className={["inline-flex items-center justify-center h-9 w-9 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 4H14"/>
                <path d="M10 4H3"/>
                <path d="M18 8V4"/>
                <path d="M6 20V4"/>
                <path d="M21 20H12"/>
                <path d="M8 20H3"/>
                <path d="M12 14H3"/>
                <path d="M18 14H21"/>
                <path d="M12 14V20"/>
              </svg>
            </button>
          </div>
          {menuOpen && (
            <div ref={menuRef} className={["absolute right-0 top-full mt-2 z-50 w-[18rem] max-w-[calc(100vw-1rem)] rounded-xl p-3 border shadow-lg", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-900"].join(' ')} role="menu">
              {/* Views section */}
              <div className="mb-2">
                <div className="text-xs font-semibold opacity-70 mb-1">View</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={()=>{ setView('schedule'); setMenuOpen(false) }}
                    className={["h-9 rounded-lg border text-sm font-medium", view==='schedule' ? (dark?"bg-neutral-800 border-neutral-600":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700":"border-neutral-300 hover:bg-neutral-100")].join(' ')}
                    aria-label="Schedule"
                    title="Schedule"
                  >Schedule</button>
                  <button
                    onClick={()=>{ setView('manageV2'); setMenuOpen(false) }}
                    className={["h-9 rounded-lg border text-sm font-medium", view==='manageV2' ? (dark?"bg-neutral-800 border-neutral-600":"bg-white border-blue-600 text-blue-600") : (dark?"border-neutral-700":"border-neutral-300 hover:bg-neutral-100")].join(' ')}
                    aria-label="Manage"
                    title="Manage"
                  >Manage</button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-xs opacity-70">Timezone</span>
                  <div className="relative">
                    <svg aria-hidden className={["pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5", dark?"text-neutral-300":"text-neutral-600"].join(' ')} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M2 12h20"/>
                      <path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20"/>
                    </svg>
                    <select
                      className={["border rounded-lg pl-9 pr-2 h-9 text-sm appearance-none w-full", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                      value={tz.id}
                      onChange={e=>{ const opt = TZ_OPTS.find(x=>x.id===e.target.value); if(opt) setTz(opt); }}
                    >
                      {TZ_OPTS.map(o=>(<option key={o.id} value={o.id}>{tzAbbrev(o.id)}</option>))}
                    </select>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs opacity-70">Week start (Sun)</span>
                  <input
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
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs opacity-70">Theme</span>
                  <select
                    className={["border rounded-lg pl-3 pr-2 h-9 text-sm w-full appearance-none", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                    defaultValue={(()=>{ try{ const v = localStorage.getItem('schedule_theme'); return (v==='unicorn') ? 'system' : (v || 'system') }catch{ return 'system' }})()}
                    onChange={(e)=>{
                      const val = e.target.value as 'light'|'dark'|'system'|'night'|'noir'|'prism'
                      try{ localStorage.setItem('schedule_theme', val) }catch{}
                      window.dispatchEvent(new CustomEvent('schedule:set-theme', { detail: { value: val } }))
                    }}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="night">Night</option>
                    <option value="noir">Noir</option>
                    <option value="prism">Prism</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          {/* Timezone select with embedded icon (sm+ inline) */}
          <div className="hidden sm:block relative w-auto">
            <svg aria-hidden className={["pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5", dark?"text-neutral-300":"text-neutral-600"].join(' ')} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20"/>
              <path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20"/>
            </svg>
            <select
              aria-label="Timezone"
              title="Timezone"
              className={["border rounded-lg pl-9 pr-2 h-9 sm:h-10 text-sm appearance-none min-w-[4.5rem] w-auto", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
              value={tz.id}
              onChange={e=>{ const opt = TZ_OPTS.find(x=>x.id===e.target.value); if(opt) setTz(opt); }}
            >
              {TZ_OPTS.map(o=>(<option key={o.id} value={o.id}>{tzAbbrev(o.id)}</option>))}
            </select>
          </div>
      {/* Date picker (sm+ inline) */}
      <div className="hidden sm:block relative w-auto">
            <input
              aria-label="Week start (Sun)"
              title="Week start (Sun)"
        className={["border rounded-lg pl-3 pr-2 h-9 sm:h-10 text-sm w-auto min-w-[9.5rem]", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
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
          {/* Theme selector (sm+ inline) */}
          <div className="hidden sm:block [&>button]:h-9 sm:[&>button]:h-10">
            <ThemeSelector dark={dark} />
          </div>
          {/* Edit schedule toggle removed for schedule page per request */}
        </div>
      </div>
    </header>
    
    </>
  )
}
