import React, { useEffect, useMemo, useState } from 'react'
import { DAYS } from '../constants'
import DayGrid from '../components/DayGrid'
import { addDays, fmtNice, parseYMD, toMin, nowInTZ, shiftsForDayInTZ, mergeSegments, tzAbbrev, applyOverrides, expandCalendarSegments, CalendarSegmentSlice } from '../lib/utils'
import type { PTO, Shift, Task, Override } from '../types'
import type { CalendarSegment } from '../lib/utils'
import OnDeck from '../components/OnDeck'
import UpNext from '../components/UpNext'
import PostureToday from '../components/PostureToday'
import AgentWeekGrid from '../components/AgentWeekGrid'
// Legend removed from Schedule page

export default function SchedulePage({ dark, weekStart, dayIndex, setDayIndex, shifts, pto, overrides, tasks, calendarSegs, tz, canEdit, editMode, onRemoveShift, agents, slimline }:{ 
  dark: boolean
  weekStart: string
  dayIndex: number
  setDayIndex: (i:number)=>void
  shifts: Shift[]
  pto: PTO[]
  overrides?: Override[]
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
  // Apply overrides for the visible week so the schedule reflects them
  const effectiveShifts = React.useMemo(()=> applyOverrides(shifts, overrides||[], weekStart, agents||[]), [shifts, overrides, weekStart, agents])
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
  const calendarSegmentsByDay = useMemo(() => {
    const map = new Map<(typeof DAYS)[number], CalendarSegmentSlice[]>()
    for (const d of DAYS) {
      map.set(d, [])
    }
    for (const seg of expandCalendarSegments(calendarSegs, tz.offset)) {
      const bucket = map.get(seg.day)
      if (!bucket) continue
      bucket.push(seg)
    }
    return map
  }, [calendarSegs, tz.offset])

  const dayShifts = useMemo(()=>{
    const baseAll = shiftsForDayInTZ(effectiveShifts, dayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
    const base = baseAll
    const filtered = base.filter(s=> !hiddenNames.has(s.person))
    const dayCalSegs = calendarSegmentsByDay.get(dayKey as (typeof DAYS)[number]) || []
    // Merge calendar segments into each shift for display
    return filtered.map(s=>{
      const cal = dayCalSegs
        .filter(cs=> (((s as any).agentId && cs.agentId=== (s as any).agentId) || cs.person===s.person))
        .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
      const segments = mergeSegments(s, cal)
      return segments && segments.length>0 ? { ...s, segments } : s
    })
  },[effectiveShifts,dayKey,tz.offset,calendarSegmentsByDay, hiddenNames])
  const people = useMemo(()=>Array.from(new Set(dayShifts.map(s=>s.person))),[dayShifts])
  const allPeople = useMemo(()=>{
    const names = Array.from(new Set(effectiveShifts.map(s=>s.person))).sort()
    return names.filter(n=> !hiddenNames.has(n))
  },[effectiveShifts, hiddenNames])
  const [agentView, setAgentView] = useState<string>('')
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const agentMenuRef = React.useRef<HTMLDivElement|null>(null)
  // Close the small panes on outside click / Escape
  useEffect(()=>{
    if(!showAgentMenu) return
    const onDocClick = (e: MouseEvent)=>{
      const t = e.target as Node
      if(agentMenuRef.current && !agentMenuRef.current.contains(t)) setShowAgentMenu(false)
    }
    const onKey = (e: KeyboardEvent)=>{ if(e.key === 'Escape') setShowAgentMenu(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return ()=> { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  },[showAgentMenu])
  // Close when switching agent/day
  useEffect(()=>{ setShowAgentMenu(false) }, [agentView, dayIndex])

  // (no secondary view state)

  // Panels tied to "now": always use today's shifts regardless of selected tab
  const nowTz = nowInTZ(tz.id)
  const todayKey = nowTz.weekdayShort as (typeof DAYS)[number]
  const todayShifts = useMemo(()=>{
    const baseAll = shiftsForDayInTZ(effectiveShifts, todayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
    const filtered = baseAll.filter(s=> !hiddenNames.has(s.person))
    const todayCalSegs = calendarSegmentsByDay.get(todayKey as (typeof DAYS)[number]) || []
    return filtered.map(s=>{
      const cal = todayCalSegs
        .filter(cs=> (((s as any).agentId && cs.agentId=== (s as any).agentId) || cs.person===s.person))
        .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
      const segments = mergeSegments(s, cal)
      return segments && segments.length>0 ? { ...s, segments } : s
    })
  },[effectiveShifts,todayKey,tz.offset,calendarSegmentsByDay, hiddenNames])

  // Live clock in selected timezone (12-hour + meridiem)
  const [nowClock, setNowClock] = useState(()=>{
    const n = nowInTZ(tz.id)
    const h12 = ((n.h % 12) || 12)
    const hhmm = `${String(h12).padStart(2,'0')}:${String(n.m).padStart(2,'0')}`
    const ampm = n.h >= 12 ? 'PM' : 'AM'
    return { hhmm, ampm }
  })
  useEffect(()=>{
    let to: number | undefined
    let iv: number | undefined
    const tick = ()=>{
      const n = nowInTZ(tz.id)
      const h12 = ((n.h % 12) || 12)
      const hhmm = `${String(h12).padStart(2,'0')}:${String(n.m).padStart(2,'0')}`
      const ampm = n.h >= 12 ? 'PM' : 'AM'
      setNowClock({ hhmm, ampm })
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
    <section className={["rounded-2xl p-2 prism-surface-1 prism-cycle-1", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      {/* Header row with date+clock on the left and controls on the right; wraps nicely on mobile */}
      <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
        {/* Left: date (always) + live clock + tz */}
  <div className="flex items-baseline gap-2 sm:gap-3 pl-2 order-1">
          <div className={[dark?"text-neutral-600":"text-neutral-600","leading-none","text-[1.3rem] sm:text-[1.5rem]"].join(' ')} style={{ whiteSpace: 'nowrap' }}>
            {selectedDate.toLocaleDateString(undefined, { month: 'short' })} {dayNumber(selectedDate)}
          </div>
          <div key={nowClock.hhmm} className={["font-bold tabular-nums now-pop leading-none","text-[1.45rem] sm:text-[1.6rem]", dark?"text-neutral-300":"text-neutral-700"].join(' ')}>
            {nowClock.hhmm}
          </div>
          <div className="flex items-baseline gap-1 leading-none">
            <span className={["uppercase tracking-wide", dark?"text-neutral-400":"text-neutral-500"].join(' ')} style={{ fontSize: '0.72rem', lineHeight: 1 }}>
              {nowClock.ampm}
            </span>
            <span className={["uppercase tracking-wide", dark?"text-neutral-500":"text-neutral-500"].join(' ')} style={{ fontSize: '0.72rem', lineHeight: 1 }}>
              {tzAbbrev(tz.id)}
            </span>
          </div>
        </div>
        {/* Middle: agent week title (only in agent view) */}
        {agentView && (
          <div className="pl-2 font-semibold text-xl sm:text-2xl order-3 sm:order-2">
            {agentView} <span className="opacity-70">Week of {fmtNice(weekStartDate)}</span>
          </div>
        )}

        {/* Right: day selector, then agent picker, then eye toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 order-2 sm:order-3 w-full sm:w-auto justify-start sm:justify-end">
          {!agentView && (
            <div className="overflow-x-auto no-scrollbar max-w-full">
              <div className="inline-flex gap-1.5 sm:gap-2 whitespace-nowrap pr-0.5 sm:pr-1">
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

          {/* Eye toggle: hide/show off-duty agents (replaces settings) */}
          {!agentView && (
            <button
              aria-label={slimline ? 'Show off-duty agents' : 'Hide off-duty agents'}
              title={slimline ? 'Show off-duty agents' : 'Hide off-duty agents'}
              onClick={()=>{
                const val = !slimline
                try{ localStorage.setItem('schedule_slimline',''+(val?'1':'0')) }catch{}
                window.dispatchEvent(new CustomEvent('schedule:set-slimline', { detail: { value: val } }))
              }}
              aria-pressed={!!slimline}
              className={["inline-flex items-center justify-center h-8 sm:h-9 w-9 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
            >
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {slimline ? (
                  <>
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94"/>
                    <path d="M1 1l22 22"/>
                    <path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-5.12"/>
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </>
                )}
              </svg>
            </button>
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
      <div className="flex flex-col gap-3">
        <OnDeck dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} pto={pto} />
        <UpNext dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} pto={pto} />
      </div>
      <div>
        <PostureToday
          dark={dark}
          tz={tz}
          dayKey={todayKey}
          shifts={todayShifts}
          tasks={tasks}
          calendarSegs={calendarSegmentsByDay.get(todayKey as (typeof DAYS)[number]) || []}
          agents={agents || []}
        />
      </div>
    </div>
  ) : (
    <div className="mt-4">
      <AgentWeekGrid
        dark={dark}
        tz={tz}
        weekStart={weekStart}
        agent={agentView}
        shifts={effectiveShifts}
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
