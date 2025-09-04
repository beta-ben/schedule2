import React, { useEffect, useMemo, useState } from 'react'
import type { Shift, PTO } from '../types'
import { minToHHMM, nowInTZ, toMin } from '../lib/utils'

export default function OnDeck({ dark, tz, dayKey, shifts, pto }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
  pto: PTO[]
}){
  // Detect theme from root [data-theme] to harmonize visuals across themes
  const theme: 'system'|'light'|'dark'|'night'|'noir'|'prism'|'subtle'|'spring'|'summer'|'autumn'|'winter' = ((): any=>{
    try{
      const el = document.querySelector('[data-theme]') as HTMLElement | null
      return (el?.getAttribute('data-theme') as any) || 'system'
    }catch{ return 'system' as const }
  })()
  const isNight = theme==='night'
  const isNoir = theme==='noir'
  const isPrism = theme==='prism'
  const isSubtle = theme==='subtle'
  const isSeasonal = theme==='spring' || theme==='summer' || theme==='autumn' || theme==='winter'

  // Compute now in selected timezone
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
  const ymd = nowTz.ymd
  const ptoToday = useMemo(()=>{
    const names = new Set<string>()
    for(const p of (pto||[])){
      if(p.startDate <= ymd && ymd <= p.endDate){ names.add(p.person) }
    }
    return names
  }, [pto, ymd])

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
      if(ptoToday.has(s.person)) return false
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
    <section className={[
      'rounded-2xl p-3 border',
      // Apply animated surface on Prism only
      isPrism ? 'prism-surface-2' : '',
      dark || isNight || isNoir || isPrism ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300 shadow-sm'
    ].join(' ')}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">
          On deck
          <span className={["ml-2 text-sm", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>({active.length})</span>
        </h2>
        <div className={["text-xs", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>as of {minToHHMM(nowMin)}</div>
      </div>
      {active.length === 0 ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No one on right now.</div>
      ) : (
        <ul className="space-y-1">
          {active.map(a=> {
            // For Subtle, use main-theme blue hue with lower saturation; otherwise, per-person hue
            const H = isSubtle ? 217 : (colorMap.get(a.person) ?? 0)
            // Tune lightness/alpha by theme for better harmony
            const darkLike = dark || isNight || isNoir || isPrism
            let bgL = darkLike ? 28 : 82
            let bgA1 = darkLike ? 0.22 : 0.35
            let bgA2 = darkLike ? 0.10 : 0.18
            let bdL = darkLike ? 40 : 62
            let accentL = darkLike ? 50 : 48
            if(isSubtle){ bgL = darkLike ? 32 : 88; bgA1 = darkLike ? 0.20 : 0.28; bgA2 = darkLike ? 0.10 : 0.16; bdL = darkLike ? 52 : 66; accentL = darkLike ? 58 : 56 }
            if(isSeasonal){ bgL = 90; bgA1 = 0.35; bgA2 = 0.22; bdL = 70; accentL = 55 }
            if(isPrism){ bgA1 = 0.12; bgA2 = 0.06; bdL = 55; accentL = 65 }
            if(isNoir){ bdL = 70; accentL = 85 }
            if(isNight){ bdL = 30; accentL = 60 }
            // Saturation: lower for Subtle than main (70%)
            const S = isSubtle ? 48 : 70
            const containerStyle: React.CSSProperties = {
              background: `linear-gradient(90deg, hsla(${H},${S}%,${bgL}%,${bgA1}) 0%, hsla(${H},${S}%,${bgL}%,${bgA2}) 100%)`,
              borderColor: `hsl(${H},${S}%,${bdL}%)`,
              borderLeftColor: `hsl(${H},${S}%,${accentL}%)`,
              borderLeftWidth: 6,
              borderStyle: 'solid',
            }
            const leftMins = Math.max(0, a.end - nowMin)
            return (
              <li key={a.person} className="flex items-center justify-between text-sm rounded-md border px-2 py-1" style={containerStyle}>
                <span className="font-medium">{a.person}</span>
                <span className={(dark || isNight || isNoir || isPrism)?"text-neutral-300":"text-neutral-700"}>
                  {a.window} <span className={(dark || isNight || isNoir || isPrism)?"text-neutral-400":"text-neutral-500"}>  {formatLeft(leftMins)} left</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
