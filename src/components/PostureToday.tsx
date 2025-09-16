import React, { useEffect, useMemo, useState } from 'react'
import type { Shift, Task } from '../types'
import { minToHHMM, nowInTZ, toMin } from '../lib/utils'

export default function PostureToday({ dark, tz, dayKey, shifts, tasks }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
  tasks: Task[]
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

  // Map task id to display info
  const taskMap = useMemo(()=>{
    const m = new Map<string, Task>()
    tasks.forEach(t=> m.set(t.id, t))
    return m
  },[tasks])

  type SegRec = { taskId:string; person:string; start:number; end:number }
  const segs: SegRec[] = useMemo(()=>{
    const out: SegRec[] = []
    for(const s of shifts){
      if(!Array.isArray(s.segments) || s.segments.length===0) continue
      const sAbs = toMin(s.start)
      for(const seg of s.segments){
        const start = sAbs + seg.startOffsetMin
        const end = start + seg.durationMin
        out.push({ taskId: seg.taskId, person: s.person, start, end })
      }
    }
    return out.sort((a,b)=> a.start - b.start || a.end - b.end || a.person.localeCompare(b.person))
  },[shifts])

  type PlacedSeg = SegRec & { lane:number; startClamped:number; endClamped:number }
  const timelineEntries = useMemo(()=>{
    const grouped = new Map<string, SegRec[]>()
    for(const rec of segs){
      const arr = grouped.get(rec.taskId)
      if(arr) arr.push(rec)
      else grouped.set(rec.taskId, [rec])
    }
    const entries: Array<{ taskId:string; placed:PlacedSeg[]; laneCount:number; onNow:SegRec[]; nextOne:SegRec|null; earliest:number }> = []
    for(const [taskId, list] of grouped.entries()){
      const sorted = list.slice().sort((a,b)=> a.start - b.start || a.end - b.end || a.person.localeCompare(b.person))
      const laneEnds: number[] = []
      const placed: PlacedSeg[] = []
      const onNow: SegRec[] = []
      let nextOne: SegRec | null = null
      let earliest = Number.POSITIVE_INFINITY
      for(const rec of sorted){
        const startClamped = Math.max(0, Math.min(1440, rec.start))
        const endClamped = Math.max(startClamped, Math.min(1440, rec.end))
        if(endClamped <= startClamped) continue
        if(rec.start < earliest) earliest = rec.start
        if(rec.start <= nowMin && nowMin < rec.end){
          onNow.push(rec)
        }else if(rec.start > nowMin){
          if(!nextOne || rec.start < nextOne.start) nextOne = rec
        }
        let lane = 0
        for(; lane<laneEnds.length; lane++){ if(startClamped >= laneEnds[lane] - 0.5){ break } }
        if(lane===laneEnds.length){ laneEnds.push(endClamped) }
        else { laneEnds[lane] = endClamped }
        placed.push({ ...rec, lane, startClamped, endClamped })
      }
      if(placed.length>0){
        entries.push({ taskId, placed, laneCount: Math.max(1, laneEnds.length || 1), onNow: onNow.sort((a,b)=> a.end - b.end || a.person.localeCompare(b.person)), nextOne, earliest: Number.isFinite(earliest) ? earliest : Number.POSITIVE_INFINITY })
      }
    }
    entries.sort((a,b)=>{
      const aOn = a.onNow.length>0 ? 0 : 1
      const bOn = b.onNow.length>0 ? 0 : 1
      if(aOn!==bOn) return aOn - bOn
      const aNext = a.nextOne ? 0 : 1
      const bNext = b.nextOne ? 0 : 1
      if(aNext!==bNext) return aNext - bNext
      if(a.earliest!==b.earliest) return a.earliest - b.earliest
      const aName = taskMap.get(a.taskId)?.name || a.taskId
      const bName = taskMap.get(b.taskId)?.name || b.taskId
      return aName.localeCompare(bName)
    })
    return entries
  },[segs, nowMin, taskMap])

  const hourLabels = useMemo(()=>[0,6,12,18,24],[])
  const hourMarks = useMemo(()=>Array.from({ length: 25 }, (_,i)=>i),[])
  const nowPct = Math.max(0, Math.min(100, (nowMin/1440)*100))

  const laneHeight = 26
  const laneGap = 6
  const textSubtle = dark?"text-neutral-400":"text-neutral-500"
  const borderColor = dark? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const bgTint = dark? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
  const showNowLine = nowMin >= 0 && nowMin <= 1440
  const nowLineColor = dark ? 'rgba(239,68,68,0.75)' : 'rgba(220,38,38,0.75)'
  const nowTagBg = dark ? 'rgba(239,68,68,0.9)' : 'rgba(220,38,38,0.9)'
  const nowTagText = '#fff'

  return (
    <section className={["rounded-2xl p-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">Posture schedule today</h2>
        <div className={["text-xs", textSubtle].join(' ')}>as of {minToHHMM(nowMin)}</div>
      </div>
      {timelineEntries.length === 0 ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No posture coverage configured today.</div>
      ) : (
        <div className="space-y-3">
          {timelineEntries.map(entry=>{
            const t = taskMap.get(entry.taskId)
            const color = t?.color || '#2563eb'
            const laneCount = Math.max(1, entry.laneCount)
            const trackHeight = laneCount * laneHeight + Math.max(0, laneCount - 1) * laneGap
            return (
              <div key={entry.taskId} className="rounded-lg p-2" style={{ background: bgTint }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
                    <div className="font-medium">{t?.name || entry.taskId}</div>
                  </div>
                  <div className={["text-xs flex flex-wrap items-center gap-x-2 gap-y-1", textSubtle].join(' ')}>
                    {entry.onNow.length>0 ? (
                      <span>on now ({entry.onNow.length})</span>
                    ) : (
                      <span>no one on now</span>
                    )}
                    {entry.nextOne && (
                      <span>next at {minToHHMM(entry.nextOne.start)} ({entry.nextOne.person})</span>
                    )}
                    {!entry.nextOne && entry.onNow.length===0 && (
                      <span>no remaining coverage</span>
                    )}
                  </div>
                </div>
                <div className="mt-2 rounded-lg border px-3 pb-3 pt-4" style={{ background: dark? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.9)', borderColor }}>
                  <div className={["flex justify-between text-[10px] uppercase tracking-wide font-medium", textSubtle].join(' ')}>
                    {hourLabels.map(h=>{
                      const label = h===24 ? '24:00' : minToHHMM(h*60)
                      return <span key={h}>{label}</span>
                    })}
                  </div>
                  <div className="relative mt-2" style={{ height: trackHeight }}>
                    <div className="absolute inset-0 pointer-events-none">
                      {hourMarks.map(h=>{
                        if(h===0 || h===24) return null
                        const position = (h/24)*100
                        const major = h % 6 === 0
                        const lineColor = major ? (dark? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)') : (dark? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
                        return (
                          <div key={h} className="absolute top-0 bottom-0" style={{ left: `${position}%`, width: '1px', backgroundColor: lineColor }} />
                        )
                      })}
                    </div>
                    {showNowLine && (
                      <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${nowPct}%`, transform: 'translateX(-1px)' }}>
                        <div className="absolute inset-y-0 w-[2px]" style={{ backgroundColor: nowLineColor }} />
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-medium shadow-sm" style={{ backgroundColor: nowTagBg, color: nowTagText }}>{minToHHMM(nowMin)}</div>
                      </div>
                    )}
                    {entry.placed.map(seg=>{
                      const startPct = (seg.startClamped/1440)*100
                      const rawWidthPct = ((seg.endClamped - seg.startClamped)/1440)*100
                      const widthPct = Math.max(0.4, Math.min(100 - startPct, rawWidthPct))
                      const top = seg.lane * (laneHeight + laneGap)
                      const active = seg.startClamped <= nowMin && nowMin < seg.endClamped
                      const blockStyle: React.CSSProperties = {
                        left: `${startPct}%`,
                        width: `${widthPct}%`,
                        top,
                        height: laneHeight,
                        borderLeft: `4px solid ${color}`,
                        borderRadius: 8,
                        border: dark? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)',
                        background: dark? 'rgba(17,24,39,0.88)' : 'rgba(255,255,255,0.98)',
                        boxShadow: dark? '0 2px 6px rgba(0,0,0,0.45)' : '0 2px 6px rgba(15,23,42,0.12)',
                        padding: '4px 6px 4px 8px',
                        position: 'absolute',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }
                      if(active){
                        blockStyle.boxShadow = dark? `0 0 0 2px ${color} inset` : `0 0 0 2px ${color} inset`
                      }
                      const widthForText = rawWidthPct
                      const showTime = widthForText >= 6
                      const showPerson = widthForText >= 3
                      const title = `${seg.person} • ${minToHHMM(seg.startClamped)}–${minToHHMM(seg.endClamped)}`
                      return (
                        <div key={`${seg.person}-${seg.startClamped}-${seg.endClamped}-${seg.lane}`} className={dark?"text-neutral-100 text-[11px] leading-tight":"text-neutral-900 text-[11px] leading-tight"} style={blockStyle} title={title}>
                          <div className="flex items-center justify-between gap-2">
                            {showPerson ? (<span className="font-medium truncate">{seg.person}</span>) : (<span className="font-medium">•</span>)}
                            {showTime && (<span className={dark?"text-neutral-300":"text-neutral-600"}>{minToHHMM(seg.startClamped)}–{minToHHMM(seg.endClamped)}</span>)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
