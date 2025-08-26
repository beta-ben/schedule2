import React, { useEffect, useMemo, useState } from 'react'
import { COLS, DAYS } from '../constants'
import { addDays, fmtYMD, minToHHMM, nowInTZ, parseYMD, toMin, convertShiftsToTZ, mergeSegments } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

export default function AgentWeekGrid({
  dark,
  tz,
  weekStart,
  agent,
  shifts,
  pto,
  tasks,
  calendarSegs,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  agent: string
  shifts: Shift[]
  pto: PTO[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
}){
  const totalMins=24*60
  const textSub = dark?"text-neutral-400":"text-neutral-500"

  // Responsive sizing (mirrors DayGrid)
  const useWindowWidth = () => {
    const [w,setW] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1280)
    useEffect(()=>{ const onR=()=>setW(window.innerWidth); window.addEventListener('resize', onR); return ()=>window.removeEventListener('resize', onR) },[])
    return w
  }
  const w = useWindowWidth()
  type BP = 'xs'|'sm'|'md'|'lg'
  const bp: BP = w >= 1024 ? 'lg' : w >= 768 ? 'md' : w >= 640 ? 'sm' : 'xs'
  const scale = bp==='lg'?1:bp==='md'?0.9:bp==='sm'?0.82:0.75
  const NAME_COL_PX = bp==='lg'?80:bp==='md'?76:bp==='sm'?70:66 // day label column
  const HEADER_H = Math.round(60*scale)
  const HOUR_LABEL_PX = Math.max(9, Math.round(11*scale))
  const ROW_LABEL_PX = Math.max(11, Math.round(12*scale))
  // Keep chip label font stable (revert recent scaling change)
  const CHIP_FONT_PX = 12
  const NOW_FONT_PX = Math.max(9, Math.round(10*scale))
  const CHIP_H = Math.max(20, Math.round(24*scale))
  const RAIL_H = Math.max(6, Math.round(8*scale))
  const hourEvery = bp==='lg'?1:bp==='md'?2:3
  const NAME_COL = `${NAME_COL_PX}px`
  const LABEL_TOP = Math.round(30*scale)
  const LABEL_H = Math.max(12, Math.round(16*scale))

  const weekStartDate = parseYMD(weekStart)
  const days = useMemo(()=> Array.from({length:7},(_,i)=>{
    const d = addDays(weekStartDate, i)
    return { key: DAYS[i], date: d, ymd: fmtYMD(d) }
  }),[weekStart])

  const tzShifts = useMemo(()=> convertShiftsToTZ(shifts, tz.offset).filter(s=>s.person===agent), [shifts, tz.offset, agent])
  const byDay = useMemo(()=>{
    const m = new Map<string, Shift[]>()
    for(const d of DAYS){ m.set(d, []) }
    for(const s of tzShifts){ m.get(s.day)!.push(s) }
    for(const [k,arr] of m){ arr.sort((a,b)=> toMin(a.start)-toMin(b.start)) }
    return m
  },[tzShifts])

  // Color derived from agent name for stability
  const hue = useMemo(()=>{
    let sum = 0; for(const ch of agent){ sum = (sum + ch.charCodeAt(0)) % 360 }
    return sum
  },[agent])

  // Now indicator
  const [nowTick,setNowTick]=useState(Date.now())
  useEffect(()=>{ const id=setInterval(()=>setNowTick(Date.now()),30000); return ()=>clearInterval(id) },[])
  const nowTz = nowInTZ(tz.id)
  const nowLeft=((nowTz.minutes)/totalMins)*100
  const todayKey = nowTz.weekdayShort as (typeof DAYS)[number]

  // Colors
  const light=`hsla(${hue},75%,70%,0.95)`; const darkbg=`hsla(${hue},60%,28%,0.95)`; const darkbd=`hsl(${hue},70%,55%)`
  const taskMap = useMemo(()=>{ const m=new Map<string,Task>(); for(const t of (tasks||[])) m.set(t.id,t); return m },[tasks])

  return (
    <div className="overflow-x-auto no-scrollbar w-full no-select">
      {/* Header row */}
      <div className="grid sticky top-0 z-30" style={{gridTemplateColumns:`${NAME_COL} 1fr`}}>
        <div className={dark?"bg-neutral-900":"bg-white"}></div>
        <div className={["relative", dark?"bg-neutral-900":"bg-white"].join(' ')} style={{height:HEADER_H}}>
          <div className="absolute left-0 right-0" style={{top:LABEL_TOP,height:LABEL_H}}>
            {Array.from({length:24},(_,i)=>i).map((h,i)=> (
              (i % hourEvery === 0) && (
                <div key={i} className="absolute text-left pl-1 leading-none pointer-events-none" style={{ left: `calc(${i} * (100% / ${COLS}))`, width: `calc(100% / ${COLS})` }}>
                  <div className={["font-medium hour-label",textSub].join(' ')} style={{ fontSize: HOUR_LABEL_PX }}>
                    {h===0?12:h>12?h-12:h}{h<12?"am":"pm"}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </div>

      {/* Body with 7 rows (Sun..Sat) */}
      <div className="relative">
        {/* Now line across all rows; label at top */}
        <div className="absolute inset-y-0 right-0 z-20 pointer-events-none" style={{ left: NAME_COL }}>
          <div className={["absolute -translate-x-1/2 inset-y-0 w-px", dark?"bg-red-400":"bg-red-500"].join(' ')} style={{ left: `${nowLeft}%` }} />
          <div className={["absolute -translate-x-1/2 -top-5 px-1.5 py-0.5 rounded-md shadow-sm", dark?"bg-red-400 text-black":"bg-red-500 text-white"].join(' ')} style={{ left: `${nowLeft}%`, fontSize: NOW_FONT_PX }}>
            {minToHHMM(nowTz.minutes)}
          </div>
        </div>

        {days.map(d=>{
          const items = (byDay.get(d.key) || []).map(s=>{
            const cal = (calendarSegs||[])
              .filter(cs=> cs.person===agent && cs.day===d.key)
              .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
            const segments = mergeSegments(s, cal)
            return segments && segments.length>0 ? { ...s, segments } : s
          })
          const isToday = d.key === todayKey
          return (
            <div key={d.key} className="grid" style={{gridTemplateColumns:`${NAME_COL} 1fr`}}>
              <div className={["py-1.5 pr-2 font-medium sticky left-0 z-20 truncate", dark?"bg-neutral-900":"bg-white"].join(' ')} style={{ fontSize: ROW_LABEL_PX }}>
                <span className={isToday ? (dark? 'text-red-400' : 'text-red-600') : undefined}>{d.key}</span>
              </div>
              <div className="relative" style={{
                backgroundImage:`linear-gradient(to right, ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'} 0, ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'} 50%, ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)'} 50%, ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)'} 100%)`,
                backgroundSize:`calc(100%/${COLS}) 100%`, backgroundRepeat:'repeat-x', backgroundPosition:'0 0'
              }}>
                {items.map(s=>{
                  const sMin=toMin(s.start); const eMinRaw=toMin(s.end); const eMin=eMinRaw>sMin?eMinRaw:1440
                  const left=(sMin/totalMins)*100; const width=Math.max(0.5, ((eMin-sMin)/totalMins)*100)
                  const dur = eMin - sMin
                  const baseColor = (dark?darkbg:light)
                  const baseBorder = (dark?darkbd:`hsl(${hue},65%,50%)`)
                  const segs = (Array.isArray(s.segments)? s.segments: []).slice().sort((a,b)=>a.startOffsetMin-b.startOffsetMin)
                  type Piece = { kind:'base'|'seg'; startOff:number; len:number; color:string; border?:string; title:string; key:string }
                  const pieces: Piece[] = []
                  let cursor = 0
                  for(const seg of segs){
                    const stOff = Math.max(0, Math.min(dur, seg.startOffsetMin))
                    const enOff = Math.max(0, Math.min(dur, seg.startOffsetMin + seg.durationMin))
                    if(stOff > cursor){
                      const st = sMin + cursor; const en = sMin + stOff
                      pieces.push({ kind:'base', startOff: cursor, len: stOff - cursor, color: baseColor, title: `${s.person} • ${minToHHMM(st)}–${minToHHMM(en)}`, key:`gap-${cursor}` })
                    }
                    if(enOff > stOff){
                      const t = taskMap.get(seg.taskId)
                      const stAbs = sMin + stOff; const enAbs = sMin + enOff
                      const tColor = t?.color || baseBorder
                      const segBg = `color-mix(in oklab, ${tColor} 42%, ${dark?'#0a0a0a':'#ffffff'} 58%)`
                      const segBorder = `color-mix(in oklab, ${tColor} 70%, ${dark?'#ffffff':'#000000'} 30%)`
                      pieces.push({ kind:'seg', startOff: stOff, len: enOff - stOff, color: segBg, border: segBorder, title: `${t?.name || 'Task'} • ${minToHHMM(stAbs)}–${minToHHMM(enAbs)}`, key:`seg-${seg.id}` })
                    }
                    cursor = Math.max(cursor, enOff)
                  }
                  if(cursor < dur){
                    const st = sMin + cursor; const en = eMin
                    pieces.push({ kind:'base', startOff: cursor, len: dur - cursor, color: baseColor, title: `${s.person} • ${minToHHMM(st)}–${minToHHMM(en)}`, key:`gap-${cursor}` })
                  }

                  const segLines = pieces.filter(p=>p.kind==='seg').map(p=>p.title.replace(/^.* • /,''))
                  const chipTitle = `${s.person} • ${s.start}-${s.end}` + (segLines.length ? `\n\nTasks:\n${segLines.join('\n')}` : '')

                  return (
                    <div key={`${s.person}-${s.day}-${s.start}-${s.end}`} className="relative" title={chipTitle}>
                      {pieces.map(p=>{
                        const pLeft = ((sMin + p.startOff)/totalMins)*100
                        const pW = (p.len/totalMins)*100
                        const borderCol = p.kind==='seg' && p.border ? p.border : baseBorder
                        return (
                          <div key={p.key} className="absolute rounded" style={{ left:`${pLeft}%`, width:`${pW}%`, height: CHIP_H, backgroundColor:p.color, boxShadow:`inset 0 0 0 1px ${borderCol}` }} title={p.title} />
                        )
                      })}
                      <div className="absolute flex items-center justify-center px-2 truncate pointer-events-none" style={{ left:`${left}%`, width:`${width}%`, height: CHIP_H, fontSize: CHIP_FONT_PX }}>
                        {s.start}-{s.end}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
