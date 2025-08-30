import React, { useEffect, useMemo, useState } from 'react'
import type { Shift, PTO } from '../types'
import { minToHHMM, nowInTZ, toMin } from '../lib/utils'

export default function UpNext({ dark, tz, dayKey, shifts, pto, windowMin=120 }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
  pto: PTO[]
  windowMin?: number
}){
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(()=>{
    let to: number | undefined
    let iv: number | undefined
    const poke = ()=> setNowTick(Date.now())
    const schedule = ()=>{
      if(iv) clearInterval(iv)
      if(to) clearTimeout(to)
      const now = Date.now()
      const msToNextMinute = 60000 - (now % 60000)
      to = window.setTimeout(()=>{ poke(); iv = window.setInterval(poke, 60000) }, msToNextMinute)
    }
    const onVis = ()=>{ if(document.visibilityState==='visible'){ poke(); schedule() } }
    poke(); schedule(); document.addEventListener('visibilitychange', onVis)
    return ()=>{ if(iv) clearInterval(iv); if(to) clearTimeout(to); document.removeEventListener('visibilitychange', onVis) }
  },[])
  const nowTz = nowInTZ(tz.id)
  const nowMin = nowTz.minutes
  const cutoff = nowMin + windowMin
  const ymd = nowTz.ymd
  const ptoToday = useMemo(()=>{
    const names = new Set<string>()
    for(const p of (pto||[])){
      if(p.startDate <= ymd && ymd <= p.endDate){ names.add(p.person) }
    }
    return names
  }, [pto, ymd])

  // Match DayGrid/OnDeck coloring by assigning a hue per person based on earliest start
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

  const upcoming = useMemo(()=>{
    // Consider shifts that start after now and within the window
    const candidates = shifts.filter(s=>{
      if(ptoToday.has(s.person)) return false
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

  const formatIn = (mins:number) => {
    const m = Math.max(0, mins)
    const h = Math.floor(m/60)
    const mm = m % 60
    if (h>0 && mm>0) return `${h}h ${mm}m`
    if (h>0) return `${h}h`
    if (mm>0) return `${mm}m`
    return 'now'
  }

  return (
    <section className={["rounded-2xl p-3 prism-surface-3 border", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300 shadow-sm"].join(' ')}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">
          Up next
          <span className={["ml-2 text-sm", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>({upcoming.length})</span>
        </h2>
        <div className={["text-xs", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>within 2 hours of {minToHHMM(nowMin)}</div>
      </div>
      {upcoming.length === 0 ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No upcoming starts in this window.</div>
      ) : (
        <ul className="space-y-1">
          {upcoming.map(a=> {
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
            const startsIn = Math.max(0, a.start - nowMin)
            return (
              <li key={a.person} className="flex items-center justify-between text-sm rounded-md border px-2 py-1" style={containerStyle}>
                <span className="font-medium">{a.person}</span>
                <span className={dark?"text-neutral-300":"text-neutral-700"}>
                  {a.at} <span className={dark?"text-neutral-400":"text-neutral-500"}>• in {formatIn(startsIn)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
