import React, { useEffect, useMemo, useState } from 'react'
import { COLS } from '../constants'
import { fmtYMD, minToHHMM, parseYMD, toMin, nowInTZ } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'

export default function DayGrid({ date, dayKey, people, shifts, pto, dark, tz, canEdit, editMode, onRemove, showHeaderTitle = true, tasks, compact }:{ 
  date: Date
  dayKey: string
  people: string[]
  shifts: Shift[]
  pto: PTO[]
  dark: boolean
  tz: { id:string; label:string; offset:number }
  canEdit?: boolean
  editMode?: boolean
  onRemove?: (id: string)=>void
  showHeaderTitle?: boolean
  tasks?: Task[]
  compact?: boolean
}){
  const totalMins=24*60
  const hourMarks = Array.from({length:24},(_,i)=>i)
  // Subtler label color
  const textSub = dark?"text-neutral-500":"text-neutral-400"

  // Responsive
  const useWindowWidth = () => {
    const [w,setW] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1280)
    useEffect(()=>{ const onR=()=>setW(window.innerWidth); window.addEventListener('resize', onR); return ()=>window.removeEventListener('resize', onR) },[])
    return w
  }
  const w = useWindowWidth()
  type BP = 'xs'|'sm'|'md'|'lg'
  const bp: BP = w >= 1024 ? 'lg' : w >= 768 ? 'md' : w >= 640 ? 'sm' : 'xs'
  const scale = bp==='lg'?1:bp==='md'?0.9:bp==='sm'?0.82:0.75
  const PERSON_FONT_PX = Math.max(12, Math.round(13*scale))
  // Dynamic name column: fit longest name with breathing room, clamped by breakpoint
  const MIN_NAME_COL_PX = bp==='lg'?100:bp==='md'?92:bp==='sm'?84:76
  const MAX_NAME_COL_PX = bp==='lg'?220:bp==='md'?200:bp==='sm'?180:160
  const measuredNameColPx = React.useMemo(()=>{
    try{
      if(!people || people.length===0) return MIN_NAME_COL_PX
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if(!ctx) return MIN_NAME_COL_PX
      // Approximate Tailwind's default sans stack with medium weight
      ctx.font = `500 ${PERSON_FONT_PX}px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif`
      let max = 0
      for(const name of people){ const w = ctx.measureText(name).width; if(w>max) max=w }
      // padding for left/right spacing and truncation breathing room
      const padding = 28 // px (pr-2 plus a little buffer)
      return Math.ceil(max + padding)
    }catch{ return MIN_NAME_COL_PX }
  }, [people, PERSON_FONT_PX, MIN_NAME_COL_PX])
  const NAME_COL_PX = Math.max(MIN_NAME_COL_PX, Math.min(MAX_NAME_COL_PX, measuredNameColPx))
  // Reduce header height by ~40% to tighten vertical space
  const HEADER_H = Math.round(54*0.6*scale)
  const HOUR_LABEL_PX = Math.max(9, Math.round(11*scale))
  // Keep chip label font stable (revert recent scaling change)
  const CHIP_FONT_PX = 12
  const NOW_FONT_PX = Math.max(9, Math.round(10*scale))
  const CHIP_H = Math.max(20, Math.round(24*scale))
  const hourEvery = bp==='lg'?1:bp==='md'?2:3

  const orderedPeople = useMemo(()=>{
    const firstStart=new Map<string,number>()
    people.forEach(p=>{ const starts=shifts.filter(s=>s.person===p).map(s=>toMin(s.start)); if(starts.length) firstStart.set(p, Math.min(...starts)) })
    return Array.from(firstStart.entries()).sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).map(([p])=>p)
  },[people,shifts])

  const colorMap = useMemo(()=>{
    const m=new Map<string,number>()
    const n=Math.max(1, orderedPeople.length)
    orderedPeople.forEach((p,i)=>{ const h=Math.round((i/n)*360); m.set(p,h) })
    return m
  },[orderedPeople])

  const [nowTick,setNowTick]=useState(Date.now())
  useEffect(()=>{ const id=setInterval(()=>setNowTick(Date.now()),30000); return ()=>clearInterval(id) },[])
  const nowTz = nowInTZ(tz.id)
  const displayNowMin = nowTz.minutes
  const isToday = fmtYMD(date)===nowTz.ymd
  const nowLeft=(displayNowMin/totalMins)*100
  const NAME_COL = `${NAME_COL_PX}px`
  // Tighter spacing for hour labels
  const LABEL_BOTTOM = Math.max(2, Math.round(4*scale))
  const LABEL_H = Math.max(10, Math.round(14*scale))

  const taskMap = useMemo(()=>{ const m=new Map<string,Task>(); for(const t of (tasks||[])) m.set(t.id,t); return m },[tasks])

  return (
    <div className="overflow-x-auto no-scrollbar w-full no-select">
      {/* Header (hidden in compact mode) */}
      {!compact && (
        <div className="grid sticky top-0 z-40 shadow-sm" style={{gridTemplateColumns:`${NAME_COL} 1fr`}}>
          <div className={dark?"bg-neutral-900":"bg-white"}></div>
          <div className={["relative border-b", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')} style={{height:HEADER_H}}>
            {showHeaderTitle && (
              <div className="absolute left-0 right-0 text-center font-bold" style={{ top: Math.max(2, Math.round(8*scale)), fontSize: Math.round(14*scale) }}>
                {dayKey} <span className={["ml-1",textSub].join(' ')}>{fmtYMD(date)}</span>
              </div>
            )}
            {/* Subtle AM background from 0:00 to 12:00 */}
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: 0, width: `calc(12 * (100% / ${COLS}))`, backgroundColor: dark? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }} />
            <div className="absolute left-0 right-0" style={{bottom:LABEL_BOTTOM,height:LABEL_H}}>
              {hourMarks.map((h,i)=> (
                (i % hourEvery === 0) && (
                  <div key={i} className="absolute text-left pl-0.5 leading-none pointer-events-none" style={{ left: `calc(${i} * (100% / ${COLS}))`, width: `calc(100% / ${COLS})` }}>
                    <div className={["font-bold hour-label tracking-tight",textSub].join(' ')} style={{ fontSize: HOUR_LABEL_PX }}>
                      {h===0?12:h>12?h-12:h}
                    </div>
                  </div>
                )
              ))}
            </div>
            {/* AM/PM chips removed in favor of subtle AM background */}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="relative">
        {isToday && (
          <div className="absolute inset-y-0 right-0 z-20 pointer-events-none" style={{ left: NAME_COL }}>
            <div className={["absolute -translate-x-1/2 inset-y-0 w-px", dark?"bg-red-400":"bg-red-500"].join(' ')} style={{ left: `${nowLeft}%` }} />
            <div className={["absolute -translate-x-1/2 -top-5 px-1.5 py-0.5 rounded-md shadow-sm", dark?"bg-red-400 text-black":"bg-red-500 text-white"].join(' ')} style={{ left: `${nowLeft}%`, fontSize: NOW_FONT_PX }}>
              {minToHHMM(displayNowMin)}
            </div>
          </div>
        )}

        {orderedPeople.map((person)=> (
          <div key={person} className="grid" style={{gridTemplateColumns:`${NAME_COL} 1fr`}}>
            <div className={["py-1.5 pr-2 font-medium sticky left-0 z-30 truncate border-b", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')} style={{ fontSize: PERSON_FONT_PX }}>{person}</div>
            <div className="relative" style={{
              backgroundImage:`linear-gradient(to right, ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'} 0, ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'} 50%, ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)'} 50%, ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)'} 100%)`,
              backgroundSize:`calc(100%/${COLS}) 100%`, backgroundRepeat:'repeat-x', backgroundPosition:'0 0'
            }}>
              {shifts.filter(s=>s.person===person).map(s=>{
                const hasPtoForDay = pto.some(p=>p.person===person && date>=parseYMD(p.startDate) && date<=parseYMD(p.endDate))
                const sMin=toMin(s.start); const eMinRaw=toMin(s.end); const eMin=eMinRaw>sMin?eMinRaw:1440
                const left=(sMin/totalMins)*100; const width=Math.max(0.5, ((eMin-sMin)/totalMins)*100)
                const H = (colorMap.get(person) ?? 0)
                const light=`hsla(${H},75%,70%,0.95)`; const darkbg=`hsla(${H},60%,28%,0.95)`; const darkbd=`hsl(${H},70%,55%)`
                const grayBg = dark ? 'rgba(120,120,120,0.6)' : 'rgba(200,200,200,0.95)'
                const grayBd = dark ? 'rgba(170,170,170,0.9)' : 'rgba(150,150,150,0.9)'

                const dur = eMin - sMin
                const baseColor = hasPtoForDay ? grayBg : (dark?darkbg:light)
                const baseBorder = hasPtoForDay ? grayBd : (dark?darkbd:`hsl(${H},65%,50%)`)
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
          const tColor = t?.color || (dark?darkbd:`hsl(${H},65%,50%)`)
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

                const chipTitleLines = pieces.filter(p=>p.kind==='seg').map(p=>p.title.replace(/^.* • /,'')).map((t,i)=>`${segs[i]?.taskId ? (taskMap.get(segs[i]!.taskId)?.name || 'Task') : 'Task'}: ${t}`)
                const chipTitle = `${s.person} • ${s.start}-${s.end}` + (chipTitleLines.length? `\n\nTasks:\n${chipTitleLines.join('\n')}`:'')

                // Simple overlap detection among this person's shifts for warning style
                const overlapsAnother = shifts.some(other=> other!==s && other.person===person && (
                  (()=>{ const aS=sMin, aE=eMin; const bS=toMin(other.start); const bERaw=toMin(other.end); const bE=bERaw>toMin(other.start)?bERaw:1440; return aS<bE && aE>bS })()
                ))
                const outline = overlapsAnother ? (dark? 'inset 0 0 0 2px rgba(255,0,0,0.6)' : 'inset 0 0 0 2px rgba(255,0,0,0.7)') : undefined
                return (
                  <div key={s.id} className="relative" title={chipTitle + (overlapsAnother? '\n\nWarning: overlaps another shift.' : '')}>
                    {pieces.map(p=>{
                      const pLeft = ((sMin + p.startOff)/totalMins)*100
                      const pW = (p.len/totalMins)*100
                      const borderCol = p.kind==='seg' && p.border ? p.border : baseBorder
                      return (
                        <div key={p.key} className="absolute rounded" style={{ left:`${pLeft}%`, width:`${pW}%`, height: CHIP_H, backgroundColor:p.color, boxShadow:`inset 0 0 0 1px ${borderCol}${outline?`, ${outline}`:''}` }} title={p.title} />
                      )
                    })}
                    <div className="absolute flex items-center justify-center px-2 truncate pointer-events-none" style={{ left:`${left}%`, width:`${width}%`, height: CHIP_H, fontSize: CHIP_FONT_PX }}>
                      {s.start}-{s.end}
                    </div>
                    {editMode && onRemove && (
                      <button onClick={(e)=>{ e.stopPropagation(); onRemove(s.id) }} title="Delete shift" className="absolute -top-1 w-4 h-4 rounded-full leading-[14px] text-[12px] text-center border bg-white/90 hover:bg-white" style={{ left:`calc(${left}% + ${width}% - 8px)` }}>×</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
