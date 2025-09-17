import React, { useEffect, useMemo, useState } from 'react'
import type { Shift, Task } from '../types'
import { nowInTZ, toMin } from '../lib/utils'
import { useTimeFormat } from '../context/TimeFormatContext'

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
  const { formatTime } = useTimeFormat()

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

  const hourMarks = useMemo(()=>Array.from({ length: 25 }, (_,i)=>i),[])
  const nowPct = Math.max(0, Math.min(100, (nowMin/1440)*100))

  const timelineHeight = 520
  const laneGap = 16
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
        <div className={["text-xs", textSubtle].join(' ')}>as of {formatTime(nowMin)}</div>
      </div>
      {timelineEntries.length === 0 ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No posture coverage configured today.</div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {timelineEntries.map(entry=>{
            const t = taskMap.get(entry.taskId)
            const color = t?.color || '#2563eb'
            const laneCount = Math.max(1, entry.laneCount)
            const lanes: PlacedSeg[][] = Array.from({ length: laneCount }, () => [])
            entry.placed.forEach(seg => { if (seg.lane >= 0 && seg.lane < laneCount) lanes[seg.lane].push(seg) })
            return (
              <div key={entry.taskId} className="rounded-lg p-2" style={{ background: bgTint }}>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
                  <div className="font-medium">{t?.name || entry.taskId}</div>
                </div>
                <div className="mt-2 rounded-lg border px-3 pb-3 pt-4" style={{ height: timelineHeight, background: dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.9)', borderColor, position: 'relative' }}>
                  <div className="absolute inset-0 pointer-events-none">
                    {hourMarks.map(h => {
                      if (h === 0 || h === 24) return null
                      const top = (h / 24) * timelineHeight
                      const major = h % 6 === 0
                      const lineColor = major ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)') : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
                      return (
                        <div key={`grid-${h}`} className="absolute left-0 right-0" style={{ top, height: 1, backgroundColor: lineColor }} />
                      )
                    })}
                  </div>
                  {showNowLine && (
                    <div className="absolute left-0 right-0 pointer-events-none" style={{ top: `${nowPct}%`, transform: 'translateY(-1px)' }}>
                      <div className="h-[2px]" style={{ backgroundColor: nowLineColor }} />
                      <div className="absolute left-0 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-medium shadow-sm" style={{ backgroundColor: nowTagBg, color: nowTagText }}>{formatTime(nowMin)}</div>
                    </div>
                  )}
                  <div className="relative h-full" style={{ display: 'grid', gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))`, columnGap: laneGap }}>
                    {lanes.map((laneSegs, laneIdx) => {
                      const hasSegments = laneSegs.length > 0
                      return (
                        <div key={`lane-${laneIdx}`} className="relative" style={{ height: timelineHeight }}>
                          {!hasSegments && (
                            <div className={["absolute inset-x-2 top-1/2 -translate-y-1/2 text-[11px] text-center", textSubtle].join(' ')}>
                              No coverage
                            </div>
                          )}
                          {laneSegs.map(seg => {
                            const topPx = (seg.startClamped / 1440) * timelineHeight
                            const heightPx = Math.max(6, ((seg.endClamped - seg.startClamped) / 1440) * timelineHeight)
                            const active = seg.startClamped <= nowMin && nowMin < seg.endClamped
                            const blockStyle: React.CSSProperties = {
                              left: 0,
                              right: 0,
                              top: topPx,
                              height: heightPx,
                              borderLeft: `4px solid ${color}`,
                              borderRadius: 8,
                              border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)',
                              background: dark ? 'rgba(17,24,39,0.88)' : 'rgba(255,255,255,0.98)',
                              boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.45)' : '0 2px 6px rgba(15,23,42,0.12)',
                              padding: '6px 8px',
                              position: 'absolute',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              overflow: 'hidden'
                            }
                            if (active) {
                              blockStyle.boxShadow = dark ? `0 0 0 2px ${color} inset` : `0 0 0 2px ${color} inset`
                            }
                            const showTime = heightPx >= 36
                            const showPerson = heightPx >= 22
                            const title = `${seg.person} • ${formatTime(seg.startClamped)}–${formatTime(seg.endClamped)}`
                            return (
                              <div key={`${seg.person}-${seg.startClamped}-${seg.endClamped}-${seg.lane}`} className={dark ? "text-neutral-100 text-[11px] leading-tight" : "text-neutral-900 text-[11px] leading-tight"} style={blockStyle} title={title}>
                                {showPerson ? (<span className="font-medium truncate">{seg.person}</span>) : (<span className="font-medium">•</span>)}
                                {showTime && (<span className={dark ? "text-neutral-300" : "text-neutral-600"}>{formatTime(seg.startClamped)}–{formatTime(seg.endClamped)}</span>)}
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
          })}
        </div>
      )}
    </section>
  )
}
