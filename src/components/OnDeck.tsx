import React, { useEffect, useMemo, useState } from 'react'
import type { Shift, PTO } from '../types'
import { minToHHMM, nowInTZ, toMin } from '../lib/utils'
import { useThemeBase } from '../hooks/useThemeBase'

export default function OnDeck({ dark, tz, dayKey, shifts, pto }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
  pto: PTO[]
}){
  const themeBase = useThemeBase()
  const isNight = themeBase === 'night'
  const isNoir = themeBase === 'noir'
  const isPrism = themeBase === 'prism'
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

  const sectionClasses = ["rounded-2xl", "p-3", "border"]
  if(isPrism){
    sectionClasses.push('prism-surface-2', 'prism-cycle-2')
  }else if(isNight){
    sectionClasses.push('bg-black')
  }else if(isNoir){
    sectionClasses.push(dark? 'bg-neutral-950 border-neutral-700' : 'bg-neutral-100 border-neutral-300')
  }else{
    sectionClasses.push(dark? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300 shadow-sm')
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
          On deck
          <span className={["ml-2 text-sm", headerCountClass].join(' ')}>({active.length})</span>
        </h2>
        <div className={["text-xs", headerCountClass].join(' ')}>as of {minToHHMM(nowMin)}</div>
      </div>
      {active.length === 0 ? (
        <div className={["text-sm", emptyClass].join(' ')}>No one on right now.</div>
      ) : (
        <ul className="space-y-1">
          {active.map((a,idx)=> {
            const H = colorMap.get(a.person) ?? 0
            const bgL = dark? 28 : 82
            const bgA1 = dark? 0.22 : 0.35
            const bgA2 = dark? 0.10 : 0.18
            const bdL = dark? 40 : 62
            const accentL = dark? 50 : 48
            const prismCycleClass = isPrism ? [`prism-chip`, `prism-chip-cycle-${(idx % 6)+1}`] : []
            const gradAngle = ((H % 5) * 36) + 30
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
            const leftMins = Math.max(0, a.end - nowMin)
            return (
              <li
                key={a.person}
                className={["flex items-center justify-between text-sm rounded-md border px-2 py-1", isNight ? 'text-red-400' : '', ...prismCycleClass].join(' ')}
                style={containerStyle}
              >
                <span className={["font-medium", isNight ? 'text-red-500' : isNoir ? (dark? 'text-neutral-100' : 'text-neutral-800') : ''].join(' ')}>{a.person}</span>
                <span className={primaryTextClass}>
                  {a.window} <span className={secondaryTextClass}>• {formatLeft(leftMins)} left</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
