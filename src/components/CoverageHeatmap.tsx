import React from 'react'
import { DAYS } from '../constants'
import { convertShiftsToTZ, toMin } from '../lib/utils'
import type { Shift } from '../types'

export default function CoverageHeatmap({
  dark,
  tz,
  weekStart,
  shifts,
  visibleAgentNames,
  visibleDays = 7,
  scrollChunk = 0,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  shifts: Shift[]
  visibleAgentNames: string[]
  visibleDays?: number
  scrollChunk?: number
}){
  // Collapsed state (persisted)
  const [collapsed, setCollapsed] = React.useState<boolean>(()=>{
    try{ return localStorage.getItem('coverage_heatmap_collapsed') === '1' }catch{ return false }
  })
  React.useEffect(()=>{ try{ localStorage.setItem('coverage_heatmap_collapsed', collapsed ? '1' : '0') }catch{} }, [collapsed])
  // Filter to visible agents
  const visibleSet = React.useMemo(()=> new Set(visibleAgentNames), [visibleAgentNames])
  const tzShifts = React.useMemo(()=> convertShiftsToTZ(shifts, tz.offset).filter(s=> visibleSet.has(s.person)), [shifts, tz.offset, visibleSet])

  // Build coverage counts per day/hour (0..6, 0..23)
  const counts = React.useMemo(()=>{
    const grid = Array.from({length:7},()=> new Array<number>(24).fill(0))
    for(const s of tzShifts){
      const dIdx = DAYS.indexOf(s.day as any)
      if(dIdx<0) continue
      const sMin = toMin(s.start)
      const eMinRaw = toMin(s.end)
      const eMin = eMinRaw > sMin ? eMinRaw : 1440
      for(let h=0; h<24; h++){
        const hStart = h*60, hEnd = (h+1)*60
        const has = Math.max(sMin, hStart) < Math.min(eMin, hEnd)
        if(has) grid[dIdx][h]++
      }
    }
    return grid
  }, [tzShifts])

  const maxCount = React.useMemo(()=> counts.reduce((m,col)=> Math.max(m, ...col), 0), [counts])
  const colorFor = (v:number)=>{
    if(maxCount<=0) return dark? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
    const t = v / maxCount
    // Black -> Red -> Yellow ramp
    const ramp = [
      [0,0,0],       // black
      [239,68,68],   // red-500
      [250,204,21],  // yellow-400
    ]
    const seg = t<=0.5 ? 0 : 1
    const lt = t<=0.5 ? (t/0.5) : ((t-0.5)/0.5)
    const a = ramp[seg]
    const b = ramp[seg+1] || ramp[seg]
    const r = Math.round(a[0]*(1-lt) + b[0]*lt)
    const g = Math.round(a[1]*(1-lt) + b[1]*lt)
    const bch = Math.round(a[2]*(1-lt) + b[2]*lt)
    return `rgba(${r},${g},${bch},${dark?0.9:0.95})`
  }

  // Horizontal scaling to align with ribbons
  const daysVisible = Math.min(7, Math.max(1, visibleDays||7))
  const scaleWidthPct = (7 / daysVisible) * 100
  const scrollerRef = React.useRef<HTMLDivElement|null>(null)
  React.useEffect(()=>{
    const el = scrollerRef.current
    if(!el) return
    const chunks = Math.max(1, Math.ceil(7 / daysVisible))
    const idx = Math.min(chunks-1, Math.max(0, scrollChunk||0))
    const target = Math.min(el.scrollWidth - el.clientWidth, Math.round(idx * el.clientWidth))
    el.scrollTo({ left: target, behavior: 'smooth' })
  }, [scrollChunk, daysVisible])

  const CELL_H = 7 // px (slightly taller for visibility)
  const GAP_Y = 1
  const HEADER_H = 18

  return (
    <div className={["sticky bottom-0 z-30", dark?"bg-neutral-950/92":"bg-white/95","backdrop-blur","border-t", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
      <div className="px-2 py-1.5">
        <div className="relative h-6">
          <div className={["absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs font-medium", dark?"text-neutral-200":"text-neutral-700"].join(' ')}>
            <span>Coverage</span>
            <button
              onClick={()=> setCollapsed(v=>!v)}
              aria-expanded={!collapsed}
              className={["inline-flex items-center justify-center w-6 h-6 rounded-full border", dark?"bg-neutral-900 border-neutral-700 text-neutral-200 hover:bg-neutral-800":"bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
              title={collapsed? 'Expand' : 'Collapse'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {collapsed ? (
                  <polyline points="18 15 12 9 6 15"></polyline>
                ) : (
                  <polyline points="6 9 12 15 18 9"></polyline>
                )}
              </svg>
            </button>
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-70">max {maxCount || 0}</div>
        </div>
        {!collapsed && (
        <div className="flex items-stretch gap-1 mt-1">
          {/* Heatmap scroller on the left */}
          <div ref={scrollerRef} className="flex-1 overflow-x-auto no-scrollbar">
            <div style={{ width: `${scaleWidthPct}%` }}>
              {/* Day headers */}
              <div className="relative" style={{ height: HEADER_H }}>
                {DAYS.map((d,i)=>{
                  const left = (i/7)*100
                  const width = (1/7)*100
                  return (
                    <div key={d} className={["absolute text-center text-[11px]", dark?"text-neutral-300":"text-neutral-600"].join(' ')} style={{ left: `${left}%`, width: `${width}%`, lineHeight: `${HEADER_H}px` }}>{d}</div>
                  )
                })}
              </div>
              {/* Heatmap grid */}
              <div className="relative" style={{ height: (CELL_H*24 + GAP_Y*23) }}>
                {DAYS.map((d,di)=>{
                  const left = (di/7)*100
                  const width = (1/7)*100
                  return (
                    <div key={d} className="absolute inset-y-0" style={{ left: `${left}%`, width: `${width}%` }}>
                      {Array.from({length:24},(_,h)=>h).map(h=>{
                        const top = h*(CELL_H+GAP_Y)
                        const v = counts[di][h]
                        const title = `${d} — ${String(h).padStart(2,'0')}:00 to ${String(h+1).padStart(2,'0')}:00 • ${v} on-duty`
                        return <div key={h} className="w-full" style={{ position:'absolute', top, height: CELL_H, backgroundColor: colorFor(v), borderRadius: 2 }} title={title} />
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {/* Right mini-hour scale */}
          <div className="shrink-0" style={{ width: 44 }}>
            <div className="h-[20px]" />
            <div className="relative" style={{ height: (CELL_H*24 + GAP_Y*23) }}>
              {[0,6,12,18,24].map(h=>{
                const top = ((h/24) * 100)
                return (
                  <div key={h} className={["absolute right-0 translate-y-[-50%] text-[10px]", dark?"text-neutral-400":"text-neutral-500"].join(' ')} style={{ top: `${top}%` }}>{h===0? '12a' : h<12? `${h}a` : h===12? '12p' : `${h-12}p`}</div>
                )
              })}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
