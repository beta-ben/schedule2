import React, { useEffect, useMemo, useState } from 'react'
import { DAYS } from '../constants'
import DayGrid from '../components/DayGrid'
import { addDays, fmtNice, parseYMD, toMin, nowInTZ, shiftsForDayInTZ, mergeSegments } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'
import OnDeck from '../components/OnDeck'
import UpNext from '../components/UpNext'
import AgentWeek from '../components/AgentWeek'
import AgentWeekGrid from '../components/AgentWeekGrid'
import Legend from '../components/Legend'

export default function SchedulePage({ dark, weekStart, dayIndex, setDayIndex, shifts, pto, tasks, calendarSegs, tz, canEdit, editMode, onRemoveShift }:{ 
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
}){
  const today = new Date()
  const weekStartDate = parseYMD(weekStart)
  const selectedDate = addDays(weekStartDate, dayIndex)
  const dayKey = DAYS[dayIndex]
  const dayShifts = useMemo(()=>{
    const base = shiftsForDayInTZ(shifts, dayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
    // Merge calendar segments into each shift for display
    return base.map(s=>{
      const cal = calendarSegs
        .filter(cs=> cs.person===s.person && cs.day===dayKey)
        .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
      const segments = mergeSegments(s, cal)
      return segments && segments.length>0 ? { ...s, segments } : s
    })
  },[shifts,dayKey,tz.offset,calendarSegs])
  const people = useMemo(()=>Array.from(new Set(dayShifts.map(s=>s.person))),[dayShifts])
  const allPeople = useMemo(()=>Array.from(new Set(shifts.map(s=>s.person))).sort(),[shifts])
  const [agentView, setAgentView] = useState<string>('')

  // Panels tied to "now": always use today's shifts regardless of selected tab
  const nowTz = nowInTZ(tz.id)
  const todayKey = nowTz.weekdayShort as (typeof DAYS)[number]
  const todayShifts = useMemo(()=>{
    const base = shiftsForDayInTZ(shifts, todayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
    return base.map(s=>{
      const cal = calendarSegs
        .filter(cs=> cs.person===s.person && cs.day===todayKey)
        .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
      const segments = mergeSegments(s, cal)
      return segments && segments.length>0 ? { ...s, segments } : s
    })
  },[shifts,todayKey,tz.offset,calendarSegs])

  // Live clock (HH:MM) in selected timezone
  const [nowHHMM, setNowHHMM] = useState(()=>{
    const n = nowInTZ(tz.id); return `${String(n.h).padStart(2,'0')}:${String(n.m).padStart(2,'0')}`
  })
  useEffect(()=>{
    function tick(){ const n = nowInTZ(tz.id); setNowHHMM(`${String(n.h).padStart(2,'0')}:${String(n.m).padStart(2,'0')}`) }
    tick()
    const id = setInterval(tick, 1000 * 15) // update every 15s
    return ()=> clearInterval(id)
  }, [tz.id])

  // Simple day number (no ordinal suffix)
  function dayNumber(d: Date){
    return d.getDate()
  }

  return (
    <section className={["rounded-2xl p-2", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      {/* Row with selected day label on left, live clock in the middle, and controls on the right */}
      <div className="flex items-center justify-between mb-0 gap-2">
        {!agentView ? (
          <div className="pl-2 font-semibold">
            {/* Centered day number, very subtle color, large size; baseline lowered to align with hour labels */}
            <div className={dark?"text-neutral-600":"text-neutral-600"} style={{ fontSize: '3rem', lineHeight: 1, textAlign: 'center', position: 'relative' }}>
              {dayNumber(selectedDate)}
            </div>
          </div>
        ) : (
          <div className="pl-2 font-semibold text-xl sm:text-2xl">
            {agentView} <span className="opacity-70">Week of {fmtNice(weekStartDate)}</span>
          </div>
        )}

        {/* Middle: live HH:MM clock in selected timezone */}
        <div className="flex-1 min-w-[6rem]" />
        <div className="min-w-[6rem] text-right pr-3">
          <div className={["font-bold", dark?"text-neutral-300":"text-neutral-700"].join(' ')} style={{ fontSize: '1.5rem', lineHeight: 1 }}>
            {nowHHMM}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Agent weekly view selector */}
          <div className="flex items-center gap-2">
            <label className={["text-sm", dark?"text-neutral-300":"text-neutral-700"].join(' ')}>Agent:</label>
            <select
              className={["text-sm px-2 py-1 rounded border", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
              value={agentView}
              onChange={(e)=>setAgentView(e.target.value)}
            >
              <option value="">—</option>
              {allPeople.map(p=> (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {agentView && (
              <button onClick={()=>setAgentView('')} className={["text-xs px-2 py-1 rounded border", dark?"border-neutral-700 text-neutral-200 hover:bg-neutral-800":"border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}>Clear</button>
            )}
          </div>

          {!agentView && (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
          )}
        </div>
      </div>
  {!agentView && (
  <>
  <div className="pl-1">
  <DayGrid
        date={selectedDate}
        dayKey={dayKey}
        people={people}
        shifts={dayShifts}
        pto={pto}
        dark={dark}
        tz={tz}
        canEdit={canEdit}
        editMode={editMode}
        showHeaderTitle={false}
        tasks={tasks as any}
        onRemove={(id)=>{
          if (!canEdit) { alert('Enter the password in Manage to enable editing.'); return }
          onRemoveShift(id)
        }}
      />
  </div>
  <div className="pl-1 mt-2">
    <Legend tasks={tasks} dark={dark} />
  </div>
  </>
  )}

      {/* Below main section: two-column area for extra features */}
  {!agentView ? (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      <OnDeck dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} />
      <UpNext dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} />
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
      />
      <div className="mt-2">
        <Legend tasks={tasks} dark={dark} />
      </div>
    </div>
  )}

  {/* Clear moved to header when agentView */}
    </section>
  )
}
