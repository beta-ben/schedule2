import React, { useMemo } from 'react'
import { DAYS } from '../constants'
import { convertShiftsToTZ, nowInTZ, parseYMD, toMin, minToHHMM, fmtYMD, addDays, mergeSegments } from '../lib/utils'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

// Single 168-hour horizontal band across the week for one agent
export default function AgentWeekLinear({
  dark,
  tz,
  weekStart,
  agent,
  shifts,
  pto,
  tasks,
  calendarSegs,
  agents,
  titlePrefix,
  bandHeight,
  dayLabelFontPx,
  onDragAll,
  onDragShift,
  draggable = true,
  showDayLabels = true,
  showWeekLabel = true,
  framed = true,
  showNowLine = true,
  showNowLabel = true,
  showShiftLabels = true,
  alwaysShowTimeTags = false,
  forceOuterTimeTags = false,
  highlightIds,
  showEdgeTimeTagsForHighlights,
  selectedIds,
  onToggleSelect,
  avoidLabelOverlap,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  agent: string
  shifts: Shift[]
  pto: PTO[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
  agents?: Array<{ id?: string; firstName?: string; lastName?: string }>
  // When provided, prefix chip/tooltips with this label (e.g., full name)
  titlePrefix?: string
  // Optional visual tweaks
  bandHeight?: number
  dayLabelFontPx?: number
  onDragAll?: (deltaMinutes:number)=>void
  onDragShift?: (id:string, deltaMinutes:number)=>void
  draggable?: boolean
  showDayLabels?: boolean
  showWeekLabel?: boolean
  framed?: boolean
  showNowLine?: boolean
  showNowLabel?: boolean
  showShiftLabels?: boolean
  // When true, always show start/end time tags regardless of hover/drag/selection
  alwaysShowTimeTags?: boolean
  // When true, place the time tags outside the chip edges (left of start, right of end)
  forceOuterTimeTags?: boolean
  highlightIds?: Set<string> | string[]
  showEdgeTimeTagsForHighlights?: boolean
  selectedIds?: Set<string> | string[]
  onToggleSelect?: (id:string)=>void
  // When true, suppress outer time tags that would overlap neighboring tags
  avoidLabelOverlap?: boolean
}){
  // Detect theme from root [data-theme] for Night/Noir/Prism adjustments
  const theme: 'system'|'light'|'dark'|'night'|'noir'|'prism' = (()=>{
    try{
      const el = document.querySelector('[data-theme]') as HTMLElement | null
      const v = (el?.getAttribute('data-theme') as any) || 'system'
      return v
    }catch{ return 'system' as const }
  })()
  const isNight = theme==='night'
  const isNoir = theme==='noir'
  const isPrism = theme==='prism'
  // Simple string hash to 0..359 for per-chip hue variance
  function hashStr(s: string) { 
    let h = 0; 
    for (let i = 0; i < s.length; i++) { 
      h = ((h << 5) - h) + s.charCodeAt(i); 
      h |= 0; 
    } 
    return ((h % 360) + 360) % 360; 
  }
  const totalMins = 7 * 24 * 60 // 10080
  const weekStartDate = parseYMD(weekStart)
  const dayIdx = (d: string)=> DAYS.indexOf(d as any)
  const textSub = dark? 'text-neutral-400' : 'text-neutral-500'

  const tzShifts = useMemo(()=> convertShiftsToTZ(shifts, tz.offset).filter(s=> s.person===agent), [shifts, tz.offset, agent])

  type Seg = { id:string; startAbs:number; endAbs:number; title:string; key:string; sub?: { taskId:string; stOff:number; enOff:number }[]; dayKey:string }
  type Group = { id:string; key:string; segments: Seg[]; earliest:number; latest:number; title:string; startMin:number; endMin:number }
  const groups: Group[] = useMemo(()=>{
    const byId = new Map<string, { id:string; key:string; segs: Seg[]; earliest:number; latest:number; title:string; startMin?:number; endMin?:number }>()
    for(const s of tzShifts){
      const startDay = dayIdx(s.day)
      if(startDay<0) continue
      const sAbs = startDay*1440 + toMin(s.start)
      let eAbs: number
      if(s.end === '24:00'){
        eAbs = (startDay+1)*1440
      }else{
        const eDayKey = (s as any).endDay || s.day
        let endDay = dayIdx(eDayKey)
        if(endDay<0) endDay = startDay
        eAbs = endDay*1440 + toMin(s.end)
        if(eAbs <= sAbs){
          if(endDay < startDay) eAbs += 7*1440
          else eAbs += 1440
        }
      }
  const st = Math.max(0, Math.min(totalMins, sAbs))
  // Do not clamp end to totalMins so wrapped segments (Sat->Sun) render the Sunday part (0..b)
  const en = Math.max(0, eAbs)
      if(en <= st) continue
      const title = `${s.day} ${s.start} – ${(s as any).endDay || s.day} ${s.end}`
      const rawStartMin = toMin(s.start)
      const rawEndMin = s.end === '24:00' ? 0 : toMin(s.end)
      // Precompute merged posture segments for this local-day piece (manual beats calendar)
      let sub: { taskId:string; stOff:number; enOff:number }[] | undefined
      try{
        const durLoc = Math.max(0, (eAbs - sAbs))
            const calForDay = (calendarSegs||[])
              .filter(cs=> (((s as any).agentId && cs.agentId=== (s as any).agentId) || cs.person===agent))
              .flatMap(cs=>{
                const sameDay = !(cs as any).endDay || (cs as any).endDay === cs.day
                if(sameDay){ return [cs] }
                return [
                  { ...cs, day: cs.day, start: cs.start, end: '24:00' },
                  { ...cs, day: (cs as any).endDay, start: '00:00', end: cs.end },
                ]
              })
              .filter(cs=> cs.day === (s.day as any))
              .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
        // Use original piece (local day) to merge segments
        const merged = mergeSegments({ ...s }, calForDay) || []
        if(merged && merged.length){
          sub = merged.map((m: NonNullable<ReturnType<typeof mergeSegments>>[number])=>{
            const st = Math.max(0, Math.min(durLoc, m.startOffsetMin))
            const en = Math.max(0, Math.min(durLoc, m.startOffsetMin + m.durationMin))
            return { taskId: m.taskId, stOff: st, enOff: en }
          }).filter((x:{taskId:string; stOff:number; enOff:number})=> x.enOff > x.stOff)
        }
      }catch{}
      const seg: Seg = { id: s.id, startAbs: st, endAbs: en, title, key: `${s.person}-${s.id}-${s.day}-${s.start}-${s.end}` , sub, dayKey: s.day as any }
      const g = byId.get(s.id) || { id: s.id, key: `${s.person}-${s.id}`, segs: [], earliest: Infinity, latest: -Infinity, title }
      g.segs.push(seg)
      g.earliest = Math.min(g.earliest, st)
      g.latest = Math.max(g.latest, en)
      g.title = title
      // Determine label minutes-of-day from correct segment pieces
      // For overnight splits: the segment that ends at 24:00 carries the true start time; the one that starts at 00:00 carries the true end time.
      if((s as any).end === '24:00'){
        g.startMin = rawStartMin
      }
      if((s as any).start === '00:00'){
        g.endMin = rawEndMin
      }
      // For non-overnight single segments, set both directly
      if((s as any).end !== '24:00' && (s as any).start !== '00:00'){
        if(g.startMin==null) g.startMin = rawStartMin
        if(g.endMin==null) g.endMin = rawEndMin
      }
      byId.set(s.id, g)
    }
    const out: Group[] = []
    for(const [,g] of byId){
      g.segs.sort((a,b)=> a.startAbs - b.startAbs)
      // Fallbacks if not determined above
      let startMin = g.startMin
      let endMin = g.endMin
      if(startMin==null && g.segs.length>0){
        // use minutes-of-day from the segment with max startAbs (the actual shift start pre-split)
        const seg = g.segs.reduce((p,c)=> (c.startAbs>p.startAbs?c:p), g.segs[0])
        // Extract from seg title or recompute from abs relative to day
        // Safer: derive from abs modulo 1440
        startMin = ((seg.startAbs % 1440)+1440)%1440
      }
      if(endMin==null && g.segs.length>0){
        const seg = g.segs.reduce((p,c)=> (c.endAbs>p.endAbs?c:p), g.segs[0])
        endMin = ((seg.endAbs % 1440)+1440)%1440
      }
      out.push({ id: g.id, key: g.key, segments: g.segs, earliest: g.earliest, latest: g.latest, title: g.title, startMin: startMin!, endMin: endMin! })
    }
    out.sort((a,b)=> a.earliest - b.earliest)
    return out
  }, [tzShifts])
  // Now indicator within the band if this week range contains 'now'
  const now = nowInTZ(tz.id)
  const bandStart = weekStartDate
  const bandEnd = addDays(weekStartDate, 7)
  const nowDate = new Date(now.y, (now.mo||1)-1, now.d||1)
  const showNow = nowDate >= bandStart && nowDate < bandEnd
  const nowOffsetMin = showNow ? (DAYS.indexOf(now.weekdayShort as any)*1440 + now.minutes) : 0
  const nowLeft = (nowOffsetMin/totalMins)*100

  const BAND_H = typeof bandHeight === 'number' ? bandHeight : 28
  const NOW_TAG_F = 10

  const containerRef = React.useRef<HTMLDivElement|null>(null)
  const [drag, setDrag] = React.useState<null | { mode:'all'|'single'; id?:string; selectedIds?: Set<string>; startX:number; pxToMin:number; delta:number; minDelta:number; maxDelta:number }>(null)
  const step = 30
  const [containerW, setContainerW] = React.useState(0)
  const [hoverBand, setHoverBand] = React.useState(false)
  const [hoverGroupId, setHoverGroupId] = React.useState<string|null>(null)
  const didDragRef = React.useRef(false)
  // Tracking for simple label collision avoidance (approximate widths)
  let lastStartEdgePx = -Infinity
  let lastEndRightPx = -Infinity
  const LABEL_W = 48 // approx width of "HH:MM" tag with padding
  const LABEL_GAP = 4

  React.useEffect(()=>{
    const measure = ()=>{
      if(!containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      setContainerW(r.width)
    }
    measure()
    window.addEventListener('resize', measure)
    return ()=> window.removeEventListener('resize', measure)
  }, [])

  // Rough timeframe like "9a-4p" or include :30 when needed
  const fmtRough = (min:number)=>{
    const h = Math.floor(min/60)
    const m = min%60
    const am = h < 12
    const h12 = ((h%12)||12)
    const mm = m===0 ? '' : m===30 ? ':30' : `:${m.toString().padStart(2,'0')}`
    return `${h12}${mm}${am?'a':'p'}`
  }

  const beginAllDrag = (e: React.MouseEvent)=>{
    if(!draggable) return
    if(!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pxToMin = totalMins / rect.width
  // Allow wrap-around across the week; no band-edge clamp needed
  const minDelta = -1e9
  const maxDelta =  1e9
  didDragRef.current = false
  setDrag({ mode:'all', startX: e.clientX, pxToMin, delta:0, minDelta, maxDelta })
  }
  const beginSingleDrag = (id:string, e: React.MouseEvent)=>{
    if(!draggable) return
    e.stopPropagation()
    if(!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pxToMin = totalMins / rect.width
    const me = groups.find(g=>g.id===id)
    if(!me) return
    // Determine moving set: union of current selection (if any) and the dragged id.
    let selSet: Set<string> | undefined
    if(selectedIds){
      const s = selectedIds instanceof Set ? new Set(selectedIds) : new Set(selectedIds)
      s.add(id)
      selSet = s
    }else{
      selSet = new Set([id])
    }

    // Compute collision-aware bounds. If dragging multiple, treat selected as moving together and only collide with non-selected.
  const movingIds = selSet ? selSet : new Set([id])
    const nonSelected = groups.filter(g=> !movingIds.has(g.id))
    // Wrap-aware bounds across the circular week: consider other groups at offsets -T, 0, +T
    const T = totalMins
    let posBound = Infinity
    let negBound = -Infinity
    for(const g of groups){
      if(!movingIds.has(g.id)) continue
      const earliest = g.earliest
      const latest = g.latest
      let gPos = Infinity
      let gNeg = -Infinity
      for(const other of nonSelected){
        for(const k of [-1, 0, 1] as const){
          const oStart = other.earliest + k*T
          const oEnd   = other.latest + k*T
          // Distance we can move to the right before colliding with other's left edge
          const dRight = oStart - latest
          if(dRight >= 0) gPos = Math.min(gPos, dRight)
          // Distance we can move to the left before colliding with other's right edge
          const dLeft = oEnd - earliest
          if(dLeft <= 0) gNeg = Math.max(gNeg, dLeft)
        }
      }
      posBound = Math.min(posBound, gPos)
      negBound = Math.max(negBound, gNeg)
    }
    if(!Number.isFinite(posBound)) posBound = 1e9
    if(!Number.isFinite(negBound)) negBound = -1e9
    const minDelta = negBound
    const maxDelta = posBound
    didDragRef.current = false
    setDrag({ mode:'single', id, selectedIds: selSet, startX: e.clientX, pxToMin, delta:0, minDelta, maxDelta })
  }

  React.useEffect(()=>{
    if(!drag) return
  const onMove = (ev: MouseEvent)=>{
      const raw = (ev.clientX - drag.startX) * drag.pxToMin
      // round to step
      const rounded = Math.round(raw/step)*step
      const clamped = Math.max(drag.minDelta, Math.min(drag.maxDelta, rounded))
  if(clamped !== 0) didDragRef.current = true
  setDrag(prev=> prev ? { ...prev, delta: clamped } : prev)
    }
    const onUp = ()=>{
      if(drag.delta !== 0){
        if(drag.mode==='all') onDragAll?.(drag.delta)
        else if(drag.mode==='single' && drag.id) onDragShift?.(drag.id, drag.delta)
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [drag, onDragAll, onDragShift])

  // Keyboard nudging: when hovering band (not over a chip), ArrowLeft/Right shifts all by 15m;
  // when hovering a chip, ArrowLeft/Right shifts just that chip by 15m.
  React.useEffect(()=>{
    const handler = (e: KeyboardEvent)=>{
      if(!draggable) return
      if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      // Only act when pointer is over this band or a chip
      const targetSingle = hoverGroupId
      const targetAll = hoverBand && !hoverGroupId
      if(!targetSingle && !targetAll) return
      e.preventDefault()
      e.stopPropagation()
      const delta = e.key==='ArrowLeft' ? -15 : 15
      if(targetSingle){
        onDragShift?.(targetSingle, delta)
      }else if(targetAll){
        onDragAll?.(delta)
      }
    }
    window.addEventListener('keydown', handler)
    return ()=> window.removeEventListener('keydown', handler)
  }, [draggable, hoverBand, hoverGroupId, onDragAll, onDragShift])
  

  return (
    <div className="w-full">
      {/* Top labels: days across the band */}
      {showDayLabels && (
        <div className="relative h-6">
      {DAYS.map((d,i)=>{
            const left = (i/7)*100
            const width = (1/7)*100
            return (
        <div key={d} className={["absolute text-center", textSub].join(' ')} style={{ left: `${left}%`, width: `${width}%`, fontSize: (typeof dayLabelFontPx==='number'? dayLabelFontPx : 11) }}>
                {d}
              </div>
            )
          })}
        </div>
      )}

    {/* Band with day stripes and hour ticks */}
  <div className={["relative", framed?"rounded-md overflow-hidden":"", framed?(dark?"bg-neutral-950":"bg-neutral-50"):""].filter(Boolean).join(' ')} style={{ height: BAND_H, overflow: 'visible', marginBottom: 0 }}>
        <div
          ref={containerRef}
          className="absolute inset-y-0"
      // Give a small bleed when framed so outer time tags near edges aren't clipped
      style={{ left: framed? 0 : 0, right: framed? 0 : 0, paddingLeft: framed? 6 : 0, paddingRight: framed? 6 : 0 }}
      onMouseDown={draggable ? beginAllDrag : undefined}
  onMouseEnter={()=> setHoverBand(true)}
  onMouseLeave={()=> { setHoverBand(false); setHoverGroupId(null) }}
        >
      {/* AM highlight bands (00:00–12:00 each day) */}
          {Array.from({length:7},(_,i)=>{
            const left = (i/7)*100
            const width = (12/24)*(100/7) // 12 hours out of 24 within one day (1/7 of total width)
            return (
              <div
                key={`am-${i}`}
        className="absolute inset-y-0"
                style={{ left: `${left}%`, width: `${width}%`, background: dark? 'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)' }}
                aria-hidden
              />
            )
          })}
          {/* Day boundaries */}
          {Array.from({length: 8}, (_,i)=>{
            const left = (i/7)*100
            return <div key={`dayline-${i}`} className="absolute inset-y-0 opacity-30" style={{ left: `${left}%`, width: 1, background: dark? 'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)' }} />
          })}

          {/* Optional: coarse hour ticks (every 6h) */}
          {Array.from({length: (7*4)+1 },(_,i)=>i).map(i=>{
            const left = (i/(7*4))*100 // 6h chunks => 4 per day
            return <div key={`h${i}`} className="absolute inset-y-0 opacity-30" style={{ left: `${left}%`, width: 1, background: dark? 'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }} />
          })}

          {/* Shifts as single-lane chips (grouped) */}
          {groups.map(g=>{
            const isAllDragging = drag && drag.mode==='all'
            const isThisDragging = drag && drag.mode==='single' && drag.id===g.id
            const isMultiDragMember = drag && drag.mode==='single' && drag.selectedIds && drag.selectedIds.has(g.id)
            const delta = (isAllDragging || isThisDragging || isMultiDragMember) ? drag!.delta : 0
            const border = dark?'#52525b':'#94a3b8'
            const bg = dark? 'rgba(59,130,246,0.64)' : 'rgba(59,130,246,0.625)'
            // Label times based on original shift minutes-of-day, adjusted by delta
            const mod1440 = (v:number)=> ((v % 1440) + 1440) % 1440
            const groupStartMin = mod1440(g.startMin + delta)
            const groupEndMin   = mod1440(g.endMin   + delta)
            return g.segments.flatMap((seg)=>{
              const newStart = seg.startAbs + delta
              const newEnd = seg.endAbs + delta
              const dur = Math.max(0, newEnd - newStart)
              const modT = (v:number)=> ((v % totalMins) + totalMins) % totalMins
              const a = modT(newStart)
              const b = modT(newEnd)
              const mkPart = (pLeft:number, pRight:number, partKey:string, showStart:boolean, showEnd:boolean, opts?: { forceStartOuter?: boolean; forceEndOuter?: boolean })=>{
                const leftPct = (pLeft/totalMins)*100
                const widthPct = ((pRight - pLeft)/totalMins)*100
                const pxW = (pRight - pLeft)/totalMins * containerW
                // Labels use group-level logical start/end times for correctness across wrap
                const label = `${fmtRough(groupStartMin)}-${fmtRough(groupEndMin)}`
    const isHover = hoverGroupId === g.id
  const isHi = !!highlightIds && (
                  highlightIds instanceof Set
                    ? highlightIds.has(g.id)
                    : (highlightIds as string[]).includes(g.id)
                )
  // Night/Noir: force chips to black
  const chipBg = (isNight || isNoir) ? '#000' : (isHi ? (dark? 'rgba(251,146,60,0.78)':'rgba(251,146,60,0.72)') : bg)
                const isSel = !!selectedIds && (
                  selectedIds instanceof Set
                    ? selectedIds.has(g.id)
                    : (selectedIds as string[]).includes(g.id)
                )
                // Use high-contrast hover ring; when framed (overflow-hidden), use inset to avoid clipping top/bottom
        const ringHover = isHover
                  ? (framed
                      ? (isNight || isNoir ? 'inset 0 0 0 2px rgba(255,255,255,0.35)' : (dark ? 'inset 0 0 0 2px rgba(255,255,255,0.85)' : 'inset 0 0 0 2px rgba(0,0,0,0.7)'))
          : (isNight || isNoir ? '0 0 0 2px rgba(255,255,255,0.35)' : (dark ? '0 0 0 2px rgba(255,255,255,0.85)' : '0 0 0 2px rgba(0,0,0,0.7)')))
                  : ''
                const ringSelected = isSel
                  ? (isNight
                      ? '0 0 0 2px rgba(239,68,68,0.65)'
                      : isNoir
                        ? '0 0 0 2px rgba(255,255,255,0.45)'
                        : (dark? '0 0 0 2px rgba(234,179,8,0.95)':'0 0 0 2px rgba(234,179,8,0.95)'))
                  : ''
                const boxShadow = [ringHover, ringSelected].filter(Boolean).join(', ')
                const showTags = alwaysShowTimeTags || (isAllDragging || isThisDragging) || isHover || (showEdgeTimeTagsForHighlights && isHi) || isSel
                // Collision avoidance for outer labels when requested
                let allowStartTag = showTags && showStart
                let allowEndTag = showTags && showEnd
                // If the chip piece is extremely narrow (< approx 2 label widths), avoid showing both tags which can jitter
                if(pxW < (LABEL_W * 1.6)){
                  // Prefer the edge-gated tag; when both requested, keep only one to reduce churn
                  if(allowStartTag && allowEndTag){
                    // Keep the tag closer to band edge for clarity
                    const closerToLeft = pLeft <= (totalMins - pRight)
                    if(closerToLeft) allowEndTag = false
                    else allowStartTag = false
                  }
                }
                if(avoidLabelOverlap){
                  const chipLeftPx = (pLeft/totalMins) * containerW
                  const chipRightPx = (pRight/totalMins) * containerW
                  // Reset trackers on wrap (monotonicity break)
                  if(chipLeftPx < lastStartEdgePx) lastStartEdgePx = -Infinity
                  if(chipRightPx < (lastEndRightPx - LABEL_W)) lastEndRightPx = -Infinity
                  const wantsOuterStart = (opts?.forceStartOuter || forceOuterTimeTags)
                  const wantsOuterEnd = (opts?.forceEndOuter || forceOuterTimeTags)
                  if(wantsOuterStart && allowStartTag){
                    // Start label sits immediately to the left of chip
                    const labelRight = chipLeftPx
                    const minAllowed = lastStartEdgePx + LABEL_W + LABEL_GAP
                    if(labelRight < minAllowed){
                      allowStartTag = false
                    }else{
                      lastStartEdgePx = labelRight
                    }
                  }
                  if(wantsOuterEnd && allowEndTag){
                    // End label sits immediately to the right of chip
                    const labelLeft = chipRightPx
                    const minLeft = lastEndRightPx + LABEL_GAP
                    if(labelLeft < minLeft){
                      allowEndTag = false
                    }else{
                      lastEndRightPx = labelLeft + LABEL_W
                    }
                  }
                }
                // Build posture tooltip lines for this piece from its sub-segments
                const tooltipLines: string[] = []
                if(seg.sub && tasks){
                  for(const sub of seg.sub){
                    const t = (tasks||[]).find(t=>t.id===sub.taskId)
                    // Convert sub offsets to absolute minutes within week post-delta
                    const absStart = newStart + sub.stOff
                    const absEnd = newStart + sub.enOff
                    tooltipLines.push(`${t?.name || 'Task'}: ${minToHHMM(absStart % 1440)}–${minToHHMM(absEnd % 1440)}`)
                  }
                }
        return (
                  <div
                    key={partKey}
          className={"absolute inset-y-0"}
                    style={(function(){
                      const base: React.CSSProperties = {
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        // No borders for dense look; rely on hover outline only
                        boxShadow: boxShadow || undefined,
                      }
                      if(isPrism){
                        // Animated darker gradient with multiply for readability, stagger per group
                        const h = hashStr(g.id)
                        const a = 0.42 // alpha for chip bands
                        const s = 88
                        const l = 55
                        base.backgroundColor = '#0a0a0a'
                        base.backgroundImage = `linear-gradient(90deg,
                          hsla(${(h+330)%360}, ${s}%, ${l}%, ${a}),
                          hsla(${(h+15)%360},  ${s}%, ${l}%, ${a}),
                          hsla(${(h+60)%360},  ${s}%, ${l}%, ${a}),
                          hsla(${(h+120)%360}, ${s}%, ${l}%, ${a}),
                          hsla(${(h+180)%360}, ${s}%, ${l}%, ${a}),
                          hsla(${(h+240)%360}, ${s}%, ${l}%, ${a}),
                          hsla(${(h+300)%360}, ${s}%, ${l}%, ${a})
                        )`
                        base.backgroundBlendMode = 'multiply'
                        base.backgroundSize = '300% 100%'
                        base.animation = 'prismChip 12s ease-in-out infinite'
                        base.animationDelay = `${-((h % 7) * 0.33)}s`
                      }else{
                        ;(base as any).background = chipBg
                      }
                      return base
                    })()}
                    title={(titlePrefix ? `${titlePrefix} • ${g.title}` : g.title) + (tooltipLines.length? `\n\nPostures:\n${tooltipLines.join('\n')}`:'')}
                    onMouseDown={draggable ? (e)=>beginSingleDrag(g.id, e) : undefined}
                    onMouseEnter={()=>{ setHoverGroupId(g.id); setHoverBand(false) }}
                    onMouseLeave={()=> { setHoverGroupId(null); setHoverBand(true) }}
                    onClick={(e)=>{
                      e.stopPropagation()
                      if(didDragRef.current) return
                      onToggleSelect?.(g.id)
                    }}
                  >
                    {/* Posture overlays: subtle and on-theme; animated gradient in Prism */}
                    {seg.sub && tasks && seg.sub.map((sub, idx)=>{
                      // Absolute (week) minutes after drag
                      const a0 = newStart + sub.stOff
                      const b0 = newStart + sub.enOff
                      // Clamp to current part window [pLeft, pRight]
                      const a = Math.max(pLeft, Math.min(pRight, a0))
                      const b = Math.max(pLeft, Math.min(pRight, b0))
                      if(b <= a) return null
                      const leftInPart = ((a - pLeft) / (pRight - pLeft)) * 100
                      const widthInPart = ((b - a) / (pRight - pLeft)) * 100
                      const t = (tasks||[]).find(t=>t.id===sub.taskId)
                      // Subtle overlay normally; in Prism use animated gradient derived from task color
                      const color = isNight
                        ? 'rgba(239,68,68,0.28)'
                        : isNoir
                          ? 'rgba(255,255,255,0.16)'
                          : (t?.color || (dark? 'rgba(59,130,246,0.85)':'rgba(59,130,246,0.85)'))
                      const prismImage = t?.color
                        ? `linear-gradient(90deg,
                            color-mix(in oklab, ${t.color} 85%, #000 15%) 0%,
                            color-mix(in oklab, ${t.color} 65%, #000 35%) 50%,
                            color-mix(in oklab, ${t.color} 85%, #000 15%) 100%
                          )`
                        : undefined
                      return (
                        <div
                          key={`${partKey}-seg-${idx}`}
                          className="absolute inset-y-0 pointer-events-none"
                          style={{ left: `${leftInPart}%`, width: `${widthInPart}%`, background: isPrism ? undefined : color, backgroundImage: isPrism ? prismImage : undefined, backgroundSize: isPrism ? '300% 100%' : undefined, animation: isPrism ? 'prismChip 12s ease-in-out infinite' : undefined, backgroundBlendMode: isPrism ? 'multiply' : undefined, opacity: isPrism ? 0.75 : (isNight ? 0.35 : isNoir ? 0.25 : 0.9) }}
                          aria-hidden
                        />
                      )
                    })}
                    {/* Dense mode: no internal posture text labels; only time tags at edges */}
          {allowStartTag && (
                      <div className={["absolute top-1/2 -translate-y-1/2 px-1 py-0.5 rounded text-[12px] font-medium whitespace-nowrap z-10",
            ((opts?.forceStartOuter || forceOuterTimeTags)) ? "-left-1 -translate-x-full" : (framed?"left-1":"-left-1 -translate-x-full"),
                        dark?"bg-black/70 text-white":"bg-black/70 text-white"].join(' ')}>
                        {minToHHMM(groupStartMin)}
                      </div>
                    )}
          {allowEndTag && (
                      <div className={["absolute top-1/2 -translate-y-1/2 px-1 py-0.5 rounded text-[12px] font-medium whitespace-nowrap z-10",
            ((opts?.forceEndOuter || forceOuterTimeTags)) ? "-right-1 translate-x-full" : (framed?"right-1":"-right-1 translate-x-full"),
                        dark?"bg-black/70 text-white":"bg-black/70 text-white"].join(' ')}>
                        {minToHHMM(groupEndMin)}
                      </div>
                    )}
                  </div>
                )
              }
              if(dur <= 0){ return [] }
              const isStartSeg = seg.startAbs === g.earliest
              const isEndSeg = seg.endAbs === g.latest
              // Gates are decided based on post-drag positions relative to the band, so they work regardless of the original 0/24 markers
              // For non-wrap parts we want: show start if this is the logical first segment OR it touches the band left; show end if logical last OR touches band right
              // For wrap parts, we determine on each piece using its own pLeft/pRight (computed below)
              if(a < b){
                // Single segment in-band after drag
                const startGateNow = isStartSeg || a === 0
                const endGateNow   = isEndSeg   || b === totalMins
                return [mkPart(a, b, `${seg.key}-p0`, startGateNow, endGateNow)]
              }else{
                // Wrap across week edge after drag: split into [a .. T) and [0 .. lenRem)
                const lenFirst = Math.min(totalMins - a, dur)
                const lenRem = Math.max(0, dur - lenFirst)
                if(lenRem > 0){
                  const p0L = a, p0R = a+lenFirst
                  const p1L = 0, p1R = lenRem
                  const endGateP0   = isEndSeg   || p0R === totalMins
                  const startGateP1 = isStartSeg || p1L === 0
                  return [
                    mkPart(p0L, p0R, `${seg.key}-p0`, /*showStart*/ false, /*showEnd*/ endGateP0, { forceEndOuter: true }),
                    mkPart(p1L, p1R, `${seg.key}-p1`, /*showStart*/ startGateP1, /*showEnd*/ false, { forceStartOuter: true })
                  ]
                }else{
                  // Entire remainder fits before band end
                  const p0L = a, p0R = a+lenFirst
                  const endGateP0 = isEndSeg || p0R === totalMins
                  return [ mkPart(p0L, p0R, `${seg.key}-p0`, /*showStart*/ false, /*showEnd*/ endGateP0, { forceEndOuter: true }) ]
                }
              }
            })
          })}

          {/* Band hover highlight when over background (not over a chip) */}
          {hoverBand && !hoverGroupId && (
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: dark? 'inset 0 0 0 2px rgba(255,255,255,0.35)':'inset 0 0 0 2px rgba(0,0,0,0.35)' }} />
          )}

          {/* Now line and optional label */}
          {showNow && showNowLine && (
            <div className={["absolute -translate-x-1/2 inset-y-0", dark?"bg-red-400":"bg-red-500"].join(' ')} style={{ left: `${nowLeft}%`, width: 1 }} />
          )}
          {showNow && showNowLabel && (
            <div
              className={["absolute -translate-x-1/2 top-0 mt-0.5 px-1.5 py-0.5 rounded text-white whitespace-nowrap", dark?"bg-red-400 text-black":"bg-red-500 text-white"].join(' ')}
              style={{ left: `${nowLeft}%`, fontSize: NOW_TAG_F }}
            >
              {minToHHMM(now.minutes)}
            </div>
          )}
        </div>
      </div>

      {/* Bottom labels: optional date range */}
      {showWeekLabel && (
        <div className={["mt-1 text-xs", textSub].join(' ')}>
          {fmtYMD(weekStartDate)} – {fmtYMD(addDays(weekStartDate,6))}
        </div>
      )}
    </div>
  )
}
