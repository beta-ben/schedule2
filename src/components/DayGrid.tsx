import React, { useEffect, useMemo, useState } from 'react'
import { COLS } from '../constants'
import { hourMarksForOffset, fmtYMD, minToHHMM, parseYMD, toMin, nowInTZ } from '../lib/utils'
import type { PTO, Shift } from '../types'

export default function DayGrid({ date, dayKey, people, shifts, pto, dark, tz, canEdit, editMode, onRemove }:{ 
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
}){
  const totalMins=24*60
  const tzOffset = tz.offset
  const hourMarks = hourMarksForOffset(tzOffset)
  const textSub = dark?"text-neutral-400":"text-neutral-500"

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

  return (
    <div className="overflow-x-auto w-full no-select">
      {/* Header row */}
      <div className="grid sticky top-0 z-10" style={{gridTemplateColumns:`150px 1fr`}}>
        <div className={dark?"bg-neutral-900":"bg-white"}></div>
        <div className="relative" style={{height:70}}>
          <div className="absolute top-2 left-0 right-0 text-center font-bold text-base">
            {dayKey} <span className={["ml-1",textSub].join(' ')}>{fmtYMD(date)}</span>
          </div>
          <div className="absolute left-0 right-0" style={{top:38,height:16}}>
            {hourMarks.map((h,i)=> (
              <div key={i} className="absolute text-left pl-1 leading-none pointer-events-none" style={{ left: `calc(${i} * (100% / ${COLS}))`, width: `calc(100% / ${COLS})` }}>
                <div className={["text-[11px] font-medium hour-label",textSub].join(' ')}>
                  {h===0?12:h>12?h-12:h}{h<12?"am":"pm"}
                </div>
              </div>
            ))}
          </div>

          {/* Header omits its own now label; label is rendered with the body line for perfect alignment */}
        </div>
      </div>

      {/* Body rows */}
      <div className="relative">
        {/* Single solid now line spanning all rows; anchor to right column by offsetting left column width */}
        {isToday && (
          <div className="absolute inset-y-0 left-[150px] right-0 z-20 pointer-events-none">
            <div className={["absolute -translate-x-1/2 inset-y-0 w-px", dark?"bg-red-400":"bg-red-500"].join(' ')} style={{ left: `${nowLeft}%` }} />
            <div className={["absolute -translate-x-1/2 -top-5 px-1.5 py-0.5 text-[10px] rounded-md shadow-sm", dark?"bg-red-400 text-black":"bg-red-500 text-white"].join(' ')} style={{ left: `${nowLeft}%` }}>
              {minToHHMM(displayNowMin)}
            </div>
          </div>
        )}

        {orderedPeople.map((person)=> (
          <div key={person} className="grid" style={{gridTemplateColumns:`150px 1fr`}}>
            <div className={["py-1.5 pr-2 text-[13px] font-medium sticky left-0 z-10", dark?"bg-neutral-900":"bg-white"].join(' ')}>{person}</div>
            <div className="relative" style={{
              backgroundImage:`linear-gradient(to right, ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'} 0, ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'} 50%, ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)'} 50%, ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)'} 100%)`,
              backgroundSize:`calc(100%/${COLS}) 100%`, backgroundRepeat:'repeat-x', backgroundPosition:'0 0'
            }}>
              {/** PTO: no row overlay; chips will be grayed out instead */}

              {shifts.filter(s=>s.person===person).map(s=>{
              const hasPtoForDay = pto.some(p=>p.person===person && date>=parseYMD(p.startDate) && date<=parseYMD(p.endDate))
              const sMin=toMin(s.start); const eMinRaw=toMin(s.end); const eMin=eMinRaw>sMin?eMinRaw:1440
              const left=(sMin/totalMins)*100; const width=Math.max(0.5, ((eMin-sMin)/totalMins)*100)
              const H = (colorMap.get(person) ?? 0)
              const light=`hsla(${H},75%,70%,0.95)`; const darkbg=`hsla(${H},60%,28%,0.95)`; const darkbd=`hsl(${H},70%,55%)`
              const grayBg = dark ? 'rgba(120,120,120,0.6)' : 'rgba(200,200,200,0.95)'
              const grayBd = dark ? 'rgba(170,170,170,0.9)' : 'rgba(150,150,150,0.9)'
              return (
                <div key={s.id}
                     className="absolute rounded text-[11px] border"
                     style={{
                       left:`${left}%`,
                       width:`${width}%`,
                       backgroundColor: hasPtoForDay ? grayBg : (dark?darkbg:light),
                       borderColor: hasPtoForDay ? grayBd : (dark?darkbd:`hsl(${H},65%,50%)`),
                       color: hasPtoForDay ? (dark? '#d4d4d8' : '#374151') : undefined,
                       zIndex:1
                     }}>
                  {editMode && onRemove && (
                    <button
                      onClick={(e)=>{ e.stopPropagation(); onRemove(s.id) }}
                      title="Delete shift"
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full leading-[14px] text-[12px] text-center border bg-white/90 hover:bg-white"
                      style={{ zIndex: 2 }}
                    >×</button>
                  )}
                  <div className="pl-3 pr-2 truncate" title={`${s.person} • ${s.start}-${s.end}`}>{s.start}-{s.end}</div>
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
