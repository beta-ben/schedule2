import React, { useEffect, useMemo, useState } from 'react'
import { DAYS } from '../constants'
import DayGrid from '../components/DayGrid'
import { addDays, fmtNice, parseYMD, toMin, nowInTZ, shiftsForDayInTZ, mergeSegments, tzAbbrev } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'
import OnDeck from '../components/OnDeck'
import UpNext from '../components/UpNext'
import PostureToday from '../components/PostureToday'
import AgentWeek from '../components/AgentWeek'
import AgentWeekGrid from '../components/AgentWeekGrid'
// Legend removed from Schedule page

// Standalone ThemePicker component (tiny preview chips)
const THEME_KEYS = ['system','light','dark','night','noir','prism','subtle','spring','summer','autumn','winter'] as const
type ThemeKey = typeof THEME_KEYS[number]

function ThemePicker({ dark }: { dark: boolean }){
  const getStored = (): ThemeKey => {
    try {
      const v = (localStorage.getItem('schedule_theme') || 'system') as ThemeKey
      return (THEME_KEYS as readonly string[]).includes(v) ? v : 'system'
    } catch {
      return 'system'
    }
  }
  const [cur, setCur] = React.useState<ThemeKey>(() => getStored())
  useEffect(() => {
    const onEvt = (e: Event) => {
      const ce = e as CustomEvent
      const v = (ce.detail?.value || 'system') as ThemeKey
      setCur(v)
    }
    window.addEventListener('schedule:set-theme', onEvt as any)
    return () => window.removeEventListener('schedule:set-theme', onEvt as any)
  }, [])
  const setTheme = (v: ThemeKey) => {
    try { localStorage.setItem('schedule_theme', v) } catch {}
    setCur(v)
    window.dispatchEvent(new CustomEvent('schedule:set-theme', { detail: { value: v } }))
  }
  const swatch = (t: ThemeKey): React.CSSProperties => {
    const common = { borderRadius: 6, height: 16 } as const
    switch (t) {
      case 'system': return { ...common, background: 'linear-gradient(90deg, #e5e7eb, #93c5fd 70%)' }
      case 'light':  return { ...common, background: 'linear-gradient(90deg, #ffffff, #e5e7eb)' }
      case 'dark':   return { ...common, background: 'linear-gradient(90deg, #0f172a, #1f2937)' }
      case 'night':  return { ...common, background: '#000' }
      case 'noir':   return { ...common, background: 'linear-gradient(90deg, #000, #111)' }
      case 'prism':  return { ...common, background: 'linear-gradient(270deg, #ff0080, #ff8c00, #ffd300, #21d19f, #00c3ff, #7f00ff, #ff0080)', backgroundSize: '600% 100%', animation: 'unicornShift 8s linear infinite' }
  case 'subtle': return { ...common, background: 'linear-gradient(90deg, #f3f4f6, hsla(217,48%,60%,0.26))' }
      case 'spring': return { ...common, background: 'linear-gradient(90deg, #ecfdf5, #34d399)' }
  case 'summer': return { ...common, background: 'linear-gradient(90deg, #ecfeff, #06b6d4)' }
      case 'autumn': return { ...common, background: 'linear-gradient(90deg, #fffbeb, #f59e0b)' }
  case 'winter': return { ...common, background: 'linear-gradient(90deg, #e0e7ff, #6366f1)' }
    }
  }
  const opts: Array<{ id: ThemeKey; label: string }> = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'subtle', label: 'Subtle' },
    { id: 'spring', label: 'Spring' },
    { id: 'summer', label: 'Summer' },
    { id: 'autumn', label: 'Autumn' },
    { id: 'winter', label: 'Winter' },
    { id: 'night', label: 'Night' },
    { id: 'noir', label: 'Noir' },
    { id: 'prism', label: 'Prism' },
  ]
  return (
    <div className="py-1">
      <div className="text-sm mb-1">Theme</div>
      <div className="grid grid-cols-3 gap-2">
        {opts.map(o => (
          <button key={o.id}
            onClick={() => setTheme(o.id)}
            className={[
              'flex flex-col items-center justify-start gap-1 border rounded-md px-2 py-2 text-xs',
              (cur === o.id ? (dark ? 'border-neutral-400' : 'border-blue-500') : (dark ? 'border-neutral-700' : 'border-neutral-300')),
              dark ? 'bg-neutral-900 text-neutral-100' : 'bg-white text-neutral-900'
            ].join(' ')}
            aria-pressed={cur === o.id}
            title={o.label}
          >
            <span className="inline-block w-full" style={swatch(o.id)} />
            <span className="leading-tight text-[11px]">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SchedulePage({ dark, weekStart, dayIndex, setDayIndex, shifts, pto, tasks, calendarSegs, tz, canEdit, editMode, onRemoveShift, agents, slimline }:{ 
  dark: boolean
  weekStart: string
  dayIndex: number
  setDayIndex: (i:number)=>void
  shifts: Shift[]
  pto: PTO[]
  tasks: Task[]
  calendarSegs: CalendarSegment[]
  tz: { id:string; label:string; offset:number }
  canEdit: boolean
  editMode: boolean
  onRemoveShift: (id:string)=>void
  // Optional: agent roster for id->name mapping in week grid
  agents?: Array<{ id?: string; firstName?: string; lastName?: string; hidden?: boolean }>
  slimline?: boolean
}){
  const today = new Date()
  const weekStartDate = parseYMD(weekStart)
  const selectedDate = addDays(weekStartDate, dayIndex)
  const dayKey = DAYS[dayIndex]
  const hiddenNames = useMemo(()=>{
    const set = new Set<string>()
    for(const a of (agents||[])){
      const full = [a.firstName||'', a.lastName||''].filter(Boolean).join(' ').trim()
      if(full && a.hidden){ set.add(full) }
    }
    return set
  }, [agents])
  const dayShifts = useMemo(()=>{
    const baseAll = shiftsForDayInTZ(shifts, dayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
    const base = baseAll
    const filtered = base.filter(s=> !hiddenNames.has(s.person))
    // Merge calendar segments into each shift for display
    return filtered.map(s=>{
      const cal = calendarSegs
        .filter(cs=> cs.day===dayKey && (((s as any).agentId && cs.agentId=== (s as any).agentId) || cs.person===s.person))
        .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
      const segments = mergeSegments(s, cal)
      return segments && segments.length>0 ? { ...s, segments } : s
    })
  },[shifts,dayKey,tz.offset,calendarSegs, hiddenNames])
  const people = useMemo(()=>Array.from(new Set(dayShifts.map(s=>s.person))),[dayShifts])
  const allPeople = useMemo(()=>{
    const names = Array.from(new Set(shifts.map(s=>s.person))).sort()
    return names.filter(n=> !hiddenNames.has(n))
  },[shifts, hiddenNames])
  const [agentView, setAgentView] = useState<string>('')
  const [showViewOpts, setShowViewOpts] = useState(false)
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const agentMenuRef = React.useRef<HTMLDivElement|null>(null)
  // Close the small panes on outside click / Escape
  const viewOptsRef = React.useRef<HTMLDivElement|null>(null)
  useEffect(()=>{
    if(!(showViewOpts || showAgentMenu)) return
    const onDocClick = (e: MouseEvent)=>{
      const t = e.target as Node
      if(viewOptsRef.current && !viewOptsRef.current.contains(t)) setShowViewOpts(false)
      if(agentMenuRef.current && !agentMenuRef.current.contains(t)) setShowAgentMenu(false)
    }
    const onKey = (e: KeyboardEvent)=>{ if(e.key === 'Escape') setShowViewOpts(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return ()=> { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  },[showViewOpts, showAgentMenu])
  // Close when switching agent/day
  useEffect(()=>{ setShowViewOpts(false); setShowAgentMenu(false) }, [agentView, dayIndex])

  // Panels tied to "now": always use today's shifts regardless of selected tab
  const nowTz = nowInTZ(tz.id)
  const todayKey = nowTz.weekdayShort as (typeof DAYS)[number]
  const todayShifts = useMemo(()=>{
    const baseAll = shiftsForDayInTZ(shifts, todayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
    const filtered = baseAll.filter(s=> !hiddenNames.has(s.person))
    return filtered.map(s=>{
      const cal = calendarSegs
        .filter(cs=> cs.day===todayKey && (((s as any).agentId && cs.agentId=== (s as any).agentId) || cs.person===s.person))
        .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
      const segments = mergeSegments(s, cal)
      return segments && segments.length>0 ? { ...s, segments } : s
    })
  },[shifts,todayKey,tz.offset,calendarSegs, hiddenNames])

  // Live clock in selected timezone (12-hour + meridiem)
  const [nowClock, setNowClock] = useState(()=>{
    const n = nowInTZ(tz.id)
    const h12 = ((n.h % 12) || 12)
    const hh = String(h12) // no leading zero for hour
    const mm = String(n.m).padStart(2,'0')
    const ampm = n.h >= 12 ? 'PM' : 'AM'
    return { text: `${hh}:${mm} ${ampm}` }
  })
  useEffect(()=>{
    let to: number | undefined
    let iv: number | undefined
    const tick = ()=>{
      const n = nowInTZ(tz.id)
  const h12 = ((n.h % 12) || 12)
  const hh = String(h12)
  const mm = String(n.m).padStart(2,'0')
  const ampm = n.h >= 12 ? 'PM' : 'AM'
  setNowClock({ text: `${hh}:${mm} ${ampm}` })
    }
    const schedule = ()=>{
      if(iv) { clearInterval(iv) }
      if(to) { clearTimeout(to) }
      const now = Date.now()
      const msToNextMinute = 60000 - (now % 60000)
      to = window.setTimeout(()=>{
        tick()
        iv = window.setInterval(tick, 60000)
      }, msToNextMinute)
    }
    const onVis = ()=>{ if(document.visibilityState==='visible'){ tick(); schedule() } }
    tick()
    schedule()
    document.addEventListener('visibilitychange', onVis)
    return ()=>{ if(iv) clearInterval(iv); if(to) clearTimeout(to); document.removeEventListener('visibilitychange', onVis) }
  }, [tz.id])

  // Simple day number (no ordinal suffix)
  function dayNumber(d: Date){
    return d.getDate()
  }

  return (
    <section className={["rounded-2xl p-2 prism-surface-1", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      {/* Header row with date+clock on the left and controls on the right; wraps nicely on mobile */}
      <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
        {/* Left: date + tz */}
        <div className="flex items-end gap-3 pl-2 order-1">
          <div className={dark?"text-neutral-600":"text-neutral-600"} style={{ fontSize: '1.5rem', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {selectedDate.toLocaleDateString(undefined, { month: 'short' })} {dayNumber(selectedDate)}
          </div>
          <div className="flex flex-col items-start leading-tight text-left">
            <div className={["uppercase tracking-wide", dark?"text-neutral-400":"text-neutral-500"].join(' ')} style={{ fontSize: '0.72rem', lineHeight: 1 }}>
              {tzAbbrev(tz.id)}
            </div>
          </div>
        </div>
        {/* Right (on narrow): live clock */}
        <div className="order-2 ml-auto mr-2">
          <div className={["font-bold tabular-nums text-right", dark?"text-neutral-300":"text-neutral-700"].join(' ')} style={{ fontSize: '1.6rem', lineHeight: 1 }}>
            {nowClock.text}
          </div>
        </div>
        {/* Middle: agent week title (only in agent view) */}
        {agentView && (
          <div className="pl-2 font-semibold text-xl sm:text-2xl order-3 sm:order-2">
            {agentView} <span className="opacity-70">Week of {fmtNice(weekStartDate)}</span>
          </div>
        )}

        {/* Right: agent picker button, day selector, settings */}
        <div className="flex items-center gap-2 order-2 sm:order-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Agent picker: compact button that opens a menu */}
          <div className="relative" ref={agentMenuRef}>
            <button
              aria-label="Choose agent"
              title={agentView ? `Agent: ${agentView}` : 'Choose agent'}
              onClick={()=> setShowAgentMenu(v=>!v)}
              className={["inline-flex items-center justify-center h-8 sm:h-9 w-9 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
            >
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </button>
            {showAgentMenu && (
              <div className={["absolute right-0 mt-2 w-56 sm:w-64 max-w-[calc(100vw-2rem)] sm:max-w-none rounded-xl p-2 border shadow-lg z-50 max-h-[18rem] overflow-auto", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-900"].join(' ')}>
                <div className="text-xs font-medium px-2 pb-1">Agents</div>
                <button onClick={()=>{ setAgentView(''); setShowAgentMenu(false) }} className={["w-full text-left px-2 py-1 rounded text-sm", dark?"hover:bg-neutral-800":"hover:bg-neutral-100"].join(' ')}>All</button>
                {allPeople.map(p=> (
                  <button key={p} onClick={()=>{ setAgentView(p); setShowAgentMenu(false) }} className={["w-full text-left px-2 py-1 rounded text-sm", p===agentView ? (dark?"bg-neutral-800":"bg-neutral-100") : (dark?"hover:bg-neutral-800":"hover:bg-neutral-100")].join(' ')}>{p}</button>
                ))}
              </div>
            )}
          </div>

          {!agentView && (
            <div className="overflow-x-auto no-scrollbar max-w-full">
              <div className="inline-flex gap-1.5 sm:gap-2 whitespace-nowrap pr-1">
              {DAYS.map((d,i)=> {
                const isToday = d === todayKey
                const base = "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs sm:text-sm border"
                const stateCls = i===dayIndex
                  ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white")
                  : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")
                const todayCls = isToday ? (dark?"text-red-400":"text-red-600") : ""
                return (
                  <button key={d} onClick={()=>setDayIndex(i)} className={[base, stateCls, todayCls].filter(Boolean).join(' ')}>{d}</button>
                )
              })}
              </div>
            </div>
          )}

          {/* Schedule-only settings (small pane under button) */}
          {!agentView && (
            <div className="relative" ref={viewOptsRef}>
              <button
                aria-label="View options"
                title="View options"
                onClick={()=> setShowViewOpts(v=>!v)}
                className={["inline-flex items-center justify-center h-8 sm:h-9 w-9 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0A1.65 1.65 0 0 0 20.91 11H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
                </svg>
              </button>
              {showViewOpts && (
                <div className={["absolute right-0 mt-2 w-64 sm:w-72 max-w-[calc(100vw-2rem)] sm:max-w-none rounded-xl p-3 border shadow-lg z-50", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-900"].join(' ')}>
                  <div className="text-sm font-semibold mb-2">Schedule settings</div>
                  {/* Slimline switch */}
                  <div className="flex items-center justify-between gap-3 text-sm py-1">
                    <span className="flex-1">Hide off-duty agents</span>
                    <button
                      role="switch"
                      aria-checked={!!slimline}
                      onClick={()=>{
                        const val = !slimline
                        try{ localStorage.setItem('schedule_slimline',''+(val?'1':'0')) }catch{}
                        window.dispatchEvent(new CustomEvent('schedule:set-slimline', { detail: { value: val } }))
                      }}
                      className={["w-12 h-6 rounded-full border relative transition", dark?"bg-neutral-800 border-neutral-700":"bg-white border-neutral-300"].join(' ')}
                      aria-label="Toggle slimline"
                    >
                      <span className={["absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-sm flex items-center justify-center transition-transform", (!!slimline ? 'translate-x-6' : 'translate-x-0'), dark?"bg-neutral-700 text-neutral-200":"bg-neutral-100 text-neutral-700"].join(' ')}>
                        {/* dot */}
                      </span>
                    </button>
                  </div>

                  <ThemePicker dark={dark} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  {!agentView && (
  <>
  <div className="pl-1">
  {(()=>{
    // Prepare filtered inputs for DayGrid depending on slimline
    const forToday = fmtNice(selectedDate) === fmtNice(parseYMD(nowInTZ(tz.id).ymd))
  const filteredShifts = (!slimline || !forToday) ? dayShifts : (()=>{
      const now = nowInTZ(tz.id)
      const nowAbs = (DAYS.indexOf(dayKey as any))*1440 + now.minutes
      const ymdNow = now.ymd
      return dayShifts.filter(s=>{
        // Hide PTO entirely for today using TZ-based YMD (matches OnDeck logic)
        const hasPto = pto.some(p=> p.person===s.person && p.startDate <= ymdNow && ymdNow <= p.endDate)
        if(hasPto) return false
    // Keep only active and on-deck (within next 2 hours), and hide chips >30m past end
        const sd = DAYS.indexOf(s.day as any)
        const ed = DAYS.indexOf(((s as any).endDay || s.day) as any)
    const sAbs = (sd<0?0:sd)*1440 + toMin(s.start)
        let eAbs = (ed<0?sd:ed)*1440 + (s.end==='24:00'?1440:toMin(s.end))
        if(eAbs <= sAbs) eAbs += 1440
    const isActive = nowAbs >= sAbs && nowAbs < eAbs
    const isOnDeck = sAbs > nowAbs && sAbs <= (nowAbs + 120)
    if(!(isActive || isOnDeck)) return false
    // Also, if already ended more than 30 minutes ago, hide
    return nowAbs <= (eAbs + 30)
      })
    })()
  const filteredPeople = Array.from(new Set(filteredShifts.map(s=> s.person)))
    return (
      <DayGrid
        date={selectedDate}
        dayKey={dayKey}
        people={(!slimline || !forToday) ? people : filteredPeople}
        shifts={filteredShifts}
        pto={(slimline && forToday) ? [] : pto}
        dark={dark}
        tz={tz}
        canEdit={canEdit}
        editMode={editMode}
        showHeaderTitle={false}
        tasks={tasks as any}
  agents={agents as any}
        onRemove={(id)=>{
          if (!canEdit) { alert('Enter the password in Manage to enable editing.'); return }
          onRemoveShift(id)
        }}
      />
    )
  })()}
  </div>
  <div className="pl-1 mt-2">
  {/* Legend removed */}
  </div>
  </>
  )}

      {/* Below main section: two-column area for extra features */}
  {!agentView ? (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
  <OnDeck dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} pto={pto} />
      </div>
      <div className="flex flex-col gap-3">
  <UpNext dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} pto={pto} />
        <PostureToday dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} tasks={tasks} />
      </div>
    </div>
  ) : (
    <div className="mt-4">
      <AgentWeekGrid
        dark={dark}
        tz={tz}
        weekStart={weekStart}
        agent={agentView}
        shifts={shifts}
        pto={pto}
  tasks={tasks}
  calendarSegs={calendarSegs}
  agents={agents || []}
      />
  {/* Legend removed */}
    </div>
  )}

  {/* Clear moved to header when agentView */}
    </section>
  )
}
