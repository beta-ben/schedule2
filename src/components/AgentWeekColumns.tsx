import React, { useMemo } from 'react'
import { DAYS } from '../constants'
import { addDays, convertShiftsToTZ, fmtYMD, mergeSegments, nowInTZ, parseYMD, toMin } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

export default function AgentWeekColumns({
  dark,
  tz,
  weekStart,
  agent,
  shifts,
  pto,
  tasks,
  calendarSegs,
  agents,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  agent: string
  shifts: Shift[]
  pto: PTO[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
  agents?: Array<{ id?: string; firstName?: string; lastName?: string }>
}){
  const totalMins = 24*60
  const weekStartDate = parseYMD(weekStart)
  const days = useMemo(()=> Array.from({length:7}, (_,i)=>{
    const d = addDays(weekStartDate, i)
    return { key: DAYS[i], date: d, ymd: fmtYMD(d) }
  }),[weekStart])

  const tzShifts = useMemo(()=> convertShiftsToTZ(shifts, tz.offset).filter(s=>s.person===agent), [shifts, tz.offset, agent])
  const byDay = useMemo(()=>{
    const m = new Map<string, Shift[]>()
    for(const d of DAYS){ m.set(d, []) }
    for(const s of tzShifts){ m.get(s.day)!.push(s) }
    for(const [k,arr] of m){ arr.sort((a,b)=> toMin(a.start)-toMin(b.start)) }
    return m
  },[tzShifts])

  const HOUR_H = 26 // px per hour
  const GRID_H = HOUR_H * 24
  const labelColPx = 44
  const textSub = dark? 'text-neutral-400' : 'text-neutral-500'
  const hourLabelEvery = 2 // reduce label noise: every 2 hours

  const now = nowInTZ(tz.id)
  const nowTop = (now.minutes/totalMins)*100

  const taskMap = useMemo(()=>{ const m=new Map<string,Task>(); for(const t of (tasks||[])) m.set(t.id,t); return m },[tasks])

  return (
    <div className="w-full">
      {/* Header: day labels */}
      <div className="grid" style={{ gridTemplateColumns: `${labelColPx}px repeat(7, minmax(0,1fr))` }}>
        <div />
        {days.map(d=> (
          <div key={d.key} className={["px-1 py-1 text-center font-medium sticky top-0 z-10", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
            <div className="text-xs">{d.key}</div>
            <div className={["text-[11px]", textSub].join(' ')}>{d.ymd}</div>
          </div>
        ))}
      </div>

      {/* Body grid */}
      <div className="relative">
        {/* Hour rows background and labels */}
        <div className="grid" style={{ gridTemplateColumns: `${labelColPx}px repeat(7, minmax(0,1fr))` }}>
          {/* Hour labels */}
          <div className="relative" style={{ height: GRID_H }}>
            {Array.from({length:25},(_,i)=>i).map(h=>{
              const top = (h/24)*100
              const show = h % hourLabelEvery === 0
              return (
                <div key={h} className="absolute left-0 right-0" style={{ top: `calc(${top}% - 0.5px)` }}>
                  {show && (
                    <div className={["text-[11px] pr-1 text-right opacity-70", textSub].join(' ')}>{h===0? '12a' : h<12? `${h}a` : h===12? '12p' : `${h-12}p`}</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Day columns */}
          {days.map(d=>{
            const shiftsForDay = (byDay.get(d.key) || [])
            const ptoToday = pto.some(p=> p.person===agent && d.date>=parseYMD(p.startDate) && d.date<=parseYMD(p.endDate))
            return (
              <div key={d.key} className={["relative", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')} style={{ height: GRID_H }}>
                {/* Hour lines */}
                {Array.from({length:24},(_,i)=>i).map(h=>{
                  const top = ((h+0)/24)*100
                  const color = dark? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
                  return <div key={h} className="absolute left-0 right-0" style={{ top: `${top}%`, height: 1, background: color }} />
                })}
                {/* Now line (only on today) */}
                {d.key===now.weekdayShort && (
                  <div className={["absolute left-0 right-0", dark?"bg-red-400":"bg-red-500"].join(' ')} style={{ top: `${nowTop}%`, height: 1 }} />
                )}
                {/* PTO day tint */}
                {ptoToday && (
                  <div className="absolute inset-0 pointer-events-none" style={{ background: dark? 'rgba(240,200,0,0.06)' : 'rgba(240,200,0,0.10)' }} />
                )}
                {/* Shifts (vertical blocks) */}
                {shiftsForDay.map(s=>{
                  const sMin = toMin(s.start)
                  const eMinRaw = toMin(s.end)
                  const eMin = eMinRaw > sMin ? eMinRaw : 1440
                  const topPct = (sMin/totalMins)*100
                  const hPct = ((eMin - sMin)/totalMins)*100
                  const border = dark? '#52525b' : '#94a3b8'
                  const bg = dark? 'rgba(99,102,241,0.28)' : 'rgba(59,130,246,0.25)'

                  // Segments overlay if provided
                  const cal = (calendarSegs||[])
                    .filter(cs=> cs.day===d.key && ((((s as any).agentId) && cs.agentId === (s as any).agentId) || cs.person===agent))
                    .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
                  const merged: any = mergeSegments(s as any, cal)
                  const segs: Array<{ startOffsetMin:number; durationMin:number; taskId:string; id?:string }> = Array.isArray(merged)? merged as any : []

                  return (
                    <div key={`${s.person}-${s.day}-${s.start}-${s.end}`} className="absolute left-1 right-1 rounded" style={{ top: `${topPct}%`, height: `${hPct}%`, background: bg, boxShadow:`inset 0 0 0 1px ${border}` }} title={`${s.start}–${s.end}`}>
                      {/* Label in middle */}
                      <div className={["absolute left-0 right-0 text-center text-[11px]", dark?"text-neutral-200":"text-neutral-800"].join(' ')} style={{ top: '50%', transform: 'translateY(-50%)' }}>
                        {s.start}–{s.end}
                      </div>
                      {/* Task overlays */}
                      {segs.map(seg=>{
                        const st = Math.max(0, Math.min(eMin - sMin, seg.startOffsetMin))
                        const en = Math.max(0, Math.min(eMin - sMin, seg.startOffsetMin + seg.durationMin))
                        if(en <= st) return null
                        const top = ((sMin + st)/totalMins)*100
                        const h = ((en - st)/totalMins)*100
                        const t = taskMap.get(seg.taskId)
                        const color = t?.color || '#3b82f6'
                        const stripes = `repeating-linear-gradient(90deg, color-mix(in oklab, ${color} 40%, ${dark?'#0a0a0a':'#ffffff'} 60%) 0 6px, transparent 6px 14px)`
                        return <div key={`${seg.taskId}-${st}`} className="absolute left-0 right-0" style={{ top: `${top}%`, height: `${h}%`, backgroundImage: stripes, opacity: 0.45, borderRadius: 6 }} title={t?.name} />
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
