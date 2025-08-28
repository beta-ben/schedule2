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
    // Sort by start for stable grouping
    return out.sort((a,b)=> a.start - b.start || a.end - b.end || a.person.localeCompare(b.person))
  },[shifts])

  const byTask = useMemo(()=>{
    const map = new Map<string, { onNow: SegRec[]; nextOne: SegRec | null }>()
    for(const rec of segs){
      const bucket = map.get(rec.taskId) || { onNow: [], nextOne: null }
      // Classify: on now vs next upcoming (earliest after now)
      if(rec.start <= nowMin && nowMin < rec.end){
        bucket.onNow.push(rec)
      }else if(rec.start > nowMin){
        if(!bucket.nextOne || rec.start < bucket.nextOne.start) bucket.nextOne = rec
      }
      map.set(rec.taskId, bucket)
    }
    // Sort onNow by soonest ending
    for(const [taskId, bucket] of map){
      bucket.onNow.sort((a,b)=> a.end - b.end || a.person.localeCompare(b.person))
      map.set(taskId, bucket)
    }
    return map
  },[segs, nowMin])

  const taskIdsWithCoverage = Array.from(byTask.entries()).filter(([taskId, b])=> (b.onNow.length > 0 || b.nextOne) && taskMap.has(taskId))
  taskIdsWithCoverage.sort((a,b)=> (a[1].onNow.length?0:1) - (b[1].onNow.length?0:1) || (a[0].localeCompare(b[0])))

  const formatLeft = (mins:number) => {
    const m = Math.max(0, mins)
    const h = Math.floor(m/60)
    const mm = m % 60
    if(h>0 && mm>0) return `${h}h ${mm}m`
    if(h>0) return `${h}h`
    if(mm>0) return `${mm}m`
    return 'now'
  }

  return (
    <section className={["rounded-2xl p-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">Posture schedule today</h2>
        <div className={["text-xs", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>as of {minToHHMM(nowMin)}</div>
      </div>
      {taskIdsWithCoverage.length === 0 ? (
        <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No posture coverage configured today.</div>
      ) : (
        <div className="space-y-3">
          {taskIdsWithCoverage.map(([taskId, bucket])=>{
            const t = taskMap.get(taskId)!
            const color = t.color || '#2563eb'
            return (
              <div key={taskId} className="rounded-lg p-2" style={{ background: dark? 'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)' }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
                    <div className="font-medium">{t.name}</div>
                  </div>
                  <div className={["text-xs", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>
                    {bucket.onNow.length>0 && (<span>on now {`(${bucket.onNow.length})`}</span>)}
                    {bucket.onNow.length>0 && bucket.nextOne && (<span className="mx-1">•</span>)}
                    {bucket.nextOne && (<span>next at {minToHHMM(bucket.nextOne.start)}</span>)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    {bucket.onNow.length===0 ? (
                      <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No one on now.</div>
                    ) : (
                      <ul className="space-y-1">
                        {bucket.onNow.map(r=>{
                          const left = Math.max(0, r.end - nowMin)
                          const containerStyle: React.CSSProperties = { borderLeft: `6px solid ${color}` }
                          return (
                            <li key={`${taskId}-now-${r.person}-${r.start}`} className="flex items-center justify-between text-sm rounded-md px-2 py-1" style={containerStyle}>
                              <span className="font-medium">{r.person}</span>
                              <span className={dark?"text-neutral-300":"text-neutral-700"}>
                                {minToHHMM(r.start)}–{minToHHMM(r.end)} <span className={dark?"text-neutral-400":"text-neutral-500"}>• {formatLeft(left)} left</span>
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                  <div>
                    {!bucket.nextOne ? (
                      <div className={["text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>No upcoming today.</div>
                    ) : (
                      (()=>{
                        const r = bucket.nextOne!
                        const inMin = Math.max(0, r.start - nowMin)
                        const containerStyle: React.CSSProperties = { borderLeft: `6px solid ${color}` }
                        return (
                          <ul className="space-y-1">
                            <li key={`${taskId}-up-${r.person}-${r.start}`} className="flex items-center justify-between text-sm rounded-md px-2 py-1" style={containerStyle}>
                              <span className="font-medium">{r.person}</span>
                              <span className={dark?"text-neutral-300":"text-neutral-700"}>
                                {minToHHMM(r.start)} <span className={dark?"text-neutral-400":"text-neutral-500"}>• in {formatLeft(inMin)}</span>
                              </span>
                            </li>
                          </ul>
                        )
                      })()
                    )}
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
