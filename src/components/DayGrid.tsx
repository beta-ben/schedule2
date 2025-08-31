import React, { useEffect, useMemo, useState } from 'react'
import { COLS, DAYS, TZ_OPTS } from '../constants'
import { fmtYMD, minToHHMM, parseYMD, toMin, nowInTZ, tzAbbrev } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'

export default function DayGrid({ date, dayKey, people, shifts, pto, dark, tz, canEdit, editMode, onRemove, showHeaderTitle = true, tasks, compact, agents }:{ 
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
  agents?: Array<{ id?: string; firstName?: string; lastName?: string; tzId?: string }>
}){
  const totalMins=24*60
  const contentRef = React.useRef<HTMLDivElement|null>(null)
  const [contentW, setContentW] = useState<number>(0)
  // Theme detection
  const [theme, setTheme] = useState<'system'|'light'|'dark'|'night'|'noir'|'prism'>(()=>{
    try{ const v = localStorage.getItem('schedule_theme'); return (v==='unicorn') ? 'system' : ((v as any) || 'system') }catch{ return 'system' }
  })
  useEffect(()=>{
    const initFromDom = ()=>{
      const el = document.querySelector('[data-theme]') as HTMLElement | null
      const v = (el?.getAttribute('data-theme') as any) || null
      if(v) setTheme(v)
    }
    initFromDom()
  const onEvt = (e: Event)=>{ const ce = e as CustomEvent; if(ce?.detail?.value){ const v = ce.detail.value; setTheme(v==='unicorn' ? 'system' : v) } }
    window.addEventListener('schedule:set-theme', onEvt as any)
    return ()=> window.removeEventListener('schedule:set-theme', onEvt as any)
  }, [])
  useEffect(()=>{
    const upd = ()=>{ if(contentRef.current){ setContentW(contentRef.current.clientWidth) } }
    upd()
    window.addEventListener('resize', upd)
    return ()=> window.removeEventListener('resize', upd)
  },[])
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
  const HEADER_H = Math.round(54*0.5*scale)
  const HOUR_LABEL_PX = Math.max(9, Math.round(11*scale))
  // Keep chip label font stable (revert recent scaling change)
  const CHIP_FONT_PX = 12
  // Make the floating "now" clock the same height as hour labels
  const NOW_FONT_PX = HOUR_LABEL_PX
  const CHIP_H = Math.max(20, Math.round(24*scale))
  const CHIP_RADIUS = 6
  const hourEvery = bp==='lg'?1:bp==='md'?2:3
  // Background columns: when all 24 labels are visible (hourEvery===1) show half-hour columns; otherwise hour columns
  const colLight = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
  const colDark  = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'
  const unitPct = (hourEvery===1) ? (100/(COLS*2)) : (100/COLS) // width of one column in % of total width

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
  useEffect(()=>{
    let to: number | undefined
    let iv: number | undefined
    const poke = ()=> setNowTick(Date.now())
    const schedule = ()=>{
      if(iv) clearInterval(iv)
      if(to) clearTimeout(to)
      const now = Date.now()
      const msToNextMinute = 60000 - (now % 60000)
      to = window.setTimeout(()=>{
        poke()
        iv = window.setInterval(poke, 60000)
      }, msToNextMinute)
    }
    const onVis = ()=>{ if(document.visibilityState==='visible'){ poke(); schedule() } }
    poke()
    schedule()
    document.addEventListener('visibilitychange', onVis)
    return ()=>{ if(iv) clearInterval(iv); if(to) clearTimeout(to); document.removeEventListener('visibilitychange', onVis) }
  },[])
  const nowTz = nowInTZ(tz.id)
  const displayNowMin = nowTz.minutes
  const isToday = fmtYMD(date)===nowTz.ymd
  const nowLeft=(displayNowMin/totalMins)*100
  const NAME_COL = `${NAME_COL_PX}px`
  // Tighter spacing for hour labels
  const LABEL_BOTTOM = Math.max(2, Math.round(4*scale))
  const LABEL_H = Math.max(10, Math.round(14*scale))

  const taskMap = useMemo(()=>{ const m=new Map<string,Task>(); for(const t of (tasks||[])) m.set(t.id,t); return m },[tasks])
  // Hover state for tooltips (track which shift and cursor x within row)
  const [hover, setHover] = useState<{ id: string|null; x: number }>({ id: null, x: 0 })
  // Global hover time indicator for schedule: blue line and label below
  const [hoverX, setHoverX] = useState<number|null>(null)
  const [hoverActive, setHoverActive] = useState(false)
  const tzMap = useMemo(()=>{ const m=new Map<string,number>(); for(const o of TZ_OPTS){ m.set(o.id, o.offset) } return m }, [])
  const agentFor = (fullName: string)=>{
    const n = (fullName||'').trim().toLowerCase()
    return (agents||[]).find(a=> `${a.firstName||''} ${a.lastName||''}`.trim().toLowerCase()===n)
  }
  const idxOfDay = (d:string)=> DAYS.indexOf(d as any)
  // (unicorn hue hashing removed)

  return (
    <div className="overflow-x-auto no-scrollbar w-full no-select" style={{ overflowY: 'visible' }}>
      {/* Header (hidden in compact mode) */}
    {!compact && (
  <div className={["relative sticky top-0 z-40 shadow-sm px-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].filter(Boolean).join(' ')} style={{height:HEADER_H, display:'flex', alignItems:'center'}}>
          {showHeaderTitle && (
            <div className={"absolute left-2 right-2 text-center font-bold"} style={{ top: Math.max(0, Math.round(6*scale)), fontSize: Math.round(13*scale), lineHeight: 1 }}>
              {dayKey} <span className={["ml-1",textSub].join(' ')}>{fmtYMD(date)}</span>
            </div>
          )}
          {/* Subtle AM background from 0:00 to 12:00 (aligned to content width) - hidden in Night theme */}
            {theme!=='night' && (
            <div className="absolute inset-y-0 left-2 right-2 pointer-events-none">
              <div className="absolute inset-y-0 left-0" style={{ width: `calc(12 * (100% / ${COLS}))`, backgroundColor: (dark? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)') }} />
            </div>
          )}
            {theme!=='night' && (
            <div className="absolute left-2 right-2" style={{bottom:LABEL_BOTTOM,height:LABEL_H}}>
              {hourMarks.map((h,i)=> (
                (i % hourEvery === 0) && (
                  <div key={i} className={"absolute text-left pl-0.5 leading-none pointer-events-none"} style={{ left: `calc(${i} * (100% / ${COLS}))`, width: `calc(100% / ${COLS})` }}>
                    <div className={["font-bold hour-label tracking-tight",textSub].join(' ')} style={{ fontSize: HOUR_LABEL_PX }}>
                      {h===0?12:h>12?h-12:h}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
          {/* AM/PM chips removed in favor of subtle AM background */}
        </div>
      )}

      {/* Body */}
  <div
    className="relative px-2"
    ref={contentRef}
    onMouseLeave={()=>{ setHoverActive(false); setHoverX(null) }}
    onMouseMove={(e)=>{
      const host = contentRef.current
      if(!host) return
      const rect = host.getBoundingClientRect()
      const x = e.clientX - rect.left
      if(x < 0 || x > rect.width){ setHoverActive(false); setHoverX(null); return }
      setHoverActive(true)
      setHoverX(x)
    }}
  style={{ paddingBottom: Math.max(8, NOW_FONT_PX + 6) }}
  >
        {isToday && (
          <div className="absolute inset-y-0 left-0 right-0 z-20 pointer-events-none">
            <div className={["absolute -translate-x-1/2 inset-y-0 w-px", dark?"bg-red-400":"bg-red-500"].join(' ')} style={{ left: `${nowLeft}%` }} />
            <div className={["absolute -translate-x-1/2 top-full mt-1 px-1.5 py-0.5 rounded-md shadow-sm", dark?"bg-red-400 text-black":"bg-red-500 text-white"].join(' ')} style={{ left: `${nowLeft}%`, fontSize: NOW_FONT_PX }}>
              {minToHHMM(displayNowMin)}
            </div>
          </div>
        )}

        {/* Global hover time indicator: blue line and label below */}
        {hoverActive && hoverX!=null && (
          <div className="absolute inset-y-0 left-0 right-0 z-30 pointer-events-none">
            <div className="absolute inset-y-0" style={{ left: hoverX, width: 1, background: 'rgba(59,130,246,0.9)' }} />
            <div className={["absolute -translate-x-1/2 top-full mt-0.5 px-1.5 py-0.5 rounded text-white text-[10px]", dark?"bg-blue-500":"bg-blue-600"].join(' ')} style={{ left: hoverX }}>
              {(()=>{
                const host = contentRef.current
                const w = host?.getBoundingClientRect().width || 1
                const total = 24*60
                const min = Math.max(0, Math.min(total-1, Math.round((hoverX/w) * total)))
                const hh = Math.floor((min/60)).toString().padStart(2,'0')
                const mm = (min%60).toString().padStart(2,'0')
                // Count on-deck = active at this minute in current day
                let count = 0
                for(const s of shifts){
                  const sMin = toMin(s.start)
                  const eRaw = toMin(s.end)
                  const eMin = eRaw > sMin ? eRaw : 1440
                  if(min >= sMin && min < eMin) count++
                }
                return `${hh}:${mm} • ${count} on deck`
              })()}
            </div>
          </div>
        )}

        {orderedPeople.map((person)=> (
          <div key={person} className="relative" style={{ height: CHIP_H + 6 }}>
            {/* Background columns aligned to content width (match header columns) - hidden in Night theme */}
            {theme!=='night' && (
              <div
                className="absolute inset-y-0 left-0 right-0 pointer-events-none"
                style={{
                  backgroundImage: `repeating-linear-gradient(to right, ${colLight} 0, ${colLight} ${unitPct}%, ${colDark} ${unitPct}%, ${colDark} ${unitPct*2}%)`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '100% 100%'
                }}
              >
                {/* unicorn overlay removed */}
              </div>
            )}
              {shifts.filter(s=>s.person===person).sort((a,b)=>toMin(a.start)-toMin(b.start)).map((s, idx, arr)=>{
                const hasPtoForDay = pto.some(p=>p.person===person && date>=parseYMD(p.startDate) && date<=parseYMD(p.endDate))
                const sMin=toMin(s.start); const eMinRaw=toMin(s.end); const eMin=eMinRaw>sMin?eMinRaw:1440
                const left=(sMin/totalMins)*100; const width=Math.max(0.5, ((eMin-sMin)/totalMins)*100)
                const endPct = left + width
                const H = (colorMap.get(person) ?? 0)
                const light=`hsla(${H},75%,70%,0.95)`; const darkbg=`hsla(${H},60%,28%,0.95)`; const darkbd=`hsl(${H},70%,55%)`
                const grayBg = dark ? 'rgba(120,120,120,0.4)' : 'rgba(180,180,180,0.85)'
                // Dimmer border for PTO
                const grayBd = dark ? 'rgba(160,160,160,0.55)' : 'rgba(160,160,160,0.5)'

                const dur = eMin - sMin
                // Theme-driven chip colors
                const isNight = theme==='night'
                const isNoir = theme==='noir'
                // unicorn theme removed
                let baseColor = hasPtoForDay ? grayBg : (dark?darkbg:light)
                let baseBorder = hasPtoForDay ? grayBd : (dark?darkbd:`hsl(${H},65%,50%)`)
                if(isNight){
                  // Night theme: chips go fully black; use a muted deep-red border
                  baseColor = '#000'
                  baseBorder = 'rgba(239,68,68,0.55)'
                } else if(isNoir){
                  // Noir theme: chips go fully black; use a muted light border
                  baseColor = '#000'
                  baseBorder = 'rgba(255,255,255,0.35)'
                }
                const segs = (Array.isArray(s.segments)? s.segments: []).slice().sort((a,b)=>a.startOffsetMin-b.startOffsetMin)
                const chipTitleLines = segs.map(seg=>{
                  const t = taskMap.get(seg.taskId)
                  const stAbs = sMin + Math.max(0, Math.min(dur, seg.startOffsetMin))
                  const enAbs = sMin + Math.max(0, Math.min(dur, seg.startOffsetMin + seg.durationMin))
                  return `${t?.name || 'Task'}: ${minToHHMM(stAbs)}–${minToHHMM(enAbs)}`
                })
                const chipTitle = `${s.person} • ${s.start}-${s.end}` + (chipTitleLines.length? `\n\nTasks:\n${chipTitleLines.join('\n')}`:'')

                // Simple overlap detection among this person's shifts for warning style
                const overlapsAnother = shifts.some(other=> other!==s && other.person===person && (
                  (()=>{ const aS=sMin, aE=eMin; const bS=toMin(other.start); const bERaw=toMin(other.end); const bE=bERaw>toMin(other.start)?bERaw:1440; return aS<bE && aE>bS })()
                ))
                const outline = overlapsAnother ? (dark? 'inset 0 0 0 2px rgba(255,0,0,0.6)' : 'inset 0 0 0 2px rgba(255,0,0,0.7)') : undefined
                return (
                  <div
                    key={s.id}
                    className="relative"
                    title={chipTitle + (overlapsAnother? '\n\nWarning: overlaps another shift.' : '')}
                    onMouseEnter={()=>setHover({ id: s.id, x: 0 })}
                    onMouseLeave={()=>setHover({ id: null, x: 0 })}
                    onMouseMove={(e)=>{
                      const el = e.currentTarget as HTMLElement
                      const r = el.getBoundingClientRect()
                      const raw = e.clientX - r.left
                      const clamped = Math.max(8, Math.min(raw, r.width - 8))
                      setHover(h=> h.id===s.id ? { id: s.id, x: clamped } : h)
                    }}
                  >
                    {/* Unified base chip */}
                    {(() => {
                      let bgImage: string | undefined
                      let prism = false
                      // Prism theme: vivid animated chip gradient with person-based hue offset
                      if(theme==='prism' && !hasPtoForDay){
                        prism = true
                        const hue = (H+20) % 360
                        // Slightly darker for readability & consistency
                        bgImage = `linear-gradient(90deg, hsl(${hue} 88% 62% / 0.78), hsl(${(hue+50)%360} 84% 58% / 0.74), hsl(${(hue+100)%360} 82% 62% / 0.78))`
                      }
                      if(hasPtoForDay){
                        // Keep PTO chips grayed out without stripes for cleaner look
                        const darken  = `linear-gradient(0deg, ${dark?'rgba(0,0,0,0.18)':'rgba(0,0,0,0.08)'} 0%, ${dark?'rgba(0,0,0,0.18)':'rgba(0,0,0,0.08)'} 100%)`
                        bgImage = darken
                      }
                      const style: React.CSSProperties & Record<string, any> = {
                        left: `${left}%`,
                        width: `${width}%`,
                        top: 2,
                        height: CHIP_H,
                        backgroundColor: baseColor,
                        boxShadow: `inset 0 0 0 1px ${baseBorder}` + (outline ? `, ${outline}` : ''),
                        borderRadius: CHIP_RADIUS,
                        ...(bgImage ? { backgroundImage: bgImage } : {}),
                        ...(prism ? { backgroundColor: 'rgba(0,0,0,0.08)', backgroundBlendMode: 'multiply' } : {}),
                        ...(prism ? { backgroundSize: '300% 100%', animation: 'prismChip 10s linear infinite', animationDelay: `${(H%60)/30}s` } : {}),
                      }
                      return <div className="absolute" style={style} />
                    })()}


                    {/* Posture overlays: striped normally; animated gradients in Prism */}
                    {segs.map(seg => {
                      const stOff = Math.max(0, Math.min(dur, seg.startOffsetMin))
                      const enOff = Math.max(0, Math.min(dur, seg.startOffsetMin + seg.durationMin))
                      if(enOff <= stOff) return null
                      const segLeft = ((sMin + stOff)/totalMins)*100
                      const segW = ((enOff - stOff)/totalMins)*100
                      const t = taskMap.get(seg.taskId)
                      const tColor = t?.color || (dark?darkbd:`hsl(${H},65%,50%)`)
                      // Prism: animated gradient ribbon; Night/Noir: on-theme stripes; Others: subtle stripes
                      const bgImage = (
                        theme==='prism'
                          ? `linear-gradient(90deg,
                              color-mix(in oklab, ${tColor} 85%, #000 15%) 0%,
                              color-mix(in oklab, ${tColor} 65%, #000 35%) 50%,
                              color-mix(in oklab, ${tColor} 85%, #000 15%) 100%
                            )`
                          : isNight
                            ? 'repeating-linear-gradient(135deg, rgba(239,68,68,0.28) 0 6px, transparent 6px 14px)'
                            : isNoir
                              ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 6px, transparent 6px 14px)'
                              : `repeating-linear-gradient(135deg, color-mix(in oklab, ${tColor} 40%, ${dark?'#0a0a0a':'#ffffff'} 60%) 0 6px, transparent 6px 14px)`
                      )
                      const style: React.CSSProperties & { [k:string]: any } = {
                        left: `${segLeft}%`,
                        width: `${segW}%`,
                        // Align overlays to the chip area; border frame remains on top
                        top: 2,
                        height: CHIP_H,
                        backgroundImage: bgImage,
                        ...(theme==='prism' ? { backgroundSize: '300% 100%', animation: 'prismChip 12s ease-in-out infinite', backgroundBlendMode: 'multiply' } : {}),
                        pointerEvents: 'none',
                        borderRadius: CHIP_RADIUS,
                        opacity: theme==='prism' ? 0.7 : (isNight ? 0.35 : isNoir ? 0.25 : 0.45),
                      }
                      return <div key={seg.id} className="absolute" style={style} />
                    })}

                    {/* Always-on top border frame to keep the main chip border visible above overlays */}
                    <div
                      className="absolute pointer-events-none"
                      style={{ left:`${left}%`, top: 2, width:`${width}%`, height: CHIP_H, boxShadow: (`inset 0 0 0 1px ${baseBorder}` + (outline ? `, ${outline}` : '')), borderRadius: CHIP_RADIUS, zIndex: 5 }}
                    />

                    {/* Center label: first name only; hide if chip too narrow */}
                    {(()=>{
                      const pxPerMin = contentW>0 ? (contentW/totalMins) : 0
                      const chipPx = dur * pxPerMin
                      const SHOW_MIN_PX = 60
                      const show = chipPx >= SHOW_MIN_PX
                      const prismText = theme==='prism' && !hasPtoForDay
                      return (
                        <div
                          className={[
                            "absolute flex items-center justify-center px-2 truncate pointer-events-none",
                            hasPtoForDay ? (dark?"text-neutral-500":"text-neutral-500") : (prismText?"text-white":"")
                          ].join(' ')}
                          style={{
                            left:`${left}%`, top: 2, width:`${width}%`, height: CHIP_H, fontSize: CHIP_FONT_PX,
                            ...(prismText ? { textShadow: '0 1px 1px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.35)' } : {})
                          }}
                        >
                          {show ? ((person||'').split(' ')[0] || person) : ''}
                        </div>
                      )
                    })()}

                    {/* Tooltip */}
          {hover.id===s.id && (
                      <div
            className={["absolute z-40 px-2 py-1 rounded-md text-xs shadow-lg border", dark?"bg-neutral-900/95 border-neutral-700 text-neutral-100":"bg-white/95 border-neutral-300 text-neutral-900"].join(' ')}
            style={{ left: hover.x, top: 2, transform:'translate(-50%, calc(-100% - 6px))' }}
                        role="tooltip"
                      >
                        <div className="font-semibold mb-1">{person}</div>
                        <div className={dark?"text-neutral-300":"text-neutral-700"}>Shift: {s.start}–{s.end}</div>
                        {(()=>{
                          const a = agentFor(person)
                          if(!a || !a.tzId) return null
                          const agentOff = tzMap.get(a.tzId) ?? 0
                          const viewOff = tz.offset
                          const deltaMin = (agentOff - viewOff) * 60
                          const sd = idxOfDay(s.day)
                          const ed = idxOfDay(((s as any).endDay || s.day) as any)
                          const sAbs = (sd<0?0:sd)*1440 + toMin(s.start)
                          let eAbs = (ed<0?sd:ed)*1440 + (s.end==='24:00'?1440:toMin(s.end))
                          if(eAbs <= sAbs) eAbs += 1440
                          const ns = sAbs + deltaMin
                          const ne = eAbs + deltaMin
                          const sDay = DAYS[((Math.floor(ns/1440)%7)+7)%7] as any
                          const eDay = DAYS[((Math.floor(ne/1440)%7)+7)%7] as any
                          const sMinLoc = ((ns%1440)+1440)%1440
                          const eMinLoc = ((ne%1440)+1440)%1440
                          return (
                            <div className={dark?"text-neutral-300":"text-neutral-700"}>
                              Local: {sDay} {minToHHMM(sMinLoc)}–{eDay} {minToHHMM(eMinLoc)} <span className="opacity-70">({tzAbbrev(a.tzId)})</span>
                            </div>
                          )
                        })()}
                        {segs.length>0 && (
                          <div className="mt-1">
                            <ul className="space-y-0.5">
                              {segs.map(seg=>{
                                const t = taskMap.get(seg.taskId)
                                const tColor = t?.color || (dark?darkbd:`hsl(${H},65%,50%)`)
                                const stAbs = minToHHMM(sMin + Math.max(0, Math.min(dur, seg.startOffsetMin)))
                                const enAbs = minToHHMM(sMin + Math.max(0, Math.min(dur, seg.startOffsetMin + seg.durationMin)))
                                return (
                                  <li key={seg.id} className="flex items-center gap-2">
                                    <span className="inline-block w-3 h-3 rounded-sm border" style={{ background:tColor, borderColor: tColor }} />
                                    <span className="truncate">
                                      <span className="font-medium">{t?.name || 'Task'}</span>
                                      <span className={"ml-1 "+(dark?"text-neutral-300":"text-neutral-700")}>{stAbs}–{enAbs}</span>
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {editMode && onRemove && (
                      <button onClick={(e)=>{ e.stopPropagation(); onRemove(s.id) }} title="Delete shift" className="absolute -top-1 w-4 h-4 rounded-full leading-[14px] text-[12px] text-center border bg-white/90 hover:bg-white" style={{ left:`calc(${left}% + ${width}% - 8px)` }}>×</button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }
