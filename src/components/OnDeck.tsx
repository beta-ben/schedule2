import React, { useMemo } from 'react'
import type { Shift } from '../types'
import { minToHHMM, toMin } from '../lib/utils'

export default function OnDeck({ dark, tz, dayKey, shifts }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
}){
  const now = new Date()
  // Compute now in selected timezone
  const nowMin = ((now.getHours()*60 + now.getMinutes()) + tz.offset*60 + 1440) % 1440

  const active = useMemo(()=>{
    // Compute active shifts for the current minute
    const recs = shifts.filter(s=>{
      const sMin = toMin(s.start)
      const eMinRaw = toMin(s.end)
      const eMin = eMinRaw > sMin ? eMinRaw : 1440
      return nowMin >= sMin && nowMin < eMin
    })
    // Collapse to unique person → pick the nearest ending shift window
    const byPerson = new Map<string,{ start:number; end:number; label:string }>()
    for(const s of recs){
      const sMin = toMin(s.start)
      const eMinRaw = toMin(s.end)
      const eMin = eMinRaw > sMin ? eMinRaw : 1440
      const prev = byPerson.get(s.person)
      if(!prev || eMin < prev.end){
        byPerson.set(s.person, { start:sMin, end:eMin, label:`${s.start}–${s.end}` })
      }
    }
    return Array.from(byPerson.entries())
      .sort((a,b)=> a[1].end - b[1].end || a[0].localeCompare(b[0]))
      .map(([person,info])=> ({ person, window: info.label, end: info.end }))
  },[shifts,nowMin])

  return (
    <section className={["rounded-2xl p-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">On deck</h2>
        <div className={["text-xs", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>as of {minToHHMM(nowMin)}</div>
      </div>
      {active.length === 0 ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No one on right now.</div>
      ) : (
        <ul className="space-y-1">
          {active.map(a=> (
            <li key={a.person} className="flex items-center justify-between text-sm">
              <span className="font-medium">{a.person}</span>
              <span className={dark?"text-neutral-400":"text-neutral-600"}>{a.window}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
