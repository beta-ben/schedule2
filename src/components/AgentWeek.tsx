import React, { useMemo } from 'react'
import type { PTO, Shift } from '../types'
import { DAYS } from '../constants'
import { addDays, convertShiftsToTZ, fmtYMD, parseYMD, toMin, tzAbbrev } from '../lib/utils'

export default function AgentWeek({
  dark,
  tz,
  weekStart,
  agent,
  shifts,
  pto,
  onClear,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  agent: string
  shifts: Shift[]
  pto: PTO[]
  onClear?: ()=>void
}){
  const weekStartDate = parseYMD(weekStart)
  const days = useMemo(()=> Array.from({length:7}, (_,i)=>{
    const d = addDays(weekStartDate, i)
    return { key: DAYS[i], date: d, ymd: fmtYMD(d) }
  }),[weekStart])

  // Convert all shifts to viewer TZ, then filter by agent
  const tzShifts = useMemo(()=> convertShiftsToTZ(shifts, tz.offset), [shifts, tz.offset])
  const agentShifts = useMemo(()=> tzShifts.filter(s=>s.person===agent), [tzShifts, agent])

  // Group by day (Sun..Sat) preserving order, sort by start
  const byDay = useMemo(()=>{
    const m = new Map<string, { start:string; end:string }[]>()
    for(const d of DAYS){ m.set(d, []) }
    for(const s of agentShifts){
      const arr = m.get(s.day)!
      arr.push({ start: s.start, end: s.end })
    }
    for(const [k,arr] of m){ arr.sort((a,b)=> toMin(a.start)-toMin(b.start)) }
    return m
  },[agentShifts])

  const hasAny = Array.from(byDay.values()).some(v=>v.length>0)

  return (
    <section className={["rounded-2xl p-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold">Week: <span className="font-normal">{agent}</span></h2>
        <div className="flex items-center gap-2">
          <span className={["text-xs", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>{tzAbbrev(tz.id)}</span>
          {onClear && (
            <button onClick={onClear} className={["text-xs px-2 py-1 rounded border", dark?"border-neutral-700 text-neutral-200 hover:bg-neutral-800":"border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}>Clear</button>
          )}
        </div>
      </div>
      {!hasAny ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No shifts for this week.</div>
      ) : (
        <ul className="divide-y" style={{ borderColor: dark? '#3f3f46' : '#e5e7eb' }}>
          {days.map(d=>{
            const items = byDay.get(d.key) || []
            const ptoToday = pto.some(p=> p.person===agent && d.date>=parseYMD(p.startDate) && d.date<=parseYMD(p.endDate))
            return (
              <li key={d.key} className="flex items-start justify-between py-1.5">
                <div className={["w-16 shrink-0 pr-2 text-right text-sm font-medium", dark?"text-neutral-200":"text-neutral-800"].join(' ')}>{d.key}</div>
                <div className="flex-1 min-w-0">
                  {items.length===0 ? (
                    <span className={["text-sm", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((it,idx)=> (
                        <span key={idx} className={["px-2 py-0.5 rounded border text-xs", dark?"bg-neutral-800 border-neutral-700 text-neutral-200":"bg-neutral-50 border-neutral-300 text-neutral-800"].join(' ')}>
                          {it.start}–{it.end}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ml-2 w-20 text-right">
                  {ptoToday && (
                    <span className={["inline-block px-2 py-0.5 rounded text-[11px] border", dark?"bg-amber-900/40 text-amber-200 border-amber-700":"bg-amber-100 text-amber-700 border-amber-300"].join(' ')}>PTO</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
