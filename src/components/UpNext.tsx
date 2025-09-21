import React, { useEffect, useMemo, useState } from 'react'
import type { Shift, PTO } from '../types'
import { minToHHMM, nowInTZ, toMin } from '../lib/utils'
import { useThemeBase } from '../hooks/useThemeBase'

export default function UpNext({ dark, tz, dayKey, shifts, pto, windowMin=120 }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
  pto: PTO[]
  windowMin?: number
}){
  const themeBase = useThemeBase()
  const isNight = themeBase === 'night'
  const isNoir = themeBase === 'noir'
  const isPrism = themeBase === 'prism'
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

  const sectionClasses = ["rounded-2xl", "p-3", "border"]
  if(isPrism){
    sectionClasses.push('prism-surface-3', 'prism-cycle-3')
  }else if(isNight){
    sectionClasses.push('bg-black')
  }else if(isNoir){
    sectionClasses.push(dark ? 'bg-neutral-950 border-neutral-700' : 'bg-neutral-100 border-neutral-300')
  }else{
    sectionClasses.push(dark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300 shadow-sm')
  }

  const sectionStyle: React.CSSProperties | undefined = isNight
    ? { backgroundColor: '#050505', borderColor: 'rgba(220,38,38,0.45)', color: '#dc2626' }
    : isNoir
      ? { backgroundColor: dark ? '#0c0c0d' : '#f5f5f5', borderColor: dark ? 'rgba(245,245,245,0.25)' : 'rgba(0,0,0,0.18)', color: dark ? '#f5f5f5' : '#111' }
      : undefined

  const headerCountClass = isNight ? 'text-red-400' : (dark? 'text-neutral-400' : 'text-neutral-500')
  const emptyClass = isNight ? 'text-red-400' : (dark? 'text-neutral-400' : 'text-neutral-600')
  const primaryTextClass = isNight
    ? 'text-red-400'
    : isNoir
      ? (dark ? 'text-neutral-200' : 'text-neutral-700')
      : (dark ? 'text-neutral-300' : 'text-neutral-700')
  const secondaryTextClass = isNight
    ? 'text-red-300'
    : isNoir
      ? (dark ? 'text-neutral-400' : 'text-neutral-600')
      : (dark ? 'text-neutral-400' : 'text-neutral-500')

  return (
    <section className={sectionClasses.join(' ')} style={sectionStyle}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">
          Up next
          <span className={["ml-2 text-sm", headerCountClass].join(' ')}>({upcoming.length})</span>
        </h2>
        <div className={["text-xs", headerCountClass].join(' ')}>within 2 hours of {minToHHMM(nowMin)}</div>
      </div>
      {upcoming.length === 0 ? (
        <div className={["text-sm", emptyClass].join(' ')}>No upcoming starts in this window.</div>
      ) : (
        <ul className="space-y-1">
          {upcoming.map((a,idx)=> {
            const H = colorMap.get(a.person) ?? 0
            const bgL = dark? 28 : 82
            const bgA1 = dark? 0.22 : 0.35
            const bgA2 = dark? 0.10 : 0.18
            const bdL = dark? 40 : 62
            const accentL = dark? 50 : 48
            const prismCycleClass = isPrism ? ['prism-chip', `prism-chip-cycle-${(idx % 6)+1}`] : []
            const gradAngle = ((H % 5) * 36) + 20
            const containerStyle: React.CSSProperties = isNight
              ? {
                  background: 'rgba(8,8,8,0.92)',
                  borderColor: 'rgba(220,38,38,0.5)',
                  borderLeftColor: 'rgba(220,38,38,0.85)',
                  borderLeftWidth: 6,
                  borderStyle: 'solid',
                }
              : isNoir
                ? {
                    background: dark ? 'rgba(16,16,16,0.92)' : 'rgba(245,245,245,0.96)',
                    borderColor: dark ? 'rgba(245,245,245,0.28)' : 'rgba(34,34,34,0.28)',
                    borderLeftColor: dark ? 'rgba(245,245,245,0.55)' : 'rgba(34,34,34,0.55)',
                    borderLeftWidth: 6,
                    borderStyle: 'solid',
                  }
                : {
                    background: `linear-gradient(${gradAngle}deg, hsla(${H},70%,${bgL}%,${bgA1}) 0%, hsla(${H},70%,${bgL}%,${bgA2}) 100%)`,
                    borderColor: `hsl(${H},70%,${bdL}%)`,
                    borderLeftColor: `hsl(${H},70%,${accentL}%)`,
                    borderLeftWidth: 6,
                    borderStyle: 'solid',
                    backgroundSize: '260% 100%',
                    backgroundPosition: 'var(--prism-chip-pos, 0% 50%)'
                  }
            if(isPrism){
              containerStyle.backgroundBlendMode = 'screen'
            }
            const startsIn = Math.max(0, a.start - nowMin)
            return (
              <li
                key={a.person}
                className={["flex items-center justify-between text-sm rounded-md border px-2 py-1", isNight ? 'text-red-400' : '', ...prismCycleClass].join(' ')}
                style={containerStyle}
              >
                <span className={["font-medium", isNight ? 'text-red-500' : isNoir ? (dark? 'text-neutral-100' : 'text-neutral-800') : ''].join(' ')}>{a.person}</span>
                <span className={primaryTextClass}>
                  {a.at} <span className={secondaryTextClass}>• in {formatIn(startsIn)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
