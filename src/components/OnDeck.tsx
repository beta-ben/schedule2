import React, { useMemo } from 'react'
import type { Shift } from '../types'
import { minToHHMM, nowInTZ, toMin } from '../lib/utils'

export default function OnDeck({ dark, tz, dayKey, shifts }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
}){
  // Compute now in selected timezone
  const nowTz = nowInTZ(tz.id)
  const nowMin = nowTz.minutes

  // Match DayGrid coloring by assigning a hue per person based on earliest start
  const orderedPeople = useMemo(()=>{
    const firstStart=new Map<string,number>()
    shifts.forEach(s=>{
      const cur = firstStart.get(s.person)
      const sMin = toMin(s.start)
      if(cur==null || sMin < cur) firstStart.set(s.person, sMin)
    })
    return Array.from(firstStart.entries()).sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).map(([p])=>p)
  },[shifts])
  const colorMap = useMemo(()=>{
    const m=new Map<string,number>()
    const n=Math.max(1, orderedPeople.length)
    orderedPeople.forEach((p,i)=>{ const h=Math.round((i/n)*360); m.set(p,h) })
    return m
  },[orderedPeople])

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

  const formatLeft = (mins:number) => {
    const h = Math.floor(mins/60)
    const m = mins % 60
    if (h>0 && m>0) return `${h}h ${m}m`
    if (h>0) return `${h}h`
    if (m>0) return `${m}m`
    return 'ending now'
  }

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
          {active.map(a=> {
            const H = colorMap.get(a.person) ?? 0
            const bgL = dark? 28 : 82
            const bgA1 = dark? 0.22 : 0.35
            const bgA2 = dark? 0.10 : 0.18
            const bdL = dark? 40 : 62
            const accentL = dark? 50 : 48
            const containerStyle: React.CSSProperties = {
              background: `linear-gradient(90deg, hsla(${H},70%,${bgL}%,${bgA1}) 0%, hsla(${H},70%,${bgL}%,${bgA2}) 100%)`,
              borderColor: `hsl(${H},70%,${bdL}%)`,
              borderLeftColor: `hsl(${H},70%,${accentL}%)`,
              borderLeftWidth: 6,
              borderStyle: 'solid',
            }
            const leftMins = Math.max(0, a.end - nowMin)
            return (
              <li key={a.person} className="flex items-center justify-between text-sm rounded-md border px-2 py-1" style={containerStyle}>
                <span className="font-medium">{a.person}</span>
                <span className={dark?"text-neutral-300":"text-neutral-700"}>
                  {a.window} <span className={dark?"text-neutral-400":"text-neutral-500"}>• {formatLeft(leftMins)} left</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
