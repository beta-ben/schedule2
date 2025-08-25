import React, { useMemo } from 'react'
import type { Shift } from '../types'
import { minToHHMM, toMin } from '../lib/utils'

export default function UpNext({ dark, tz, dayKey, shifts, windowMin=120 }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
  windowMin?: number
}){
  const now = new Date()
  const nowMin = ((now.getHours()*60 + now.getMinutes()) + tz.offset*60 + 1440) % 1440
  const cutoff = nowMin + windowMin

  const upcoming = useMemo(()=>{
    // Consider shifts that start after now and within the window
    const candidates = shifts.filter(s=>{
      const sMin = toMin(s.start)
      return sMin > nowMin && sMin <= cutoff
    })
    // For each person, take the earliest upcoming start
    const byPerson = new Map<string,{ start:number; label:string }>()
    for(const s of candidates){
      const sMin = toMin(s.start)
      const prev = byPerson.get(s.person)
      if(!prev || sMin < prev.start){
        byPerson.set(s.person, { start: sMin, label: s.start })
      }
    }
    return Array.from(byPerson.entries())
      .sort((a,b)=> a[1].start - b[1].start || a[0].localeCompare(b[0]))
      .map(([person,info])=> ({ person, at: info.label, start: info.start }))
  },[shifts,nowMin,cutoff])

  return (
    <section className={["rounded-2xl p-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">Up next</h2>
        <div className={["text-xs", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>within 2 hours of {minToHHMM(nowMin)}</div>
      </div>
      {upcoming.length === 0 ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No upcoming starts in this window.</div>
      ) : (
        <ul className="space-y-1">
          {upcoming.map(a=> (
            <li key={a.person} className="flex items-center justify-between text-sm">
              <span className="font-medium">{a.person}</span>
              <span className={dark?"text-neutral-400":"text-neutral-600"}>{a.at}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
