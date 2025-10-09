import React, { useMemo, useEffect } from 'react'
import AgentWeekLinear from './AgentWeekLinear'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'
import { DAYS } from '../constants'
import { convertShiftsToTZ, toMin } from '../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string }

export default function AllAgentsWeekRibbons({
  dark,
  tz,
  weekStart,
  agents,
  shifts,
  pto,
  tasks,
  calendarSegs,
  visibleDays = 7,
  scrollChunk,
  showAllTimeLabels = false,
  onDragAll,
  onDragShift,
  onResizeShift,
  onDoubleClickShift,
  sortMode = 'start',
  sortDir = 'asc',
  highlightIds,
  complianceHighlightIds,
  highlightColor,
  fixedOrder,
  onOrderChange,
  chipTone = 'default',
  selectedIds,
  onToggleSelect,
  complianceTipsByShiftId,
  showNameColumn = true,
  showShiftLabels = true,
  dimUnhighlighted = false,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  agents: AgentRow[]
  shifts: Shift[]
  pto: PTO[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
  visibleDays?: number
  scrollChunk?: number
  showAllTimeLabels?: boolean
  onDragAll?: (name:string, deltaMinutes:number)=>void
  onDragShift?: (name:string, id:string, deltaMinutes:number)=>void
  onResizeShift?: (name:string, id:string, edge:'start'|'end', deltaMinutes:number)=>void
  onDoubleClickShift?: (id: string)=>void
  sortMode?: 'start'|'end'|'name'|'count'|'total'|'tz'|'firstDay'
  sortDir?: 'asc'|'desc'
  highlightIds?: Set<string> | string[]
  complianceHighlightIds?: Set<string> | string[]
  highlightColor?: { light: string; dark: string }
  fixedOrder?: string[]
  onOrderChange?: (order: string[])=>void
  chipTone?: 'default' | 'stage' | 'ghost'
  selectedIds?: Set<string> | string[]
  onToggleSelect?: (id:string)=>void
  complianceTipsByShiftId?: Record<string, string[]>
  showNameColumn?: boolean
  showShiftLabels?: boolean
  dimUnhighlighted?: boolean
}){
  // Hover state for global time indicator (across all agents)
  const [hoverX, setHoverX] = React.useState<number|null>(null)
  const [hoverActive, setHoverActive] = React.useState(false)
  const scrollerRef = React.useRef<HTMLDivElement|null>(null)
  // Dynamic name column width to fit full names without excessive truncation
  const [nameColPx, setNameColPx] = React.useState<number>(160)
  React.useEffect(()=>{
    try{
      if(!agents || agents.length===0){ setNameColPx(120); return }
      const names = agents.map(a=> [a.firstName, a.lastName].filter(Boolean).join(' ').trim()).filter(Boolean)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if(!ctx){ setNameColPx(160); return }
      // Roughly match Tailwind text-sm medium
      ctx.font = `500 13px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif`
      let max = 0
      for(const n of names){ const w = ctx.measureText(n).width; if(w>max) max=w }
      const padding = 28 // px for left padding and truncation breathing room
      const MIN = 120, MAX = 260
      setNameColPx(Math.max(MIN, Math.min(MAX, Math.ceil(max + padding))))
    }catch{ setNameColPx(160) }
  }, [agents])
  // Expose name column width to other components (heatmap) via CSS var and event
  React.useEffect(()=>{
    try{ document.documentElement.style.setProperty('--schedule-name-col-px', `${nameColPx}px`) }catch{}
    try{ window.dispatchEvent(new CustomEvent('schedule:namecol', { detail: { px: nameColPx } })) }catch{}
  }, [nameColPx])
  const nameColClass = "shrink-0 text-left pl-1 text-sm truncate"
  const computedOrder = useMemo(()=>{
    const names = agents.map(a=> [a.firstName, a.lastName].filter(Boolean).join(' '))
    const tzShifts = convertShiftsToTZ(shifts, tz.offset)
    const dayIndex = new Map(DAYS.map((d,i)=>[d,i]))
    const offsetMin = tz.offset * 60
    const wrap = (value: number, modBy: number)=> ((value % modBy) + modBy) % modBy
    const WEEK_MIN = 7 * 1440
    const localStartAbs = (shift: Shift)=>{
      const idx = dayIndex.get(shift.day as any)
      if(idx == null) return Infinity
      const startMin = toMin(shift.start)
      if(!Number.isFinite(startMin)) return Infinity
      const abs = idx*1440 + startMin + offsetMin
      return wrap(abs, WEEK_MIN)
    }
    const earliestStartAbs = (name: string)=>{
      let minAbs = Infinity
      for(const s of shifts){
        if(s.person !== name) continue
        const abs = localStartAbs(s)
        if(abs < minAbs) minAbs = abs
      }
      return minAbs
    }
    const latestEndAbs = (name: string)=>{
      let maxAbs = -Infinity
      for(const s of tzShifts){
        if(s.person !== name) continue
        const sd = dayIndex.get(s.day as any) ?? 0
        const ed = dayIndex.get(((s as any).endDay || s.day) as any) ?? sd
        const sAbs = sd*1440 + toMin(s.start)
        let eAbs = ed*1440 + toMin(s.end)
        if(eAbs <= sAbs) eAbs += 1440
        if(eAbs > maxAbs) maxAbs = eAbs
      }
      return maxAbs
    }
    const totalMinutes = (name: string)=>{
      let total = 0
      for(const s of tzShifts){
        if(s.person !== name) continue
        const sd = dayIndex.get(s.day as any) ?? 0
        const ed = dayIndex.get(((s as any).endDay || s.day) as any) ?? sd
        const sAbs = sd*1440 + toMin(s.start)
        let eAbs = ed*1440 + toMin(s.end)
        if(eAbs <= sAbs) eAbs += 1440
        total += Math.max(0, eAbs - sAbs)
      }
      return total
    }
    const shiftCount = (name: string)=> tzShifts.filter(s=> s.person===name).length
    const tzOf = (name: string)=> (agents.find(a=> [a.firstName,a.lastName].filter(Boolean).join(' ')===name)?.tzId) || ''
    const firstDayIdx = (name: string)=>{
      let min = Infinity
      for(const s of tzShifts){ if(s.person===name){ const di = dayIndex.get(s.day as any) ?? Infinity; if(di < min) min = di } }
      return min
    }
    const rows = names.map(n=>{
      const startKey = earliestStartAbs(n)
      return {
        name: n,
        startKey,
        startHas: Number.isFinite(startKey) && startKey < Infinity,
      endKey: latestEndAbs(n),
      endHas: Number.isFinite(latestEndAbs(n)),
      totalKey: totalMinutes(n),
      countKey: shiftCount(n),
      hasShifts: shiftCount(n) > 0,
      tzKey: tzOf(n),
      tzHas: !!tzOf(n),
      dayKey: firstDayIdx(n),
      dayHas: Number.isFinite(firstDayIdx(n)),
      }
    })
    const byName = (a:any,b:any)=> a.name.localeCompare(b.name)
    const sign = sortDir==='asc' ? 1 : -1
    if(sortMode==='name') return rows.sort((a,b)=> sign * byName(a,b)).map(x=> x.name)
    if(sortMode==='tz') return rows.sort((a,b)=>{
      if(a.tzHas && !b.tzHas) return -1
      if(!a.tzHas && b.tzHas) return 1
      const cmp = a.tzKey.localeCompare(b.tzKey) * sign
      return cmp!==0 ? cmp : byName(a,b)
    }).map(x=> x.name)
    if(sortMode==='end') return rows.sort((a,b)=>{
      if(a.endHas && !b.endHas) return -1
      if(!a.endHas && b.endHas) return 1
      const cmp = (a.endKey - b.endKey) * sign
      return cmp!==0 ? cmp : byName(a,b)
    }).map(x=> x.name)
    if(sortMode==='firstDay') return rows.sort((a,b)=>{
      if(a.dayHas && !b.dayHas) return -1
      if(!a.dayHas && b.dayHas) return 1
      const cmp = (a.dayKey - b.dayKey) * sign
      return cmp!==0 ? cmp : byName(a,b)
    }).map(x=> x.name)
    if(sortMode==='count') return rows.sort((a,b)=>{
      const aHas = a.hasShifts, bHas = b.hasShifts
      if(aHas && !bHas) return -1
      if(!aHas && bHas) return 1
      const cmp = (a.countKey - b.countKey) * sign
      return cmp!==0 ? cmp : byName(a,b)
    }).map(x=> x.name)
    if(sortMode==='total') return rows.sort((a,b)=>{
      const aHas = a.hasShifts, bHas = b.hasShifts
      if(aHas && !bHas) return -1
      if(!aHas && bHas) return 1
      const cmp = (a.totalKey - b.totalKey) * sign
      return cmp!==0 ? cmp : byName(a,b)
    }).map(x=> x.name)
    // default: earliest start
    return rows.sort((a,b)=>{
      if(a.startHas && !b.startHas) return -1
      if(!a.startHas && b.startHas) return 1
      const cmp = (a.startKey - b.startKey) * sign
      return cmp!==0 ? cmp : byName(a,b)
    }).map(x=> x.name)
  }, [agents, shifts, tz.offset, sortMode, sortDir])

  const agentNamesSorted = React.useMemo(()=>{
    if(Array.isArray(fixedOrder) && fixedOrder.length){
      const nameSet = new Set(agents.map(a=> [a.firstName, a.lastName].filter(Boolean).join(' ')))
      const normalized = fixedOrder.filter(nameSet.has, nameSet)
      const extras = agents
        .map(a=> [a.firstName, a.lastName].filter(Boolean).join(' '))
        .filter(name=> !normalized.includes(name))
      return normalized.concat(extras)
    }
    return computedOrder
  }, [computedOrder, fixedOrder, agents])

  useEffect(()=>{
    if(!fixedOrder && onOrderChange){
      onOrderChange(computedOrder)
    }
  }, [computedOrder, fixedOrder, onOrderChange])
  // Full names are shown; we still compute titles for hover via name itself

  // Visible-day scaling: show fewer days by widening content so it's horizontally scrollable
  const daysVisible = Math.min(7, Math.max(1, visibleDays || 7))
  const scaleWidthPct = (7 / daysVisible) * 100
  const BAND_H = 28 // keep in sync with AgentWeekLinear default unless overridden
  // Compute on-deck count for a particular minute within the week
  const tzShifts = useMemo(()=> convertShiftsToTZ(shifts, tz.offset), [shifts, tz.offset])
  const onDeckAt = (absMin:number)=>{
    let count = 0
    for(const s of tzShifts){
      const sd = DAYS.indexOf(s.day as any)
      if(sd<0) continue
      const sAbs = sd*1440 + toMin(s.start)
      let eAbs = (DAYS.indexOf(((s as any).endDay||s.day) as any) < 0 ? sd : DAYS.indexOf(((s as any).endDay||s.day) as any))*1440 + toMin(s.end)
      if(eAbs <= sAbs) eAbs += 1440
      const a = ((sAbs % (7*1440)) + 7*1440) % (7*1440)
      const b = ((eAbs % (7*1440)) + 7*1440) % (7*1440)
      // Handle wrap by checking both [a,b) and [a, b+T) windows
      const T = 7*1440
      const within = (m:number, L:number, R:number)=> m>=L && m<R
      if(a < b){ if(within(absMin, a, b)) count++ }
      else { if(within(absMin, a, T) || within(absMin, 0, b)) count++ }
    }
    return count
  }

  // Programmatic chunk scroll when visibleDays < 7
  React.useEffect(()=>{
    const el = scrollerRef.current
    if(!el) return
    const chunks = Math.max(1, Math.ceil(7 / daysVisible))
    const idx = Math.min(chunks-1, Math.max(0, scrollChunk || 0))
    // One chunk width equals the visible viewport width
    const target = Math.min(el.scrollWidth - el.clientWidth, Math.round(idx * el.clientWidth))
    el.scrollTo({ left: target, behavior: 'smooth' })
  }, [scrollChunk, daysVisible])

  return (
    <div className="space-y-1">
      <div className="flex items-stretch gap-1">
        {/* Left column: header spacer + names (optional) */}
        {showNameColumn && (
          <div className="shrink-0" style={{ width: nameColPx }}>
            <div className="h-7 opacity-0 select-none">label</div>
            {agentNamesSorted.length===0 ? (
              <div className="text-sm opacity-70 px-2">No agents.</div>
            ) : agentNamesSorted.map(name=> (
              <div key={name} className={["flex items-center", dark?"text-neutral-300":"text-neutral-700"].join(' ')} style={{ height: BAND_H }} title={name}>
                <div className={nameColClass} style={{ width: nameColPx }}>{name}</div>
              </div>
            ))}
          </div>
        )}
        {/* Right column: single synchronized horizontal scroller containing header labels and ribbons */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-x-auto no-scrollbar relative"
          onMouseLeave={()=>{ setHoverActive(false); setHoverX(null) }}
          onMouseMove={(e)=>{
            const host = scrollerRef.current
            if(!host) return
            const inner = host.firstElementChild as HTMLElement | null
            if(!inner) return
            const rect = inner.getBoundingClientRect()
            const x = e.clientX - rect.left
            if(x < 0 || x > rect.width){ setHoverActive(false); setHoverX(null); return }
            setHoverActive(true)
            setHoverX(x)
          }}
        >
          <div style={{ width: `${scaleWidthPct}%` }} data-ribbons-inner="1" className="relative">
            {hoverActive && hoverX!=null && (
              <>
                <div
                  className="pointer-events-none absolute inset-y-0 z-20"
                  style={{ left: hoverX, width: 1, background: 'rgba(59,130,246,0.9)' }}
                />
                <div
                  className={[
                    'pointer-events-none absolute -translate-x-1/2 top-0 mt-0.5 px-1.5 py-0.5 rounded text-white text-[10px] z-30',
                    dark ? 'bg-blue-500' : 'bg-blue-600',
                  ].join(' ')}
                  style={{ left: hoverX }}
                >
                  {(()=>{
                    const inner = scrollerRef.current?.firstElementChild as HTMLElement | null
                    const widthPx = inner?.getBoundingClientRect().width || 1
                    const totalMins = 7*1440
                    const absMin = Math.max(0, Math.min(totalMins-1, Math.round((hoverX/widthPx) * totalMins)))
                    const hh = Math.floor((absMin%1440)/60).toString().padStart(2,'0')
                    const mm = (absMin%60).toString().padStart(2,'0')
                    const count = onDeckAt(absMin)
                    return `${hh}:${mm} • ${count} on deck`
                  })()}
                </div>
              </>
            )}
            {/* Top day labels aligned to ribbons */}
            <div className="relative h-7">
                {DAYS.map((d,i)=>{
                  const left = (i/7)*100
                  const width = (1/7)*100
                  return (
                    <div key={d} data-day-col={i} className={["absolute text-center", dark?"text-neutral-300":"text-neutral-600"].join(' ')} style={{ left: `${left}%`, width: `${width}%`, fontSize: 13, lineHeight: 1.5 }}>
                      {d}
                    </div>
                  )
                })}
            </div>

            {/* Ribbons list */}
            {agentNamesSorted.length>0 && agentNamesSorted.map(name=> (
              <div key={name} className="py-0 m-0">
                <AgentWeekLinear
                  dark={dark}
                  tz={tz}
                  weekStart={weekStart}
                  agent={name}
                  shifts={shifts}
                  pto={pto}
                  tasks={tasks}
              calendarSegs={(calendarSegs||[]).flatMap(cs=>{
                const sameDay = !(cs as any).endDay || (cs as any).endDay === cs.day
                if(sameDay){ return [cs] }
                return [
                  { ...cs, day: cs.day, start: cs.start, end: '24:00' },
                  { ...cs, day: (cs as any).endDay, start: '00:00', end: cs.end },
                ]
              }) as any}
              titlePrefix={name}
              draggable={Boolean(onDragAll || onDragShift)}
              onDragAll={(d)=> onDragAll?.(name, d)}
              onDragShift={(id,d)=> onDragShift?.(name, id, d)}
              onResizeShift={(id, edge, d)=> onResizeShift?.(name, id, edge, d)}
                  showDayLabels={false}
                  showWeekLabel={false}
                  framed={false}
                  showNowLabel={false}
                  showShiftLabels={showShiftLabels}
                  bandHeight={BAND_H}
              alwaysShowTimeTags={showAllTimeLabels}
              forceOuterTimeTags={showAllTimeLabels}
              avoidLabelOverlap={showAllTimeLabels}
              highlightIds={highlightIds}
              complianceHighlightIds={complianceHighlightIds}
              highlightColor={highlightColor}
              chipTone={chipTone}
              onDoubleClickShift={onDoubleClickShift}
              showEdgeTimeTagsForHighlights={true}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              warningTipsById={complianceTipsByShiftId}
              dimUnhighlighted={dimUnhighlighted}
            />
          </div>
        ))}
          </div>
        </div>
      </div>
    </div>
  )
}
