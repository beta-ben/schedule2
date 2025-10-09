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
  headerRight,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  shifts: Shift[]
  visibleAgentNames: string[]
  visibleDays?: number
  scrollChunk?: number
  headerRight?: React.ReactNode
}){
  // Collapsed state (persisted)
  const [collapsed, setCollapsed] = React.useState<boolean>(()=>{
    try{
      const v = localStorage.getItem('coverage_heatmap_collapsed')
      if(v === '1') return true
      if(v === '0') return false
      // Default collapsed when no preference stored
      return true
    }catch{ return true }
  })
  React.useEffect(()=>{
    try{ localStorage.setItem('coverage_heatmap_collapsed', collapsed ? '1' : '0') }catch{}
    // announce to parent listeners for layout adjustments
    try{ window.dispatchEvent(new CustomEvent('coverage:collapsed', { detail: { value: collapsed } })) }catch{}
  }, [collapsed])
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
  const flatStats = React.useMemo(()=>{
    const pts: Array<{ dIdx:number; h:number; v:number }> = []
    for(let di=0; di<7; di++){
      for(let h=0; h<24; h++) pts.push({ dIdx: di, h, v: counts[di][h] })
    }
    let min = Infinity, max = 0
    for(const p of pts){ if(p.v < min) min = p.v; if(p.v > max) max = p.v }
    const maxPts = max>0 ? pts.filter(p=> p.v===max) : []
    const minPts = pts.filter(p=> p.v===min)
    const zeroHours = pts.filter(p=> p.v===0).length
    const sum = pts.reduce((s,p)=> s+p.v, 0)
    const avg = pts.length ? (sum/pts.length) : 0
    // totals by day for quick insights
    const dayTotals = Array.from({length:7},(_,di)=> counts[di].reduce((s,v)=> s+v, 0))
    const bestDayIdx = dayTotals.reduce((bi,tot,i)=> tot>(dayTotals[bi]??-Infinity) ? i : bi, 0)
    const worstDayIdx = dayTotals.reduce((wi,tot,i)=> tot<(dayTotals[wi]??Infinity) ? i : wi, 0)
    return { pts, minCount: Number.isFinite(min)? min : 0, maxCount: max, maxPts, minPts, zeroHours, avg, bestDayIdx, worstDayIdx, dayTotals }
  }, [counts])
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
  // Name column width (to align heatmap under the schedule scroller)
  const [nameColPx, setNameColPx] = React.useState<number>(()=>{
    try{
      const v = getComputedStyle(document.documentElement).getPropertyValue('--schedule-name-col-px')
      const n = parseInt(v||'160',10); return Number.isFinite(n)? n : 160
    }catch{ return 160 }
  })
  // Measure the ribbons inner width (in pixels) to ensure exact per-day column widths
  const [ribbonsInnerW, setRibbonsInnerW] = React.useState<number|null>(null)
  const [dayRects, setDayRects] = React.useState<Array<{ left:number; width:number }> | null>(null)
  React.useEffect(()=>{
    const onNameCol = (e: Event)=>{ try{ const px = (e as any).detail?.px; if(typeof px==='number') setNameColPx(px) }catch{} }
    window.addEventListener('schedule:namecol', onNameCol as any)
    const inner = document.querySelector('[data-ribbons-inner="1"]') as HTMLElement | null
    const measure = ()=>{
      if(!inner) return
      setRibbonsInnerW(inner.scrollWidth || inner.clientWidth)
      try{
        const rectInner = inner.getBoundingClientRect()
        const nodes = Array.from(inner.querySelectorAll('[data-day-col]')) as HTMLElement[]
        if(nodes.length===7){
          const arr = nodes.map(n=>{ const r=n.getBoundingClientRect(); return { left: r.left-rectInner.left, width: r.width } })
          setDayRects(arr)
        }
      }catch{}
    }
    measure()
    const ro = 'ResizeObserver' in window ? new (window as any).ResizeObserver(()=> measure()) : null
    if(ro && inner){ ro.observe(inner) }
    return ()=>{ try{ ro && inner && ro.unobserve(inner) }catch{}; window.removeEventListener('schedule:namecol', onNameCol as any) }
  }, [visibleDays])

  return (
    <div className={["sticky bottom-0 z-30", dark?"bg-neutral-950/92":"bg-white/95","backdrop-blur","border-t", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
      <div className="px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className={["flex items-center gap-2 text-xs font-medium", dark?"text-neutral-200":"text-neutral-700"].join(' ')}>
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
            {(()=>{
              const fmt = (h:number)=> h===0? '12a' : h<12? `${h}a` : h===12? '12p' : `${h-12}p`
              const maxPtsLabel = flatStats.maxPts.slice(0,3).map(p=> `${DAYS[p.dIdx]} ${fmt(p.h)}`).join(', ')
              const minPtsLabel = flatStats.minPts.slice(0,3).map(p=> `${DAYS[p.dIdx]} ${fmt(p.h)}`).join(', ')
              return (
                <div className="flex items-center gap-1">
                  <span
                    className={["px-1.5 py-0.5 rounded border", dark?"border-neutral-700 bg-neutral-900 text-neutral-300":"border-neutral-300 bg-white text-neutral-700"].join(' ')}
                    title={maxPtsLabel ? `Max at: ${maxPtsLabel}` : 'No data'}
                  >Max {flatStats.maxCount}</span>
                  <span
                    className={["px-1.5 py-0.5 rounded border", dark?"border-neutral-700 bg-neutral-900 text-neutral-300":"border-neutral-300 bg-white text-neutral-700"].join(' ')}
                    title={minPtsLabel ? `Min at: ${minPtsLabel}` : 'No data'}
                  >Min {flatStats.minCount}</span>
                  <span
                    className={["px-1.5 py-0.5 rounded border hidden sm:inline", dark?"border-neutral-700 bg-neutral-900 text-neutral-300":"border-neutral-300 bg-white text-neutral-700"].join(' ')}
                    title={`Avg across all hours`}
                  >Avg {flatStats.avg.toFixed(1)}</span>
                </div>
              )
            })()}
          </div>
          {headerRight && (
            <div className="flex items-center gap-2 text-[10px] opacity-80 ml-auto">
              {headerRight}
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="flex items-stretch gap-1 mt-1">
            {/* Left label column matches schedule name column width */}
            <div className="shrink-0" style={{ width: nameColPx }}>
              <div className="h-[20px]" />
              <div className="relative" style={{ height: (CELL_H*24 + GAP_Y*23) }}>
                {[0,6,12,18,24].map(h=>{
                  const totalH = (CELL_H*24 + GAP_Y*23)
                  const topPx = (h===24) ? totalH : (h*(CELL_H+GAP_Y) + (CELL_H/2))
                  const trans = (h===24) ? '-translate-y-[100%]' : '-translate-y-1/2'
                  const label = (h===0? '12a' : h<12? `${h}a` : h===12? '12p' : `${h-12}p`)
                  return (
                    <div
                      key={h}
                      className={["absolute right-2 text-right text-[10px]", trans, dark?"text-neutral-400":"text-neutral-500"].join(' ')}
                      style={{ top: topPx }}
                    >{label}</div>
                  )
                })}
              </div>
            </div>
            {/* Heatmap scroller aligned with ribbons above */}
            <div ref={scrollerRef} className="flex-1 overflow-x-auto no-scrollbar">
              <div style={ribbonsInnerW? { width: ribbonsInnerW } : { width: `${scaleWidthPct}%` }}>
                {/* Heatmap grid only (day labels are shown above in the ribbons header) */}
                <div className="relative" style={{ height: (CELL_H*24 + GAP_Y*23) }}>
                  {DAYS.map((d,di)=>{
                    const left = dayRects ? dayRects[di]?.left : (ribbonsInnerW? (di*(ribbonsInnerW/7)) : undefined)
                    const width = dayRects ? dayRects[di]?.width : (ribbonsInnerW? (ribbonsInnerW/7) : undefined)
                    return (
                      <div key={d} className="absolute inset-y-0" style={(dayRects||ribbonsInnerW)? { left, width } : { left: `${(di/7)*100}%`, width: `${(1/7)*100}%` }}>
                        {Array.from({length:24},(_,h)=>h).map(h=>{
                          const top = h*(CELL_H+GAP_Y)
                          const v = counts[di][h]
                          const title = `${d} — ${String(h).padStart(2,'0')}:00 to ${String(h+1).padStart(2,'0')}:00 • ${v} on deck`
                          return <div key={h} className="w-full" style={{ position:'absolute', top, height: CELL_H, backgroundColor: colorFor(v), borderRadius: 2 }} title={title} />
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
